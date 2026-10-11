const { z, objectId, createdRangeShape, rangeCheck } = require('./common');

const rangeQuery = z
  .object({
    ...createdRangeShape,
    assignedTo: objectId.optional(),
  })
  .superRefine(rangeCheck('createdFrom', 'createdTo'));

const summary = { query: rangeQuery };
const pipeline = { query: rangeQuery };

const teamPerformance = {
  query: z
    .object({
      ...createdRangeShape,
      manager: objectId.optional(),
    })
    .superRefine(rangeCheck('createdFrom', 'createdTo')),
};

const revenueTrend = {
  query: z.object({
    months: z.coerce.number().int().min(1).max(24).default(6),
    assignedTo: objectId.optional(),
  }),
};

module.exports = { summary, pipeline, teamPerformance, revenueTrend };
