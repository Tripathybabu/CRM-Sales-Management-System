const AppError = require('../utils/AppError');

const notFound = (req, res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, { code: 'ROUTE_NOT_FOUND' }));
};

module.exports = notFound;
