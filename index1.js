// index.js
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { pool } from './db/db.js';
import { setupBudgetsTable, initializeBudgetsForUser } from './db/setupBudgets.js';
import { setupPaymentsColumns } from './db/setupPayments.js';
import { getFinancialSummary } from './services/gemini.js';
import { createOrder, verifyPaymentSignature, fetchPaymentDetails, isRazorpayEnabled } from './services/razorpay.js';
import { createGuestSession, getGuestSession, addGuestTransaction, getGuestTransactions, deleteGuestTransaction, updateGuestTransaction, getGuestCategories, clearGuestSession, getGuestStats, startSessionCleanup } from './services/guestData.js';
import crypto from 'crypto';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';

dotenv.config();

// Initialize database tables on startup
(async () => {
  await setupBudgetsTable();
  await setupPaymentsColumns();
})();

// Start guest session cleanup
startSessionCleanup();

const app = express();
const port = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// session (same as before) - consider using a persistent store in prod
const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || 'spendsmart-secret-key',
  resave: false,
  saveUninitialized: false
});

app.use(sessionMiddleware);

// Expose user to views
app.use((req, res, next) => {
  res.locals.user = req.session.user;
  next();
});

// Auth middleware
function ensureAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// -------------------------
// Authentication routes (unchanged logic from your original file)
// -------------------------
app.get('/register', (req, res) => {
  res.render('register', { error: null });
});

app.post('/register', async (req, res) => {
  const { full_name, email, password, confirm_password } = req.body;

  if (!full_name || !email || !password || !confirm_password) {
    return res.render('register', { error: 'All fields are required' });
  }

  if (password !== confirm_password) {
    return res.render('register', { error: 'Passwords do not match' });
  }

  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.render('register', { error: 'Email already in use' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await pool.query(
      `INSERT INTO users (full_name, email, password_hash, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())`,
      [full_name, email, hashedPassword]
    );

    res.redirect('/login');
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { error: 'Something went wrong. Try again.' });
  }
});

app.get('/login', (req, res) => {
  res.redirect('/');
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

  if (userResult.rows.length === 0) {
    return res.render('landing', { error: 'Invalid email' });
  }

  const user = userResult.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    return res.render('landing', { error: 'Incorrect password' });
  }

  req.session.user = {
    id: user.id,
    full_name: user.full_name,
    email: user.email
  };
  console.log('User logged in:', req.session.user);

  res.redirect('/');
});

