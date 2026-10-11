const { Setting } = require('../models');

const CACHE_TTL_MS = 60 * 1000;
let cache = null;
let cachedAt = 0;

/**
 * Returns the CRM configuration (creating the defaults on first access). Cached in memory
 * because it is read on every deal write; updates through this service invalidate the cache.
 */
async function getConfig() {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  const doc = await Setting.findOneAndUpdate(
    { key: 'crm' },
    { $setOnInsert: { key: 'crm' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
  cache = doc;
  cachedAt = Date.now();
  return doc;
}

async function updateConfig(updates, actor) {
  const $set = { updatedBy: actor._id };
  if (updates.defaultCurrency) $set.defaultCurrency = updates.defaultCurrency;
  if (updates.maxDealCloseDays) $set.maxDealCloseDays = updates.maxDealCloseDays;
  for (const [stage, value] of Object.entries(updates.stageProbabilities || {})) {
    $set[`stageProbabilities.${stage}`] = value;
  }

  const doc = await Setting.findOneAndUpdate({ key: 'crm' }, { $set }, {
    upsert: true,
    new: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  }).lean();

  cache = doc;
  cachedAt = Date.now();
  return doc;
}

function clearCache() {
  cache = null;
  cachedAt = 0;
}

module.exports = { getConfig, updateConfig, clearCache };
