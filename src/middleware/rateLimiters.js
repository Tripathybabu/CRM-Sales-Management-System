const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const handler = (req, res, next, options) => {
  res.status(options.statusCode).json({
    success: false,
    message: options.message,
    code: 'TOO_MANY_REQUESTS',
    requestId: req.id,
  });
};

const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler,
  skip: () => env.isTest,
};

/** Applied to the whole API. */
const apiLimiter = rateLimit({
  ...common,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.RATE_LIMIT_MAX,
  message: 'Too many requests, please try again later.',
});

/** Stricter limit for credential endpoints to slow down brute-force and credential stuffing. */
const authLimiter = rateLimit({
  ...common,
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.AUTH_RATE_LIMIT_MAX,
  skipSuccessfulRequests: true,
  message: 'Too many authentication attempts, please try again later.',
});

module.exports = { apiLimiter, authLimiter };
