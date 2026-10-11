/**
 * Validates and normalises `params`, `query` and `body` with Zod schemas. The parsed
 * (coerced, defaulted, stripped) values replace the raw input, so controllers only ever
 * see validated data. Body schemas are `.strict()` to block mass-assignment of server-owned
 * fields such as `status`, `expectedRevenue` or `createdBy`.
 */
const validate = (schemas) => (req, res, next) => {
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key] ?? {});
    if (!result.success) return next(result.error);
    req[key] = result.data;
  }
  return next();
};

module.exports = validate;
