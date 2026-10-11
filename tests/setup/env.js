// Runs before any test module is loaded so `src/config/env.js` validates against test values.
process.env.NODE_ENV = 'test';
process.env.DOTENV_PATH = '.env.test-does-not-exist';
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/crm_test';
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-definitely-longer-than-32-chars';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.ALLOW_PUBLIC_REGISTRATION = 'true';
process.env.MAX_LOGIN_ATTEMPTS = '3';
