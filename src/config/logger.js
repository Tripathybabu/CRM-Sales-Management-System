const pino = require('pino');
const env = require('./env');

// pino-pretty is a devDependency: fall back to JSON logs when it is not installed
// (e.g. `npm ci --omit=dev` on a host where NODE_ENV was not set to production).
const prettyAvailable = (() => {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
})();

const usePretty = !env.isProduction && !env.isTest && prettyAvailable;

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
