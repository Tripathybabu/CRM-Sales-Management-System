const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { RefreshToken, User } = require('../models');
const AppError = require('../utils/AppError');
const { addDays } = require('../utils/dates');

const ACCESS_TOKEN_OPTIONS = {
  algorithm: 'HS256',
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
};

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

function generateAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role, tv: user.tokenVersion ?? 0 }, env.JWT_ACCESS_SECRET, {
    ...ACCESS_TOKEN_OPTIONS,
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  });
}

function verifyAccessToken(token) {
  // Throws JsonWebTokenError / TokenExpiredError, mapped to 401 by the error handler.
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: [ACCESS_TOKEN_OPTIONS.algorithm],
    issuer: ACCESS_TOKEN_OPTIONS.issuer,
    audience: ACCESS_TOKEN_OPTIONS.audience,
  });
}

async function issueRefreshToken(userId, { family, ip, userAgent } = {}) {
  const token = crypto.randomBytes(48).toString('base64url');
  const tokenHash = hashToken(token);
  const expiresAt = addDays(new Date(), env.REFRESH_TOKEN_EXPIRES_IN_DAYS);

  await RefreshToken.create({
    user: userId,
    tokenHash,
    family: family || crypto.randomUUID(),
    expiresAt,
    createdByIp: ip,
    userAgent: userAgent?.slice(0, 512),
  });

  return { token, tokenHash, expiresAt };
}

/**
 * Exchanges a refresh token for a new access/refresh pair (rotation). Presenting a token that
 * was already rotated or revoked revokes every token in its family — the legitimate user and
 * the attacker are both logged out, which is the safe outcome when a token has leaked.
 */
async function rotateRefreshToken(rawToken, { ip, userAgent } = {}) {
  if (!rawToken) throw AppError.unauthorized('Refresh token is missing', 'REFRESH_TOKEN_MISSING');

  const stored = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
  if (!stored) throw AppError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');

  if (stored.revokedAt) {
    await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw AppError.unauthorized('Refresh token reuse detected. Please log in again.', 'REFRESH_TOKEN_REUSED');
  }

  if (stored.expiresAt <= new Date()) {
    throw AppError.unauthorized('Refresh token has expired', 'REFRESH_TOKEN_EXPIRED');
  }

  const user = await User.findById(stored.user).select('+tokenVersion');
  if (!user || !user.isActive) {
    await RefreshToken.updateMany({ user: stored.user, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw AppError.unauthorized('User no longer exists or is inactive', 'ACCOUNT_INACTIVE');
  }

  const next = await issueRefreshToken(user._id, { family: stored.family, ip, userAgent });

  // Conditional update guards against two concurrent refreshes with the same token.
  const rotated = await RefreshToken.findOneAndUpdate(
    { _id: stored._id, revokedAt: null },
    { $set: { revokedAt: new Date(), replacedByHash: next.tokenHash } },
  );
  if (!rotated) {
    await RefreshToken.updateMany({ family: stored.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw AppError.unauthorized('Refresh token reuse detected. Please log in again.', 'REFRESH_TOKEN_REUSED');
  }

  return { user, accessToken: generateAccessToken(user), refreshToken: next };
}

async function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  await RefreshToken.updateOne({ tokenHash: hashToken(rawToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

async function revokeAllForUser(userId, session) {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    session ? { session } : {},
  );
}

module.exports = {
  hashToken,
  generateAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllForUser,
};
