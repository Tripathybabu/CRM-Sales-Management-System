const { ACTIVITY_TYPES, ACTIVITY_STATUS, ACTIVITY_RELATED_TYPES } = require('../constants');
const {
  z,
  objectId,
  optionalText,
  dateParam,
  dateBody,
  listParam,
  paginationShape,
  sortParam,
  searchParam,
  createdRangeShape,
  idParams,
  rangeCheck,
  nonEmptyBody,
} = require('./common');

const type = z.enum(ACTIVITY_TYPES);

const createActivity = {
  body: z
    .object({
      type,
      title: z.string().trim().min(2).max(200),
      description: optionalText(2000).optional(),
      dueDate: dateBody.optional(),
      assignedTo: objectId.optional(),
      relatedType: z.enum(ACTIVITY_RELATED_TYPES).optional(),
      relatedId: objectId.optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (Boolean(data.relatedType) !== Boolean(data.relatedId)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedId'], message: 'relatedType and relatedId must be provided together' });
      }
      if (data.type !== 'note' && !data.dueDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['dueDate'], message: 'dueDate is required for this activity type' });
      }
    }),
};

const listActivities = {
  query: z
    .object({
      ...paginationShape,
      sort: sortParam(['dueDate', 'createdAt', 'updatedAt', 'completedAt', 'title', 'type'], 'dueDate'),
      search: searchParam.optional(),
      type: listParam(type).optional(),
      status: listParam(z.enum(Object.values(ACTIVITY_STATUS))).optional(),
      assignedTo: objectId.optional(),
      createdBy: objectId.optional(),
      relatedType: z.enum(ACTIVITY_RELATED_TYPES).optional(),
      relatedId: objectId.optional(),
      dueFrom: dateParam().optional(),
      dueTo: dateParam({ endOfDay: true }).optional(),
      ...createdRangeShape,
    })
    .superRefine(rangeCheck('dueFrom', 'dueTo'))
    .superRefine(rangeCheck('createdFrom', 'createdTo')),
};

const updateActivity = {
  params: idParams,
  body: nonEmptyBody(
    z
      .object({
        title: z.string().trim().min(2).max(200).optional(),
        description: optionalText(2000).nullable().optional(),
        dueDate: dateBody.optional(),
        assignedTo: objectId.optional(),
      })
      .strict(),
  ),
};

const completeActivity = {
  params: idParams,
  body: z.object({ outcome: optionalText(1000).optional() }).strict(),
};

module.exports = { createActivity, listActivities, updateActivity, completeActivity, idParams: { params: idParams } };
