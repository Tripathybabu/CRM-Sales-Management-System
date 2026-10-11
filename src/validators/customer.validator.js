const { CUSTOMER_STATUSES } = require('../constants');
const {
  z,
  objectId,
  email,
  phone,
  name,
  optionalText,
  listParam,
  booleanParam,
  paginationShape,
  sortParam,
  searchParam,
  createdRangeShape,
  idParams,
  rangeCheck,
  nonEmptyBody,
} = require('./common');

const status = z.enum(CUSTOMER_STATUSES);

const addressSchema = z
  .object({
    street: optionalText(200).optional(),
    city: optionalText(100).optional(),
    state: optionalText(100).optional(),
    postalCode: optionalText(20).optional(),
    country: optionalText(100).optional(),
  })
  .strict();

const createCustomer = {
  body: z
    .object({
      name: name(),
      email: email.optional(),
      phone: phone.optional(),
      company: optionalText(150).optional(),
      address: addressSchema.optional(),
      description: optionalText(2000).optional(),
      status: status.default('active'),
      assignedTo: objectId.optional(),
    })
    .strict()
    .refine((data) => data.email || data.phone, {
      path: ['email'],
      message: 'Either email or phone is required',
    }),
};

const listCustomers = {
  query: z
    .object({
      ...paginationShape,
      sort: sortParam(['createdAt', 'updatedAt', 'name', 'company', 'status']),
      search: searchParam.optional(),
      status: listParam(status).optional(),
      assignedTo: objectId.optional(),
      lead: objectId.optional(),
      fromLead: booleanParam.optional(),
      ...createdRangeShape,
    })
    .superRefine(rangeCheck('createdFrom', 'createdTo')),
};

const updateCustomer = {
  params: idParams,
  body: nonEmptyBody(
    z
      .object({
        name: name().optional(),
        email: email.nullable().optional(),
        phone: phone.nullable().optional(),
        company: optionalText(150).nullable().optional(),
        address: addressSchema.nullable().optional(),
        description: optionalText(2000).nullable().optional(),
        status: status.optional(),
      })
      .strict(),
  ),
};

const assignCustomer = {
  params: idParams,
  body: z.object({ assignedTo: objectId }).strict(),
};

module.exports = {
  addressSchema,
  createCustomer,
  listCustomers,
  updateCustomer,
  assignCustomer,
  idParams: { params: idParams },
};
