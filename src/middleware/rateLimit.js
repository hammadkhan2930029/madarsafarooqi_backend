'use strict';

const { rateLimit } = require('express-rate-limit');

const createRateLimiter = ({ windowMs, limit, code }) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({
    success: false,
    error: { code, message: 'Too many requests. Please try again later.' },
  }),
});

const loginRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 10, code: 'LOGIN_RATE_LIMITED' });
const refreshRateLimit = createRateLimiter({ windowMs: 5 * 60 * 1000, limit: 30, code: 'REFRESH_RATE_LIMITED' });
const passwordRateLimit = createRateLimiter({ windowMs: 15 * 60 * 1000, limit: 5, code: 'PASSWORD_RATE_LIMITED' });

module.exports = { createRateLimiter, loginRateLimit, passwordRateLimit, refreshRateLimit };
