const AppError = require('../utils/AppError');

/**
 * Role gate. Record-level access (e.g. "an executive may only see their own leads")
 * is enforced in the service layer through ownership scopes.
 */
const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) return next(AppError.unauthorized());
    if (!allowedRoles.includes(req.user.role)) {
      return next(AppError.forbidden('Your role is not permitted to perform this action'));
    }
    return next();
  };

module.exports = authorize;
