[README.md](https://github.com/user-attachments/files/22311144/README.md)
# SpendSmart Expense Tracker

SpendSmart is a simple expense tracking web application that helps users manage and track their expenses.  
It is built with **Node.js**, **Express.js**, **PostgreSQL (via Neon Cloud)**, and **EJS** for server-side rendering.  

---

## 🚀 Features

- User registration & login (with password hashing)  
- Add, edit, and delete transactions  
- Categorize expenses (default + custom categories)  
- View all expenses in a structured list  
- Cloud-hosted PostgreSQL database (Neon)  
- Experimental AI chatbot integration (Gemini API)  

---

## 📂 Project Structure

```
v1_SpendSmart_expenseTracker/
├── index1.js              # Main server entry point
├── package.json           # Dependencies & scripts
├── db/
│   └── db.js              # Database connection logic
├── public/
│   └── css/
│       └── styles.css     # Styling
├── services/
│   ├── chatBot.js         # Chatbot logic
│   └── gemini.js          # AI service integration
├── views/
│   ├── addTransaction.ejs # Add transaction page
│   ├── allTransactions.ejs# List of transactions
│   ├── editTransaction.ejs# Edit a transaction
│   ├── index3.ejs         # Dashboard / Home page
│   ├── login.ejs          # Login form
│   └── register.ejs       # Registration form
└── .gitignore
```

---

## ⚙️ Installation & Setup

### 1. Clone the repository
```bash
git clone https://github.com/visitron/v1_SpendSmart_expenseTracker.git
cd v1_SpendSmart_expenseTracker
```

### 2. Install dependencies
Make sure you have **Node.js** (v16 or later recommended).  
```bash
npm install
```

### 3. Setup PostgreSQL (Neon Cloud)

1. Create a free [Neon account](https://neon.tech/).  
2. Create a new **PostgreSQL database**.  
3. Get the **connection string** (something like `postgres://username:password@host/dbname`).  
4. Create the required tables:

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Categories table
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL,
  user_id INT,
  is_default BOOLEAN DEFAULT FALSE
);

-- Insert default categories
INSERT INTO categories (category_name, is_default) VALUES
('Food', TRUE),
('Transport', TRUE),
('Entertainment', TRUE),
('Bills', TRUE),
('Shopping', TRUE),
('Healthcare', TRUE),
('Salary', TRUE),
('Other', TRUE);

-- Transactions table
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  category_id INT REFERENCES categories(id),
  amount NUMERIC(10,2) NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  description TEXT,
  transaction_time TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

---

### 4. Setup environment variables

Create a `.env` file in the project root:

```ini
PORT=3000
DATABASE_URL=postgres://username:password@host/dbname
spendsmart-secret-key=your-secret-session-key
GEMINI_API_KEY=your-gemini-api-key
```

---

### 5. Run the application

Start the development server:

```bash
node index1.js
```

The app should now be running at:
```
http://localhost:3000
```

---

## 🧪 Usage

- Register at `/register`  
- Login at `/login`  
- Add transactions at `/addTransaction`  
- View all transactions at `/allTransactions`  
- Edit or delete transactions as needed  

---

## 📌 Future Improvements

- Add expense analytics (charts & graphs)  
- Enhance security with JWT/session management  
- Improve chatbot features with Gemini AI  
- Deploy on Render/Heroku + Neon for production  

---

## 📝 License

This project is open-source and available under the [MIT License](LICENSE).  