app.get('/logout', (req, res) => {
  if (req.session.user?.isGuest) {
    clearGuestSession(req.session.user.id);
  }
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// -------------------------
// Guest Login Routes
// -------------------------
app.post('/guest-login', (req, res) => {
  // Generate unique guest ID
  const guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  // Create guest session
  createGuestSession(guestId);
  
  // Set session
  req.session.user = {
    id: guestId,
    full_name: 'Guest User',
    email: 'guest@spendsmart.com',
    isGuest: true
  };

  console.log('Guest logged in:', guestId);
  res.redirect('/');
});

app.get('/guest-logout', (req, res) => {
  if (req.session.user?.isGuest) {
    clearGuestSession(req.session.user.id);
  }
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// -------------------------
// Dashboard route (home)
// -------------------------
app.get('/', async (req, res) => {
  // If not authenticated, show landing page
  if (!req.session.user) {
    return res.render('landing', { error: null });
  }
  
  // If authenticated, show dashboard
  return handleDashboard(req, res);
});

// Dashboard handler function
async function handleDashboard(req, res) {
  const userId = req.session.user.id;
  let transactions, income, expense, balance, transactions1;

  // Check if user is guest
  if (req.session.user.isGuest) {
    // Get guest data from in-memory storage
    const guestTransactions = getGuestTransactions(userId);
    transactions = guestTransactions;

    const stats = getGuestStats(userId);
    income = stats.income;
    expense = stats.expense;
    balance = stats.balance;
    transactions1 = guestTransactions.slice(0, 5).reverse();
  } else {
    // Get data from database for regular users
    const result = await pool.query(`
      SELECT transactions.*, categories.category_name
      FROM transactions
      LEFT JOIN categories ON transactions.category_id = categories.id
      WHERE transactions.user_id = $1
      ORDER BY transaction_time DESC
      
    `, [userId]);

    transactions = result.rows;

    income = transactions.filter(t => t.transaction_type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    expense = transactions.filter(t => t.transaction_type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    balance = income - expense;

    const result1 = await pool.query(`
      SELECT transactions.*, categories.category_name
      FROM transactions
      LEFT JOIN categories ON transactions.category_id = categories.id
      WHERE transactions.user_id = $1
      ORDER BY transaction_time DESC
      LIMIT 5
    `, [userId]);

    transactions1 = result1.rows;
  }

  transactions = transactions1;
  res.render('index3', {
    user: req.session.user,
    transactions,
    summary: { income, expense, balance }
  });
}


//transaction route
app.get('/transactions', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  let transactions;

  try {
    // Check if guest user
    if (req.session.user.isGuest) {
      transactions = getGuestTransactions(userId);
    } else {
      // Get from database
      const result = await pool.query(`
        SELECT transactions.*, categories.category_name
        FROM transactions
        LEFT JOIN categories ON transactions.category_id = categories.id
        WHERE transactions.user_id = $1
        ORDER BY transaction_time DESC
      `, [userId]);
      transactions = result.rows;
    }

    res.render('allTransactions', {
      transactions
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    res.send('Error loading transactions: ' + err.message);
  }
});

// -------------------------
// Reports route with category breakdown
// -------------------------
app.get('/reports', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { startDate, endDate, type } = req.query;

  try {
    let transactions;

    // Check if guest user
    if (req.session.user.isGuest) {
      // Get guest transactions
      let guestTransactions = getGuestTransactions(userId);
      transactions = guestTransactions;

      // Apply filters to guest data
      if (startDate) {
        const start = new Date(startDate);
        transactions = transactions.filter(t => new Date(t.transaction_time) >= start);
      }
      if (endDate) {
        const end = new Date(endDate);
        transactions = transactions.filter(t => new Date(t.transaction_time) <= end);
      }
      if (type && (type === 'income' || type === 'expense')) {
        transactions = transactions.filter(t => t.transaction_type === type);
      }
    } else {
      // Get from database
      let query = `
        SELECT t.*, c.category_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.user_id = $1
      `;
      const params = [userId];

      // Apply date filters if provided
      if (startDate) {
        query += ` AND t.transaction_time >= $${params.length + 1}`;
        params.push(new Date(startDate));
      }
      if (endDate) {
        query += ` AND t.transaction_time <= $${params.length + 1}`;
        params.push(new Date(endDate));
      }
      if (type && (type === 'income' || type === 'expense')) {
        query += ` AND t.transaction_type = $${params.length + 1}`;
        params.push(type);
      }

      query += ` ORDER BY t.transaction_time DESC`;

      const result = await pool.query(query, params);
      transactions = result.rows;
    }

    // Group transactions by category and calculate totals
    const categoryData = {};
    transactions.forEach(t => {
      const cat = t.category_name || 'Uncategorized';
      if (!categoryData[cat]) {
        categoryData[cat] = { income: 0, expense: 0, total: 0 };
      }
      const amount = parseFloat(t.amount);
      if (t.transaction_type === 'income') {
        categoryData[cat].income += amount;
      } else {
        categoryData[cat].expense += amount;
      }
      categoryData[cat].total += amount;
    });

    // Calculate overall summary
    const income = transactions.filter(t => t.transaction_type === 'income')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const expense = transactions.filter(t => t.transaction_type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);

    res.render('reports', {
      transactions,
      categoryData,
      summary: { income, expense, balance: income - expense },
      filters: { startDate, endDate, type }
    });
  } catch (err) {
    console.error('Error fetching reports:', err);
    res.send('Error generating reports');
  }
});

// -------------------------
// Budgets routes
// -------------------------
app.get('/budgets', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;

  try {
    // Check if guest user
    if (req.session.user.isGuest) {
      // Guest budgets - show message that budgets are not available for guests
      return res.render('budgets-guest', {
        isGuest: true,
        message: 'Budget management is a premium feature for registered users. Create a free account to set and track your budgets!'
      });
    }

    // Regular user - fetch or create overall budget
    let budgetResult = await pool.query(
      `SELECT * FROM budgets WHERE user_id = $1 AND category_id IS NULL`,
      [userId]
    );
    let overallBudget = budgetResult.rows[0] || null;
    
    // If no overall budget exists, create a default one with 0 amount (not set)
    if (!overallBudget) {
      await pool.query(
        `INSERT INTO budgets (user_id, category_id, amount, budget_type)
         VALUES ($1, NULL, 0, 'overall')`,
        [userId]
      );
      budgetResult = await pool.query(
        `SELECT * FROM budgets WHERE user_id = $1 AND category_id IS NULL`,
        [userId]
      );
      overallBudget = budgetResult.rows[0];
    }
    
    // Only treat as valid if amount > 0
    if (overallBudget && parseFloat(overallBudget.amount) > 0) {
      overallBudget.amount = parseFloat(overallBudget.amount);
    } else {
      overallBudget = null;
    }

    // Fetch category budgets
    const categoryBudgetsResult = await pool.query(
      `SELECT b.*, c.category_name 
       FROM budgets b
       LEFT JOIN categories c ON b.category_id = c.id
       WHERE b.user_id = $1 AND b.category_id IS NOT NULL
       ORDER BY c.category_name`,
      [userId]
    );
    const categoryBudgets = categoryBudgetsResult.rows.map(budget => ({
      ...budget,
      amount: parseFloat(budget.amount)
    }));

    // Get all categories
    const categoriesResult = await pool.query(
      `SELECT * FROM categories WHERE is_default = true OR user_id = $1 ORDER BY category_name`,
      [userId]
    );
    const allCategories = categoriesResult.rows;

    // Calculate current spending (this month)
    const currentMonth = new Date();
    const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const monthEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

    const spendingResult = await pool.query(
      `SELECT category_id, SUM(amount) as total
       FROM transactions
       WHERE user_id = $1 AND transaction_type = 'expense'
       AND transaction_time >= $2 AND transaction_time <= $3
       GROUP BY category_id`,
      [userId, monthStart, monthEnd]
    );
    const spending = {};
    spendingResult.rows.forEach(row => {
      spending[row.category_id] = parseFloat(row.total);
    });

    // Calculate total expenses
    const totalExpenseResult = await pool.query(
      `SELECT SUM(amount) as total FROM transactions
       WHERE user_id = $1 AND transaction_type = 'expense'
       AND transaction_time >= $2 AND transaction_time <= $3`,
      [userId, monthStart, monthEnd]
    );
    const totalExpense = parseFloat(totalExpenseResult.rows[0].total) || 0;

    // Check for alerts
    const alerts = [];
    if (overallBudget && totalExpense > overallBudget.amount) {
      alerts.push({
        type: 'overall',
        category: 'Overall Budget',
        budget: overallBudget.amount,
        spent: totalExpense,
        percentage: Math.round((totalExpense / overallBudget.amount) * 100)
      });
    }

    categoryBudgets.forEach(budget => {
      const catId = budget.category_id;
      const spent = spending[catId] || 0;
      if (spent > budget.amount) {
        alerts.push({
          type: 'category',
          category: budget.category_name,
          budget: budget.amount,
          spent: spent,
          percentage: Math.round((spent / budget.amount) * 100)
        });
      }
    });

    res.render('budgets', {
      overallBudget,
      categoryBudgets,
      allCategories,
      spending,
      totalExpense,
      alerts,
      monthStart: monthStart.toLocaleDateString('en-IN'),
      monthEnd: monthEnd.toLocaleDateString('en-IN')
    });
  } catch (err) {
    console.error('Error fetching budgets:', err);
    res.send('Error loading budgets');
  }
});

// POST: Set overall budget
app.post('/budgets/overall', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { amount } = req.body;

  try {
    const existing = await pool.query(
      `SELECT * FROM budgets WHERE user_id = $1 AND category_id IS NULL`,
      [userId]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE budgets SET amount = $1 WHERE user_id = $2 AND category_id IS NULL`,
        [amount, userId]
      );
    } else {
      await pool.query(
        `INSERT INTO budgets (user_id, amount, created_at) VALUES ($1, $2, NOW())`,
        [userId, amount]
      );
    }

    res.redirect('/budgets');
  } catch (err) {
    console.error('Error setting overall budget:', err);
    res.send('Error setting budget');
  }
});

// POST: Set category budget
app.post('/budgets/category', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { categoryId, amount } = req.body;

  try {
    const existing = await pool.query(
      `SELECT * FROM budgets WHERE user_id = $1 AND category_id = $2`,
      [userId, categoryId]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE budgets SET amount = $1 WHERE user_id = $2 AND category_id = $3`,
        [amount, userId, categoryId]
      );
    } else {
      await pool.query(
        `INSERT INTO budgets (user_id, category_id, amount, created_at) VALUES ($1, $2, $3, NOW())`,
        [userId, categoryId, amount]
      );
    }

    res.redirect('/budgets');
  } catch (err) {
    console.error('Error setting category budget:', err);
    res.send('Error setting budget');
  }
});

// DELETE: Remove budget
app.post('/budgets/delete/:budgetId', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  const { budgetId } = req.params;

  try {
    await pool.query(
      `DELETE FROM budgets WHERE id = $1 AND user_id = $2`,
      [budgetId, userId]
    );

    res.redirect('/budgets');
  } catch (err) {
    console.error('Error deleting budget:', err);
    res.send('Error deleting budget');
  }
});

// -------------------------
// Add transaction routes
// -------------------------
app.get('/add', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  let categories;

  // Check if guest user
  if (req.session.user.isGuest) {
    // Get guest categories
    categories = getGuestCategories(userId);
  } else {
    // Get database categories
    const result = await pool.query(`
      SELECT * FROM categories
      WHERE is_default = true OR user_id = $1
    `, [userId]);
    categories = result.rows;
  }

  res.render('addTransaction', { categories });
});

app.post('/add', ensureAuth, async (req, res) => {
  try {
    const {
      amount,
      transaction_type,
      transactionType,
      description,
      category_id,
      categoryId,
      transaction_time,
      transactionDate
    } = req.body;

    const userId = req.session.user.id;
    const now = new Date();

    // Use appropriate field names (handle both regular and payment form fields)
    const type = transaction_type || transactionType;
    const catId = category_id || categoryId;
    const time = transaction_time || transactionDate;

    // Check if guest user
    if (req.session.user.isGuest) {
      // Add to guest data
      addGuestTransaction(userId, {
        amount: parseFloat(amount),
        transaction_type: type,
        description: description || '',
        category_id: parseInt(catId),
        transaction_time: new Date(time)
      });
    } else {
      // Add to database for regular users
      await pool.query(`
        INSERT INTO transactions (
          amount,
          transaction_type,
          description,
          category_id,
          user_id,
          transaction_time,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        amount,
        type,
        description,
        catId,
        userId,
        new Date(time),
        now,
        now
      ]);
    }

    res.redirect('/');
  } catch (err) {
    console.error('Error adding transaction:', err);
    res.send('Something went wrong while saving the transaction.');
  }
});

// -------------------------
// Payment Routes (Razorpay Integration)
// -------------------------

// Step 1: Initiate Payment - Show payment page
app.post('/initiate-payment', ensureAuth, async (req, res) => {
  try {
    const { amount, transactionType, categoryId, description, transactionDate } = req.body;
    const userId = req.session.user.id;

    // Check if Razorpay is enabled
    if (!isRazorpayEnabled) {
      return res.render('payment-unavailable', {
        message: 'Payment gateway is being set up and will be available soon.'
      });
    }

    // Fetch user details
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    // Fetch category name
    const categoryResult = await pool.query('SELECT category_name FROM categories WHERE id = $1', [categoryId]);
    const categoryName = categoryResult.rows[0] ? categoryResult.rows[0].category_name : 'Unknown';

    // Render payment page
    res.render('payment', {
      amount,
      transactionType,
      categoryId,
      category: categoryName,
      description,
      transactionDate,
      userName: user.full_name,
      userEmail: user.email,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('Error initiating payment:', err);
    res.send('Error initiating payment: ' + err.message);
  }
});

// Step 2: Create Razorpay Order
app.post('/create-payment-order', ensureAuth, async (req, res) => {
  try {
    if (!isRazorpayEnabled) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not available at the moment. Please try again later.'
      });
    }
    const { amount, description, userEmail, fullName } = req.body;

    // Create order with Razorpay
    const order = await createOrder(
      amount,
      'INR',
      `receipt_${Date.now()}`,
      {
        user_email: userEmail,
        user_name: fullName,
        description: description
      }
    );

    res.json({
      success: true,
      orderId: order.id,
      message: 'Order created successfully'
    });
  } catch (err) {
    console.error('Error creating payment order:', err);
    res.status(500).json({
      success: false,
      message: 'Error creating payment order: ' + err.message
    });
  }
});

// Step 3: Verify Payment & Record Transaction
app.post('/verify-payment', ensureAuth, async (req, res) => {
  try {
    if (!isRazorpayEnabled) {
      return res.status(503).json({
        success: false,
        message: 'Payment gateway is not available at the moment.'
      });
    }

    const {
      orderId,
      paymentId,
      signature,
      amount,
      transactionType,
      categoryId,
      description,
      transactionDate
    } = req.body;

    const userId = req.session.user.id;

    // Verify payment signature
    const body = orderId + '|' + paymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== signature) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed. Invalid signature.'
      });
    }

    // Fetch payment details from Razorpay to confirm
    try {
      const paymentDetails = await fetchPaymentDetails(paymentId);
      
      // Verify amount matches
      if (paymentDetails.amount !== Math.round(amount * 100)) {
        return res.status(400).json({
          success: false,
          message: 'Payment amount mismatch.'
        });
      }

      // Verify payment status
      if (paymentDetails.status !== 'captured') {
        return res.status(400).json({
          success: false,
          message: 'Payment status is not captured.'
        });
      }
    } catch (fetchErr) {
      console.warn('Warning: Could not fetch payment details from Razorpay:', fetchErr.message);
      // Continue anyway as signature verification passed
    }

    // Record transaction in database
    const now = new Date();
    const transactionResult = await pool.query(`
      INSERT INTO transactions (
        amount,
        transaction_type,
        description,
        category_id,
        user_id,
        transaction_time,
        payment_id,
        order_id,
        payment_status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
      amount,
      transactionType,
      description,
      categoryId,
      userId,
      new Date(transactionDate),
      paymentId,
      orderId,
      'captured',
      now,
      now
    ]);

    const transactionId = transactionResult.rows[0].id;

    res.json({
      success: true,
      transactionId: transactionId,
      message: 'Payment verified and transaction recorded successfully'
    });
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.status(500).json({
      success: false,
      message: 'Error verifying payment: ' + err.message
    });
  }
});

// -------------------------
// Non-stream Chat REST endpoint (for fallback)
// -------------------------
app.post('/api/chat', ensureAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // 1) Fetch recent transactions
    const result = await pool.query(
      `SELECT t.amount, t.transaction_type, t.transaction_time, t.description,
              c.category_name AS category
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1
       ORDER BY t.transaction_time DESC
       LIMIT 50`,
      [userId]
    );
    const transactions = result.rows;

    // 2) Generate structured summary
    const summary = await getFinancialSummary(transactions).catch(err => {
      console.error('Summary generation failed:', err);
      return null;
    });

    // 3) Build prompt
    const systemPrompt = `You are SpendSmart, a helpful personal finance assistant for Indian users. Use only the provided summary and transactions to answer. Be concise. Use ₹ for currency.`;
    const context = `Summary: ${JSON.stringify(summary)}\nRecent transactions:\n${transactions.map(
      t => `${t.transaction_type} of ₹${t.amount} on ${new Date(t.transaction_time).toLocaleDateString('en-IN')} (${t.category || 'Uncategorized'}) — ${t.description || ''}`
    ).join('\n')}`;

    const fullPrompt = [systemPrompt, context, `User: ${message}`, 'Assistant:'].join('\n\n');

    // 4) Call Gemini
    const { GoogleGenAI } = await import('@google/genai');
    const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const resp = await genAI.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: fullPrompt
    });

    const assistantText = resp && resp.text ? resp.text.trim() : 'Sorry, I could not generate a response.';

    // 5) Send back response
    res.json({ reply: assistantText });

  } catch (err) {
    console.error('Chat REST error:', err);
    if (err.status === 503) {
      return res.status(503).json({ error: 'Gemini is overloaded. Please try again later.' });
    }
    res.status(500).json({ error: 'Something went wrong' });
  }
});


