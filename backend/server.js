require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

// Trust the first proxy in front of us (Nginx in production) so req.ip
// reflects the real client IP from X-Forwarded-For instead of 127.0.0.1.
// Required for IP pinning in zeroTrust middleware to work behind a reverse proxy.
app.set('trust proxy', 1);

// Security HTTP headers
app.use(helmet());

// CORS — accepts the production frontend URL from env, falls back to Vite dev server.
// Set FRONTEND_URL in production .env (no trailing slash, e.g. https://exam.example.com).
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

// JSON body parsing
app.use(express.json());

// Route imports (mounted, files should be created under ./routes/)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api/exams', require('./routes/exams'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/monitoring', require('./routes/monitoring'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/regulations', require('./routes/regulations'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date()
  });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

const startSessionSweeper = require('./jobs/sessionSweeper');
startSessionSweeper();