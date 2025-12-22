# SpendSmart Tracker

A modern personal finance management application that helps users track expenses, manage budgets, and gain financial insights using AI-powered analysis.

## Features

### User Authentication
- User registration with email verification
- Secure login with bcrypt password hashing
- Session-based authentication
- Guest mode for quick expense tracking without registration

### Expense Management
- Add, edit, and delete transactions
- Categorize expenses (Food, Transport, Entertainment, etc.)
- Track transaction types (Income/Expense)
- View all transactions with filtering and sorting
- Real-time transaction updates

### Budget Management
- Set overall monthly budgets
- Create category-specific budget limits
- Track spending vs. budget allocation
- Visual budget progress indicators
- Delete and modify budget rules

### Financial Analytics
- Comprehensive spending reports
- AI-powered financial insights using Google Gemini
- Spending habit analysis
- Smart money-saving recommendations
- Transaction statistics and trends

### Payment Integration
- Razorpay payment gateway integration
- Secure payment processing
- Payment verification and history tracking
- Payment status management

### Guest Features
- Guest mode for anonymous expense tracking
- Temporary session-based data storage
- No registration required
- Auto-cleanup of expired guest sessions

### Real-time Communication
- Socket.io integration for live updates
- Real-time expense notifications

## Tech Stack

### Backend
- **Runtime**: Node.js with ES Modules
- **Framework**: Express.js
- **Database**: PostgreSQL (with Neon support)
- **Authentication**: bcrypt, express-session
- **Payment**: Razorpay API

### Frontend
- **Templating**: EJS with express-ejs-layouts
- **Styling**: CSS
- **Real-time**: Socket.io

### AI/APIs
- **Financial Analysis**: Google Gemini 2.5 Flash API
- **HTTP Client**: Axios

### Security
- Helmet.js for secure headers
- bcrypt for password hashing
- Session-based authentication

## Installation

### Prerequisites
- Node.js (v16 or higher)
- PostgreSQL database
- Google Gemini API key
- Razorpay account (optional, for payments)

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/visitron/v1_SpendSmart_expenseTracker.git
   cd v1_spendSmart
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Variables**
   Create a `.env` file in the root directory:
   ```env
   PORT=3000
   DATABASE_URL=postgresql://user:password@host:port/database
   SESSION_SECRET=your-session-secret-key
   GEMINI_API_KEY=your-google-gemini-api-key
   RAZORPAY_KEY_ID=your-razorpay-key-id
   RAZORPAY_KEY_SECRET=your-razorpay-key-secret
   ```

4. **Start the application**
   ```bash
   1. node index1.js
   ```
   The application will run on `http://localhost:3000`

## Project Structure

```
v1_spendSmart/
├── index1.js                 # Main application file with all routes
├── package.json              # Project dependencies
├── db/                       # Database setup and configuration
│   ├── db.js                 # PostgreSQL connection pool
│   ├── setupBudgets.js       # Budget table initialization
│   └── setupPayments.js      # Payment columns setup
├── services/                 # Business logic and integrations
│   ├── chatBot.js            # Chat functionality
│   ├── gemini.js             # Google Gemini AI integration
│   ├── guestData.js          # Guest mode session management
│   └── razorpay.js           # Razorpay payment processing
├── views/                    # EJS template files
│   ├── index3.ejs            # Dashboard home page
│   ├── landing.ejs           # Landing page
│   ├── login.ejs             # Login page
│   ├── register.ejs          # Registration page
│   ├── addTransaction.ejs    # Add transaction form
│   ├── editTransaction.ejs   # Edit transaction form
│   ├── allTransactions.ejs   # Transactions list view
│   ├── budgets.ejs           # Budget management (authenticated)
│   ├── budgets-guest.ejs     # Budget view (guest mode)
│   ├── reports.ejs           # Financial reports
│   ├── payment.ejs           # Payment page
│   ├── payment-unavailable.ejs # Payment unavailable page
│   └── chat.ejs              # Chat interface (if exists)
└── public/
    └── css/
        └── styles.css        # Application styling
```

## API Routes

### Authentication
- `GET /register` - Registration page
- `POST /register` - Register new user
- `GET /login` - Login page
- `POST /login` - Authenticate user
- `GET /logout` - Logout user
- `POST /guest-login` - Create guest session

### Dashboard
- `GET /` - Home page (with guest/user differentiation)
- `GET /reports` - Financial reports page
- `POST /api/chat` - Chat endpoint for AI analysis

### Transactions
- `GET /transactions` - View all transactions
- `GET /add` - Add transaction form
- `POST /add` - Create new transaction
- `POST /edit/:transactionId` - Update transaction
- `POST /delete/:transactionId` - Delete transaction

### Budgets
- `GET /budgets` - View budgets
- `POST /budgets/overall` - Set overall budget
- `POST /budgets/category` - Set category budget
- `POST /budgets/delete/:budgetId` - Delete budget

### Payments
- `POST /initiate-payment` - Start payment process
- `POST /create-payment-order` - Create Razorpay order
- `POST /verify-payment` - Verify payment signature

## Key Features Explained

### Guest Mode
Users can access the application without registration. Guest sessions are automatically stored and cleaned up after a set period.

### AI Financial Analysis
The Gemini integration analyzes user transactions to provide:
- Spending pattern insights
- Budget recommendations
- Money-saving tips
- Financial health assessment

### Budget Tracking
Users can set budgets at two levels:
- **Overall Budget**: Monthly spending limit
- **Category Budget**: Specific limits per expense category

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^5.1.0 | Web framework |
| pg | ^8.16.3 | PostgreSQL client |
| ejs | ^3.1.10 | Template engine |
| bcrypt | ^6.0.0 | Password hashing |
| express-session | ^1.18.2 | Session management |
| @google/genai | ^1.11.0 | Gemini AI API |
| razorpay | ^2.9.6 | Payment gateway |
| socket.io | ^4.8.1 | Real-time communication |
| helmet | ^8.1.0 | Security headers |
| dotenv | ^17.2.1 | Environment variables |

## Security Considerations

- All passwords are hashed using bcrypt
- Session-based authentication with secure secrets
- Helmet middleware for HTTP security headers
- Protected routes require authentication
- Payment signature verification with Razorpay
- Environment variables for sensitive data

## Future Enhancements

- Mobile app version
- Multi-currency support
- Recurring transaction templates
- Bill reminders and notifications
- Advanced data analytics and visualizations
- Export reports to PDF/CSV
- Budget sharing with family members

## License

ISC

## Support

For issues or questions, please create an issue in the repository.
