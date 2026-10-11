const { User } = require('../models');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const tokenService = require('../services/token.service');

/**
 * Verifies the Bearer access token and loads the current user. The user lookup is deliberate:
 * it guarantees that deactivated users and revoked sessions (tokenVersion bump) lose access
 * immediately instead of when their access token expires.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw AppError.unauthorized('Authentication required. Provide a Bearer access token.');
  }

  const payload = tokenService.verifyAccessToken(token);

  const user = await User.findById(payload.sub).select('+tokenVersion').lean();
  if (!user || !user.isActive) {
    throw AppError.unauthorized('User no longer exists or is inactive', 'ACCOUNT_INACTIVE');
  }
  if (user.tokenVersion !== payload.tv) {
    throw AppError.unauthorized('Session has been revoked. Please log in again.', 'SESSION_REVOKED');
  }

  req.user = {
    _id: user._id,
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    manager: user.manager,
  };
  return next();
});

module.exports = authenticate;
