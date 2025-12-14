// services/razorpay.js
import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Razorpay only if keys are available
export let razorpay = null;
export let isRazorpayEnabled = false;

if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
  try {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    isRazorpayEnabled = true;
    console.log('✓ Razorpay initialized successfully');
  } catch (err) {
    console.warn('⚠ Razorpay initialization failed:', err.message);
    isRazorpayEnabled = false;
  }
} else {
  console.warn('⚠ Razorpay keys not found. Payment feature will be unavailable.');
  console.warn('  Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env to enable payments.');
}

/**
 * Create a Razorpay order for payment
 * @param {number} amount - Amount in paisa (1 INR = 100 paisa)
 * @param {string} currency - Currency code (default: INR)
 * @param {string} receipt - Receipt ID (typically transaction ID)
 * @param {object} notes - Additional notes/metadata
 * @returns {Promise<object>} - Order object from Razorpay
 */
export async function createOrder(amount, currency = 'INR', receipt = '', notes = {}) {
  if (!isRazorpayEnabled) {
    throw new Error('Razorpay is not configured. Please add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to .env');
  }

  try {
    const options = {
      amount: Math.round(amount * 100), // Convert to paisa
      currency,
      receipt: receipt || `receipt_${Date.now()}`,
      notes
    };

    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    throw error;
  }
}

/**
 * Verify payment signature from Razorpay
 * @param {object} paymentData - Payment data with order_id, payment_id, signature
 * @returns {boolean} - True if signature is valid
 */
export function verifyPaymentSignature(paymentData) {
  try {
    const { order_id, payment_id, signature } = paymentData;

    // Create signature string
    const body = order_id + '|' + payment_id;

    // Generate HMAC SHA256
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    // Compare signatures
    return expectedSignature === signature;
  } catch (error) {
    console.error('Error verifying payment signature:', error);
    return false;
  }
}

/**
 * Fetch payment details from Razorpay
 * @param {string} paymentId - Payment ID from Razorpay
 * @returns {Promise<object>} - Payment details
 */
export async function fetchPaymentDetails(paymentId) {
  if (!isRazorpayEnabled) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error('Error fetching payment details:', error);
    throw error;
  }
}

/**
 * Fetch order details from Razorpay
 * @param {string} orderId - Order ID from Razorpay
 * @returns {Promise<object>} - Order details
 */
export async function fetchOrderDetails(orderId) {
  if (!isRazorpayEnabled) {
    throw new Error('Razorpay is not configured');
  }

  try {
    const order = await razorpay.orders.fetch(orderId);
    return order;
  } catch (error) {
    console.error('Error fetching order details:', error);
    throw error;
  }
}
