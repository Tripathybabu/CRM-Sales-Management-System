/**
 * Every successful response has the shape:
 * { success: true, message: string, data: any, meta?: { pagination } }
 */
function sendSuccess(res, { statusCode = 200, message = 'Success', data = null, meta } = {}) {
  const body = { success: true, message, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function sendPaginated(res, { message, result }) {
  return sendSuccess(res, {
    message,
    data: result.items,
    meta: { pagination: result.pagination },
  });
}

module.exports = { sendSuccess, sendPaginated };
