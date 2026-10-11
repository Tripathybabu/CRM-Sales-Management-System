/**
 * Strips keys that start with "$" or contain "." from user input to prevent NoSQL operator
 * injection (e.g. `{ "email": { "$gt": "" } }`). Zod validation is the primary defence;
 * this is defence in depth for any field that might slip through as an object.
 */
function clean(value) {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const output = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key.startsWith('$') || key.includes('.')) continue;
      output[key] = clean(nested);
    }
    return output;
  }
  return value;
}

const sanitize = (req, res, next) => {
  if (req.body) req.body = clean(req.body);
  if (req.params) req.params = clean(req.params);
  if (req.query) req.query = clean({ ...req.query });
  next();
};

module.exports = sanitize;
