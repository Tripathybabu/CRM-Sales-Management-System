const { ROLES } = require('../constants');
const {
  z,
  objectId,
  email,
  phone,
  password,
  name,
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

const role = z.enum(Object.values(ROLES));

const createUser = {
  body: z
    .object({
      name: name(100),
      email,
      phone: phone.optional(),
      password,
      role,
      manager: objectId.nullable().optional(),
      isActive: z.boolean().optional(),
    })
    .strict()
    .refine((data) => !data.manager || data.role === ROLES.SALES_EXECUTIVE, {
      path: ['manager'],
      message: 'Only sales executives can report to a manager',
    }),
};

const listUsers = {
  query: z
    .object({
      ...paginationShape,
      sort: sortParam(['createdAt', 'updatedAt', 'name', 'email', 'role', 'lastLoginAt']),
      search: searchParam.optional(),
      role: listParam(role).optional(),
      isActive: booleanParam.optional(),
      manager: objectId.optional(),
      ...createdRangeShape,
    })
    .superRefine(rangeCheck('createdFrom', 'createdTo')),
};

const updateUser = {
  params: idParams,
  body: nonEmptyBody(
    z
      .object({
        name: name(100).optional(),
        email: email.optional(),
        phone: phone.nullable().optional(),
        role: role.optional(),
        manager: objectId.nullable().optional(),
        password: password.optional(),
      })
      .strict(),
  ),
};

const updateStatus = {
  params: idParams,
  body: z.object({ isActive: z.boolean({ required_error: 'isActive is required' }) }).strict(),
};

module.exports = { createUser, listUsers, updateUser, updateStatus, idParams: { params: idParams } };
