const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const pinoHttp = require('pino-http');
const mongoose = require('mongoose');
const swaggerUi = require('swagger-ui-express');

const env = require('./config/env');
const logger = require('./config/logger');
const routes = require('./routes');
const openapiSpec = require('./docs/openapi');
const requestId = require('./middleware/requestId');
const sanitize = require('./middleware/sanitize');
const { apiLimiter } = require('./middleware/rateLimiters');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const AppError = require('./utils/AppError');

const app = express();

app.disable('x-powered-by');
if (env.TRUST_PROXY > 0) app.set('trust proxy', env.TRUST_PROXY);

app.use(requestId);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => req.id,
    autoLogging: { ignore: (req) => req.url.startsWith('/health') },
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  }),
);

// Swagger UI needs inline scripts/styles, so it is mounted before the strict CSP.
app.get('/api-docs.json', (req, res) => res.json(openapiSpec));
app.use(
  '/api-docs',
  helmet({ contentSecurityPolicy: false }),
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'CRM Sales API Docs',
    swaggerOptions: { persistAuthorization: true, withCredentials: true },
  }),
);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / server-to-server requests (no Origin header) and whitelisted origins.
      if (!origin || env.corsOrigins.includes('*') || env.corsOrigins.includes(origin)) return callback(null, true);
      return callback(new AppError('Origin not allowed by CORS', 403, { code: 'CORS_FORBIDDEN' }));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy'],
    maxAge: 600,
  }),
);
app.use(compression());
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));
app.use(cookieParser());
app.use(sanitize);

app.get('/health', (req, res) => {
  res.json({ success: true, message: 'OK', data: { status: 'ok', uptime: Math.round(process.uptime()) } });
});

app.get('/health/ready', (req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'Ready' : 'Database unavailable',
    data: { database: ready ? 'connected' : 'disconnected' },
  });
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'CRM Sales Management API',
    data: { docs: '/api-docs', apiBase: env.API_PREFIX, health: '/health' },
  });
});

app.use(env.API_PREFIX, apiLimiter, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
