import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import bcrypt from 'bcrypt';
import { pool } from './db/db.js';

import { getFinancialSummary } from './services/gemini.js';

import { setupSecurity } from "./security.js";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
setupSecurity(app);
// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: 'spendsmart-secret-key', // store in .env for production
  resave: false,
  saveUninitialized: false
}));

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

// =================== ROUTES ===================

// 🔐 Register
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

// 🔑 Login
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

  res.redirect('/');
});

// 🚪 Logout
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

// 📊 List transactions


app.get('/', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;

  const result = await pool.query(`
    SELECT transactions.*, categories.category_name
    FROM transactions
    LEFT JOIN categories ON transactions.category_id = categories.id
    WHERE transactions.user_id = $1
    ORDER BY transaction_time DESC
  `, [userId]);

  const transactions = result.rows;

  const income = transactions.filter(t => t.transaction_type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const expense = transactions.filter(t => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const balance = income - expense;

  const summaryText = await getFinancialSummary(transactions);

  res.render('index', {
    user: req.session.user,
    transactions,
    summary: { income, expense, balance },
    summaryText // 👈 make sure to use it in index.ejs
  });
});



// ➕ Add transaction form
app.get('/add', ensureAuth, async (req, res) => {
  const userId = req.session.user.id;

  const categories = await pool.query(`
    SELECT * FROM categories
    WHERE is_default = true OR user_id = $1
  `, [userId]);

  res.render('addTransaction', { categories: categories.rows });
});

app.post('/add', ensureAuth, async (req, res) => {
  const {
    amount,
    transaction_type,
    description,
    category_id,
    transaction_time
  } = req.body;

  const userId = req.session.user.id;
  const now = new Date();

  try {
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
      new Date(transaction_time), // Ensure it's in correct format
      now,
      now
    ]);

    res.redirect('/');
  } catch (err) {
    console.error('Error adding transaction:', err);
    res.send('Something went wrong while saving the transaction.');
  }
});


// 📝 Save transaction
// (Duplicate POST '/add' route removed to prevent override)

// ✏️ Edit form
app.get('/edit/:id', ensureAuth, async (req, res) => {
  const txId = req.params.id;
  const userId = req.session.user.id;

  const tx = await pool.query(`
    SELECT * FROM transactions
    WHERE id = $1 AND user_id = $2
  `, [txId, userId]);

  if (tx.rows.length === 0) {
    return res.send('Transaction not found or access denied.');
  }

  const categories = await pool.query(`
    SELECT * FROM categories
    WHERE is_default = true OR user_id = $1
  `, [userId]);

  res.render('editTransaction', {
    transaction: tx.rows[0],
    categories: categories.rows
  });
});

// 🛠️ Update transaction
app.post('/edit/:id', ensureAuth, async (req, res) => {
  const txId = req.params.id;
  const userId = req.session.user.id;
  const { amount, transaction_type, description, category_id } = req.body;

  const existing = await pool.query(`
    SELECT * FROM transactions WHERE id = $1 AND user_id = $2
  `, [txId, userId]);

  if (existing.rows.length === 0) {
    return res.send('Unauthorized update attempt.');
  }

  await pool.query(`
    UPDATE transactions
    SET amount = $1, transaction_type = $2, description = $3, category_id = $4
    WHERE id = $5
  `, [amount, transaction_type, description, category_id, txId]);

  res.redirect('/');
});

// ❌ Delete
app.post('/delete/:id', ensureAuth, async (req, res) => {
  const txId = req.params.id;
  const userId = req.session.user.id;

  await pool.query(`
    DELETE FROM transactions
    WHERE id = $1 AND user_id = $2
  `, [txId, userId]);

  res.redirect('/');
});

// ✅ Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`SpendSmart running at http://localhost:${port}`);
});
