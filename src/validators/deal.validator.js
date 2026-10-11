const { DEAL_STAGES, DEAL_STATUSES, OPEN_DEAL_STAGES, DEAL_STAGE } = require('../constants');
const {
  z,
  objectId,
  name,
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

const value = z.number({ invalid_type_error: 'Deal value must be a number' }).positive('Deal value must be greater than zero').max(1e12);
const probability = z.number().min(0, 'Probability must be between 0 and 100').max(100, 'Probability must be between 0 and 100');
const currency = z.string().trim().length(3, 'Currency must be a 3-letter ISO code').toUpperCase();

const createDeal = {
  body: z
    .object({
      name: name(150),
      customer: objectId,
      value,
      currency: currency.optional(),
      probability: probability.optional(),
      expectedCloseDate: dateBody,
      stage: z.enum(OPEN_DEAL_STAGES).default('qualification'),
      description: optionalText(2000).optional(),
      assignedTo: objectId.optional(),
    })
    .strict(),
};

const amount = z.coerce.number().min(0);

const listDeals = {
  query: z
    .object({
      ...paginationShape,
      sort: sortParam(['createdAt', 'updatedAt', 'name', 'value', 'probability', 'expectedRevenue', 'expectedCloseDate', 'stage', 'closedAt']),
      search: searchParam.optional(),
      stage: listParam(z.enum(DEAL_STAGES)).optional(),
      status: listParam(z.enum(DEAL_STATUSES)).optional(),
      assignedTo: objectId.optional(),
      customer: objectId.optional(),
      lead: objectId.optional(),
      minAmount: amount.optional(),
      maxAmount: amount.optional(),
      closeDateFrom: dateParam().optional(),
      closeDateTo: dateParam({ endOfDay: true }).optional(),
      ...createdRangeShape,
    })
    .superRefine(rangeCheck('minAmount', 'maxAmount'))
    .superRefine(rangeCheck('closeDateFrom', 'closeDateTo'))
    .superRefine(rangeCheck('createdFrom', 'createdTo')),
};

const updateDeal = {
  params: idParams,
  body: nonEmptyBody(
    z
      .object({
        name: name(150).optional(),
        value: value.optional(),
        currency: currency.optional(),
        probability: probability.optional(),
        expectedCloseDate: dateBody.optional(),
        description: optionalText(2000).nullable().optional(),
      })
      .strict(),
  ),
};

const changeStage = {
  params: idParams,
  body: z
    .object({
      stage: z.enum(DEAL_STAGES),
      probability: probability.optional(),
      lostReason: optionalText(500).optional(),
      reopenReason: optionalText(500).optional(),
      // Final negotiated amount when closing as won (optional; defaults to current value).
      finalValue: value.optional(),
    })
    .strict()
    .superRefine((data, ctx) => {
      if (data.stage === DEAL_STAGE.LOST && (!data.lostReason || data.lostReason.length < 3)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['lostReason'], message: 'A lost reason is required when closing a deal as lost' });
      }
      if (data.finalValue !== undefined && data.stage !== DEAL_STAGE.WON) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['finalValue'], message: 'finalValue is only allowed when closing a deal as won' });
      }
      if (data.probability !== undefined && !OPEN_DEAL_STAGES.includes(data.stage)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['probability'], message: 'Probability is fixed for closed stages (won = 100, lost = 0)' });
      }
    }),
};

const assignDeal = {
  params: idParams,
  body: z.object({ assignedTo: objectId }).strict(),
};

module.exports = { createDeal, listDeals, updateDeal, changeStage, assignDeal, idParams: { params: idParams } };
