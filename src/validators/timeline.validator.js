const { ENTITY_TYPES, TIMELINE_ACTIONS } = require('../constants');
const { z, objectId, listParam, paginationShape, createdRangeShape, idParams, rangeCheck } = require('./common');

const action = z.enum(Object.values(TIMELINE_ACTIONS));

const entityTimeline = {
  params: idParams,
  query: z
    .object({
      ...paginationShape,
      action: listParam(action).optional(),
      ...createdRangeShape,
    })
    .superRefine(rangeCheck('createdFrom', 'createdTo')),
};

const listTimeline = {
  query: z
    .object({
      ...paginationShape,
      action: listParam(action).optional(),
      entityType: z.enum(ENTITY_TYPES).optional(),
      entityId: objectId.optional(),
      performedBy: objectId.optional(),
      ...createdRangeShape,
    })
    .superRefine(rangeCheck('createdFrom', 'createdTo')),
};

module.exports = { entityTimeline, listTimeline };
