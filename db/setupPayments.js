// db/setupPayments.js
import { pool } from './db.js';

export async function setupPaymentsColumns() {
  try {
    // Check if payment columns exist, if not add them
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='transactions' AND column_name='payment_id'
    `);

    if (result.rows.length === 0) {
      // Add payment tracking columns to transactions table
      await pool.query(`
        ALTER TABLE transactions 
        ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS order_id VARCHAR(255),
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'pending'
      `);
      console.log('✓ Payment columns added to transactions table');
    } else {
      console.log('✓ Payment columns already exist in transactions table');
    }

    return true;
  } catch (err) {
    console.error('✗ Error setting up payment columns:', err.message);
    return false;
  }
}
