const pino = require('pino');
const env = require('./env');

const usePretty = !env.isProduction && !env.isTest;

const logger = pino({
  level: env.isTest ? 'silent' : env.LOG_LEVEL,
  base: { service: 'crm-sales-api' },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Never let credentials or tokens reach the logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[REDACTED]',
  },
  ...(usePretty && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname,service' },
    },
  }),
});

module.exports = logger;
