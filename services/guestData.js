// services/guestData.js
// In-memory storage for guest user data (temporary, cleared on session end)

const guestSessions = new Map();

export function createGuestSession(guestId) {
  const guestData = {
    id: guestId,
    sessionId: guestId,
    isGuest: true,
    createdAt: new Date(),
    transactions: [],
    categories: [
      { id: 1, category_name: 'Food', is_default: true },
      { id: 2, category_name: 'Transport', is_default: true },
      { id: 3, category_name: 'Shopping', is_default: true },
      { id: 4, category_name: 'Entertainment', is_default: true },
      { id: 5, category_name: 'Utilities', is_default: true },
      { id: 6, category_name: 'Healthcare', is_default: true },
      { id: 7, category_name: 'Salary', is_default: true },
      { id: 8, category_name: 'Freelance', is_default: true },
    ]
  };

  guestSessions.set(guestId, guestData);
  return guestData;
}

export function getGuestSession(guestId) {
  return guestSessions.get(guestId);
}

export function addGuestTransaction(guestId, transaction) {
  const session = guestSessions.get(guestId);
  if (!session) return null;

  const newTransaction = {
    ...transaction,
    id: session.transactions.length + 1,
    created_at: new Date(),
    updated_at: new Date()
  };

  session.transactions.push(newTransaction);
  return newTransaction;
}

export function getGuestTransactions(guestId) {
  const session = guestSessions.get(guestId);
  return session ? session.transactions : [];
}

export function updateGuestTransaction(guestId, transactionId, updates) {
  const session = guestSessions.get(guestId);
  if (!session) return null;

  const transaction = session.transactions.find(t => t.id === parseInt(transactionId));
  if (!transaction) return null;

  Object.assign(transaction, updates, { updated_at: new Date() });
  return transaction;
}

export function deleteGuestTransaction(guestId, transactionId) {
  const session = guestSessions.get(guestId);
  if (!session) return false;

  const index = session.transactions.findIndex(t => t.id === parseInt(transactionId));
  if (index === -1) return false;

  session.transactions.splice(index, 1);
  return true;
}

export function getGuestCategories(guestId) {
  const session = guestSessions.get(guestId);
  return session ? session.categories : [];
}

export function clearGuestSession(guestId) {
  guestSessions.delete(guestId);
  return true;
}

export function getGuestStats(guestId) {
  const session = guestSessions.get(guestId);
  if (!session) return null;

  const transactions = session.transactions;
  
  const income = transactions
    .filter(t => t.transaction_type === 'income')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  const expense = transactions
    .filter(t => t.transaction_type === 'expense')
    .reduce((sum, t) => sum + parseFloat(t.amount), 0);

  return {
    income,
    expense,
    balance: income - expense,
    transactionCount: transactions.length
  };
}

// Cleanup old guest sessions after 1 hour of inactivity
export function startSessionCleanup() {
  setInterval(() => {
    const now = new Date();
    for (const [guestId, session] of guestSessions.entries()) {
      const age = now - session.createdAt;
      const oneHour = 60 * 60 * 1000;
      
      // Clear sessions older than 1 hour
      if (age > oneHour) {
        guestSessions.delete(guestId);
        console.log(`✓ Cleaned up guest session: ${guestId}`);
      }
    }
  }, 5 * 60 * 1000); // Run cleanup every 5 minutes
}
