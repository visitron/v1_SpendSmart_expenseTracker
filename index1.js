// index.js
import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { pool } from './db/db.js';
import { getFinancialSummary } from './services/gemini.js';
import { createServer } from 'http';
import { Server as SocketIO } from 'socket.io';

dotenv.config();

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
  res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email]);

  if (userResult.rows.length === 0) {
    return res.render('login', { error: 'Invalid email' });
  }

  const user = userResult.rows[0];
  const isMatch = await bcrypt.compare(password, user.password_hash);

  if (!isMatch) {
    return res.render('login', { error: 'Incorrect password' });
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
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// -------------------------
// Dashboard route (home)
// -------------------------
app.get('/', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  const result = await pool.query(`
    SELECT transactions.*, categories.category_name
    FROM transactions
    LEFT JOIN categories ON transactions.category_id = categories.id
    WHERE transactions.user_id = $1
    ORDER BY transaction_time DESC
    
  `, [userId]);

  let transactions = result.rows;

  const income = transactions.filter(t => t.transaction_type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const expense = transactions.filter(t => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const balance = income - expense;

  const result1 = await pool.query(`
    SELECT transactions.*, categories.category_name
    FROM transactions
    LEFT JOIN categories ON transactions.category_id = categories.id
    WHERE transactions.user_id = $1
    ORDER BY transaction_time DESC
    LIMIT 5
  `, [userId]);

  const transactions1 = result1.rows;
  transactions = transactions1;
  res.render('index3', {
    user: req.session.user,
    transactions,
    summary: { income, expense, balance }
  });

});


//transaction route
app.get('/transactions', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  const result = await pool.query(`
    SELECT transactions.*, categories.category_name
    FROM transactions
    LEFT JOIN categories ON transactions.category_id = categories.id
    WHERE transactions.user_id = $1
    ORDER BY transaction_time DESC
    
  `, [userId]);

  let transactions = result.rows;

  res.render('allTransactions', {
    
    transactions
    
  });

});

// -------------------------
// Add transaction routes
// -------------------------
app.get('/add', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;
  const categories = await pool.query(`
    SELECT * FROM categories
    WHERE is_default = true OR user_id = $1
  `, [userId]);

  res.render('addTransaction', { categories: categories.rows });
});

app.post('/add', ensureAuth, async (req, res) => {
  try {
    const {
      amount,
      transaction_type,
      description,
      category_id,
      transaction_time
    } = req.body;

    const userId = req.session.user.id;
    const now = new Date();

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
      transaction_type,
      description,
      category_id,
      userId,
      new Date(transaction_time),
      now,
      now
    ]);

    res.redirect('/');
  } catch (err) {
    console.error('Error adding transaction:', err);
    res.send('Something went wrong while saving the transaction.');
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
