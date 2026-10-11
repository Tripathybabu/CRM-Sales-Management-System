const { LEAD_SOURCES, LEAD_STATUS, PRIORITIES, OPEN_DEAL_STAGES } = require('../constants');
const {
  z,
  objectId,
  email,
  phone,
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
const { addressSchema } = require('./customer.validator');

const source = z.enum(LEAD_SOURCES);
const status = z.enum(Object.values(LEAD_STATUS));
const priority = z.enum(PRIORITIES);

const createLead = {
  body: z
    .object({
      name: name(),
      email: email.optional(),
      phone: phone.optional(),
      company: optionalText(150).optional(),
      source: source.default('other'),
      priority: priority.default('medium'),
      description: optionalText(2000).optional(),
      assignedTo: objectId.optional(),
    })
    .strict()
    .refine((data) => data.email || data.phone, {
      path: ['email'],
      message: 'Either email or phone is required',
    }),
};

const listLeads = {
  query: z
    .object({
      ...paginationShape,
      sort: sortParam(['createdAt', 'updatedAt', 'name', 'company', 'status', 'priority', 'source']),
      search: searchParam.optional(),
      status: listParam(status).optional(),
      priority: listParam(priority).optional(),
      source: listParam(source).optional(),
      assignedTo: z.union([objectId, z.literal('unassigned')]).optional(),
      createdBy: objectId.optional(),
      ...createdRangeShape,
      updatedFrom: dateParam().optional(),
      updatedTo: dateParam({ endOfDay: true }).optional(),
    })
    .superRefine(rangeCheck('createdFrom', 'createdTo'))
    .superRefine(rangeCheck('updatedFrom', 'updatedTo')),
};

const updateLead = {
  params: idParams,
  body: nonEmptyBody(
    z
      .object({
        name: name().optional(),
        email: email.nullable().optional(),
        phone: phone.nullable().optional(),
        company: optionalText(150).nullable().optional(),
        source: source.optional(),
        priority: priority.optional(),
        description: optionalText(2000).nullable().optional(),
      })
      .strict(),
  ),
};

const updateStatus = {
  params: idParams,
  body: z
    .object({
      status: status.refine((value) => value !== LEAD_STATUS.CONVERTED, {
        message: 'Use POST /leads/:id/convert to convert a lead',
      }),
      reason: optionalText(500).optional(),
    })
    .strict()
    .refine((data) => data.status !== LEAD_STATUS.LOST || (data.reason && data.reason.length >= 3), {
      path: ['reason'],
      message: 'A reason is required when marking a lead as lost',
    }),
};

const assignLead = {
  params: idParams,
  body: z
    .object({
      assignedTo: objectId,
      note: optionalText(500).optional(),
    })
    .strict(),
};

const convertLead = {
  params: idParams,
  body: z
    .object({
      customer: z
        .object({
          name: name().optional(),
          email: email.optional(),
          phone: phone.optional(),
          company: optionalText(150).optional(),
          address: addressSchema.optional(),
          description: optionalText(2000).optional(),
        })
        .strict()
        .default({}),
      deal: z
        .object({
          name: name(150),
          value: z.number().positive('Deal value must be greater than zero').max(1e12),
          currency: z.string().trim().length(3).toUpperCase().optional(),
          probability: z.number().min(0).max(100).optional(),
          expectedCloseDate: dateBody,
          stage: z.enum(OPEN_DEAL_STAGES).default('qualification'),
          description: optionalText(2000).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
};

module.exports = {
  createLead,
  listLeads,
  updateLead,
  updateStatus,
  assignLead,
  convertLead,
  idParams: { params: idParams },
};
