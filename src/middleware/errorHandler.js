const mongoose = require('mongoose');
const { ZodError } = require('zod');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const logger = require('../config/logger');
const AppError = require('../utils/AppError');

function fromZod(err) {
  const errors = err.issues.map((issue) => ({
    field: issue.path.join('.') || undefined,
    message: issue.message,
  }));
  return new AppError('Validation failed', 400, { code: 'VALIDATION_ERROR', details: errors });
}

function fromMongoose(err) {
  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new AppError('Validation failed', 400, { code: 'VALIDATION_ERROR', details: errors });
  }
  if (err instanceof mongoose.Error.CastError) {
    return new AppError(`Invalid value for "${err.path}"`, 400, { code: 'INVALID_ID' });
  }
  return null;
}

function fromMongoDriver(err) {
  if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'field';
    // Do not echo the duplicate value back; just name the field.
    return new AppError(`A record with this ${field} already exists`, 409, {
      code: 'DUPLICATE_RESOURCE',
      details: [{ field, message: `${field} must be unique` }],
    });
  }
  return null;
}

function fromJwt(err) {
  if (err instanceof jwt.TokenExpiredError) {
    return new AppError('Access token has expired', 401, { code: 'TOKEN_EXPIRED' });
  }
  if (err instanceof jwt.JsonWebTokenError) {
    return new AppError('Invalid access token', 401, { code: 'INVALID_TOKEN' });
  }
  return null;
}

function fromHttpParser(err) {
  if (err.type === 'entity.parse.failed') return new AppError('Malformed JSON in request body', 400);
  if (err.type === 'entity.too.large') return new AppError('Request body is too large', 413, { code: 'PAYLOAD_TOO_LARGE' });
  return null;
}

function normalise(err) {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) return fromZod(err);
  return fromMongoose(err) || fromMongoDriver(err) || fromJwt(err) || fromHttpParser(err) || null;
}

// Express identifies error middleware by its four-argument signature, so `next` must stay.
function errorHandler(err, req, res, next) {
  const appError = normalise(err);

  if (!appError) {
    // Unexpected error: log everything server-side, reveal nothing client-side.
    logger.error({ err, requestId: req.id, path: req.originalUrl }, 'Unhandled error');
    const body = {
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      requestId: req.id,
    };
    if (!env.isProduction && !env.isTest) body.stack = err.stack;
    return res.status(500).json(body);
  }

  if (appError.statusCode >= 500) {
    logger.error({ err, requestId: req.id }, appError.message);
  }

  const body = {
    success: false,
    message: appError.message,
    code: appError.code,
    requestId: req.id,
  };
  if (appError.details) body.errors = appError.details;

  return res.status(appError.statusCode).json(body);
}

module.exports = errorHandler;
