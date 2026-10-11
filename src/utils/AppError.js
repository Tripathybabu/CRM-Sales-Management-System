/**
 * Operational (expected) error. Anything that is not an AppError is treated as a bug
 * by the error handler and is reported to the client as a generic 500.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, { code, details } = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code || AppError.defaultCode(statusCode);
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }

  static defaultCode(statusCode) {
    return (
      {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        422: 'BUSINESS_RULE_VIOLATION',
        423: 'LOCKED',
        429: 'TOO_MANY_REQUESTS',
      }[statusCode] || 'INTERNAL_ERROR'
    );
  }

  static badRequest(message, details) {
    return new AppError(message, 400, { details });
  }

  static unauthorized(message = 'Authentication required', code) {
    return new AppError(message, 401, { code });
  }

  static forbidden(message = 'You do not have permission to perform this action') {
    return new AppError(message, 403);
  }

  static notFound(resource = 'Resource') {
    return new AppError(`${resource} not found`, 404);
  }

  static conflict(message, details) {
    return new AppError(message, 409, { details });
  }

  static businessRule(message, details) {
    return new AppError(message, 422, { details });
  }
}

module.exports = AppError;
