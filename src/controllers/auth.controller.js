const env = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const authService = require('../services/auth.service');
const tokenService = require('../services/token.service');

const REFRESH_COOKIE = 'crm_refresh_token';

// Scoped to the auth routes so the refresh token is never sent with ordinary API calls.
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: `${env.API_PREFIX}/auth`,
});

const clientContext = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

function setRefreshCookie(res, refreshToken) {
  res.cookie(REFRESH_COOKIE, refreshToken.token, { ...cookieOptions(), expires: refreshToken.expiresAt });
}

function sessionPayload(user, accessToken) {
  return {
    user,
    accessToken,
    tokenType: 'Bearer',
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
  };
}

const register = asyncHandler(async (req, res) => {
  const user = await authService.register(req.body);
  const accessToken = tokenService.generateAccessToken(user);
  const refreshToken = await tokenService.issueRefreshToken(user._id, clientContext(req));
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { statusCode: 201, message: 'Registration successful', data: sessionPayload(user, accessToken) });
});

const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body, clientContext(req));
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, { message: 'Login successful', data: sessionPayload(user, accessToken) });
});

const refresh = asyncHandler(async (req, res) => {
  try {
    const { user, accessToken, refreshToken } = await tokenService.rotateRefreshToken(
      req.cookies?.[REFRESH_COOKIE],
      clientContext(req),
    );
    setRefreshCookie(res, refreshToken);
    sendSuccess(res, { message: 'Token refreshed successfully', data: sessionPayload(user, accessToken) });
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    throw err;
  }
});

const logout = asyncHandler(async (req, res) => {
  await tokenService.revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  sendSuccess(res, { message: 'Logged out successfully' });
});

const logoutAll = asyncHandler(async (req, res) => {
  await authService.logoutAll(req.user._id);
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  sendSuccess(res, { message: 'Logged out from all devices' });
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.getProfile(req.user._id);
  sendSuccess(res, { message: 'Profile fetched successfully', data: user });
});

const updateMe = asyncHandler(async (req, res) => {
  const user = await authService.updateProfile(req.user._id, req.body);
  sendSuccess(res, { message: 'Profile updated successfully', data: user });
});

const changePassword = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.changePassword(
    req.user._id,
    req.body,
    clientContext(req),
  );
  setRefreshCookie(res, refreshToken);
  sendSuccess(res, {
    message: 'Password changed successfully. Other sessions have been signed out.',
    data: sessionPayload(user, accessToken),
  });
});

module.exports = { REFRESH_COOKIE, register, login, refresh, logout, logoutAll, me, updateMe, changePassword };
