const mongoose = require('mongoose');

/**
 * Runs `work(session)` inside a MongoDB transaction.
 *
 * Uses Mongoose's `connection.transaction()` rather than the raw driver `withTransaction()`:
 * both retry on transient errors, but Mongoose also resets the change-tracking state of
 * documents saved inside an aborted attempt, so `doc.save({ session })` is safe to retry.
 * `work` must only perform DB writes through the given session (no external side effects).
 *
 * Requires MongoDB running as a replica set (Atlas, or the provided docker-compose).
 */
async function runInTransaction(work) {
  let result;
  await mongoose.connection.transaction(async (session) => {
    result = await work(session);
  });
  return result;
}

module.exports = { runInTransaction };
