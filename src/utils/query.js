const mongoose = require('mongoose');

/** Escapes user input so it can be safely embedded in a RegExp (prevents ReDoS / regex injection). */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" search across several fields. */
function buildSearchFilter(search, fields) {
  if (!search) return null;
  const pattern = new RegExp(escapeRegex(search), 'i');
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

/** `{ $gte, $lte }` range for dates or numbers; returns undefined when neither bound is set. */
function buildRange(from, to) {
  if (from === undefined && to === undefined) return undefined;
  const range = {};
  if (from !== undefined) range.$gte = from;
  if (to !== undefined) range.$lte = to;
  return range;
}

/** Single value -> equality, array -> `$in`. */
function inOrEquals(value) {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? (value.length === 1 ? value[0] : { $in: value }) : value;
}

/** Combines filter fragments with `$and`, dropping empty ones so callers never collide on `$or`. */
function combineFilters(...filters) {
  const parts = filters.filter((f) => f && Object.keys(f).length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

/** Removes keys whose value is undefined. */
function compact(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

/** "-createdAt,name" -> { createdAt: -1, name: 1, _id: -1 } (the _id tie-breaker keeps pagination stable). */
function parseSort(sort) {
  const result = {};
  for (const token of sort.split(',')) {
    const field = token.replace(/^-/, '');
    result[field] = token.startsWith('-') ? -1 : 1;
  }
  if (!('_id' in result)) result._id = -1;
  return result;
}

function toObjectId(id) {
  return id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));
}

/**
 * Runs the page query and the count in parallel and returns items + pagination metadata.
 */
async function paginate(Model, filter, { page, limit, sort, populate, select } = {}) {
  const skip = (page - 1) * limit;

  let query = Model.find(filter).sort(parseSort(sort)).skip(skip).limit(limit).lean();
  if (select) query = query.select(select);
  for (const option of [].concat(populate || [])) query = query.populate(option);

  const [items, totalRecords] = await Promise.all([query.exec(), Model.countDocuments(filter)]);
  const totalPages = Math.ceil(totalRecords / limit) || 0;

  return {
    items,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

module.exports = {
  escapeRegex,
  buildSearchFilter,
  buildRange,
  inOrEquals,
  combineFilters,
  compact,
  parseSort,
  toObjectId,
  paginate,
};
