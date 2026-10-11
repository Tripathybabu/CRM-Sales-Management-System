const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { User } = require('../models');
const { ROLES } = require('../constants');
const AppError = require('../utils/AppError');
const tokenService = require('./token.service');

// Used to equalise response time when the email does not exist (prevents user enumeration by timing).
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

async function register({ name, email, phone, password }) {
  if (!env.ALLOW_PUBLIC_REGISTRATION) {
    throw AppError.forbidden('Public registration is disabled. Ask an administrator to create your account.');
  }
  // Self-registration can never grant elevated roles; admins assign roles via /users.
  const user = await User.create({ name, email, phone, password, role: ROLES.SALES_EXECUTIVE });
  return user;
}

async function login({ email, password }, context) {
  const user = await User.findOne({ email }).select('+password +tokenVersion +failedLoginAttempts +lockUntil');

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (user.isLocked()) {
    throw new AppError('Account temporarily locked due to too many failed login attempts. Try again later.', 423, {
      code: 'ACCOUNT_LOCKED',
    });
  }

  const passwordMatches = await user.comparePassword(password);

  if (!passwordMatches) {
    const attempts = (user.failedLoginAttempts || 0) + 1;
    const update = { failedLoginAttempts: attempts };
    if (attempts >= env.MAX_LOGIN_ATTEMPTS) {
      update.failedLoginAttempts = 0;
      update.lockUntil = new Date(Date.now() + env.LOCK_TIME_MINUTES * 60 * 1000);
    }
    await User.updateOne({ _id: user._id }, { $set: update });
    throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  // Checked after the password so that the response does not reveal whether an account exists.
  if (!user.isActive) {
    throw new AppError('Your account has been deactivated. Contact an administrator.', 403, { code: 'ACCOUNT_INACTIVE' });
  }

  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lastLoginAt: new Date() }, $unset: { lockUntil: 1 } },
  );

  const accessToken = tokenService.generateAccessToken(user);
  const refreshToken = await tokenService.issueRefreshToken(user._id, context);

  return { user, accessToken, refreshToken };
}

async function logoutAll(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await tokenService.revokeAllForUser(userId);
}

async function getProfile(userId) {
  const user = await User.findById(userId).populate('manager', 'name email role');
  if (!user) throw AppError.notFound('User');
  return user;
}

async function updateProfile(userId, updates) {
  const user = await User.findById(userId);
  if (!user) throw AppError.notFound('User');
  if (updates.name !== undefined) user.name = updates.name;
  if (updates.phone !== undefined) user.phone = updates.phone ?? undefined;
  await user.save();
  return user;
}

/** Changing the password signs the user out everywhere and returns a fresh session for the caller. */
async function changePassword(userId, { currentPassword, newPassword }, context) {
  const user = await User.findById(userId).select('+password +tokenVersion');
  if (!user) throw AppError.notFound('User');

  if (!(await user.comparePassword(currentPassword))) {
    throw AppError.badRequest('Current password is incorrect');
  }

  user.password = newPassword;
  user.tokenVersion += 1;
  await user.save();
  await tokenService.revokeAllForUser(user._id);

  const accessToken = tokenService.generateAccessToken(user);
  const refreshToken = await tokenService.issueRefreshToken(user._id, context);
  return { user, accessToken, refreshToken };
}

module.exports = { register, login, logoutAll, getProfile, updateProfile, changePassword };