// -------------------------
// Create HTTP server + Socket.IO
// -------------------------
const httpServer = createServer(app);

// Attach session middleware to http server so socket handlers can reuse it (optional)
const io = new SocketIO(httpServer, {
  cors: {
    origin: "*"
  }
});

// NOTE: we are not attaching express-session middleware to socket.io in this example.
// Authentication is done by the client sending the userId along with the message event.
// In production, use a shared session store or token-based auth to secure sockets.

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  // Listen for incoming chat messages from client
  // payload: { userId: <number>, message: <string> }
  socket.on('chat_message', async (payload) => {
    try {
      if (!payload || !payload.userId || !payload.message) {
        socket.emit('chat_error', { error: 'Invalid payload' });
        return;
      }

      const userId = payload.userId;
      const message = payload.message;

      // 1) Fetch user's recent transactions
      const result = await pool.query(
        `SELECT t.amount, t.transaction_type, t.transaction_time, t.description,
                c.category_name AS category
         FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = $1
         ORDER BY t.transaction_time DESC
         LIMIT 50`,
        [userId]
      );
      const transactions = result.rows;

      // 2) Get structured summary (we use your existing service)
      const summary = await getFinancialSummary(transactions).catch(err => {
        console.error('Summary generation failed:', err);
        return null;
      });

      // 3) Build prompt/context for Gemini
      const systemPrompt = `You are SpendSmart, a helpful personal finance assistant for Indian users. Use the provided summary and transactions only. Answer concisely. Use ₹ for currency.`;
      const context = `Context summary: ${JSON.stringify(summary)}\nRecent transactions:\n${transactions.map(t => `${t.transaction_type} of ₹${t.amount} on ${new Date(t.transaction_time).toLocaleDateString('en-IN')} (${t.category || 'Uncategorized'}) — ${t.description || ''}`).join('\n')}`;

      const fullPrompt = [systemPrompt, context, `User: ${message}`, 'Assistant:'].join('\n\n');

      // 4) Call Gemini (non-streaming) to get full reply
      // NOTE: we intentionally call the model to get full text then stream it to the client in chunks below.
      // Replace this with SDK streaming call when you enable it (for true token-level streaming).
      const { GoogleGenAI } = await import('@google/genai');
      const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const resp = await genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt
      });

      const assistantText = (resp && resp.text) ? resp.text.trim() : 'Sorry, I could not generate a response.';

      // 5) Stream the assistantText to the client in small chunks
      // We split by words and send groups of words so the UI feels like streaming.
      const words = assistantText.split(/\s+/);
      const chunkSize = 10; // words per chunk (tweak for smoother streaming)
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        socket.emit('ai_chunk', { chunk });
        // small delay to simulate streaming
        await new Promise(r => setTimeout(r, 80));
      }
      // signal finished
      socket.emit('ai_done', { full: assistantText });

    } catch (err) {
      console.error('Socket chat handler error:', err);
      socket.emit('chat_error', { error: 'Server error' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Start server via httpServer so socket.io works
httpServer.listen(port, () => {
  console.log(`SpendSmart running at http://localhost:${port}`);
});
