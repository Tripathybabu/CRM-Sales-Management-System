const { randomUUID } = require('crypto');

const SAFE_ID = /^[A-Za-z0-9-]{8,64}$/;

/** Correlates logs and error responses with a single request. */
const requestId = (req, res, next) => {
  const incoming = req.headers['x-request-id'];
  req.id = typeof incoming === 'string' && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};

module.exports = requestId;
