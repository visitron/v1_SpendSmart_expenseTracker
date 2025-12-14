// db/setupBudgets.js
import { pool } from './db.js';

export async function setupBudgetsTable() {
  try {
    // Create budgets table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
        amount DECIMAL(10, 2) NOT NULL,
        budget_type VARCHAR(50) NOT NULL DEFAULT 'monthly',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('✓ Budgets table created/verified successfully');
    return true;
  } catch (err) {
    console.error('✗ Error creating budgets table:', err.message);
    return false;
  }
}

export async function initializeBudgetsForUser(userId) {
  try {
    // Check if user already has default budgets
    const existing = await pool.query(
      'SELECT COUNT(*) as count FROM budgets WHERE user_id = $1 AND category_id IS NULL',
      [userId]
    );

    if (existing.rows[0].count === 0) {
      // Create default overall budget placeholder (0 = no limit set)
      await pool.query(
        `INSERT INTO budgets (user_id, category_id, amount, budget_type)
         VALUES ($1, NULL, 0, 'overall')`,
        [userId]
      );
    }

    return true;
  } catch (err) {
    console.error('Error initializing budgets for user:', err.message);
    return false;
  }
}
