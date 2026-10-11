const express = require('express');
const controller = require('../controllers/auth.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiters');
const schemas = require('../validators/auth.validator');

const router = express.Router();

router.post('/register', authLimiter, validate(schemas.register), controller.register);
router.post('/login', authLimiter, validate(schemas.login), controller.login);
router.post('/refresh', authLimiter, controller.refresh);
router.post('/logout', controller.logout);
router.post('/logout-all', authenticate, controller.logoutAll);

router.get('/me', authenticate, controller.me);
router.patch('/me', authenticate, validate(schemas.updateProfile), controller.updateMe);
router.patch('/me/password', authenticate, authLimiter, validate(schemas.changePassword), controller.changePassword);

module.exports = router;
