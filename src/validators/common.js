const { z } = require('zod');
const { PAGINATION } = require('../constants');

const objectId = z
  .string({ required_error: 'ID is required' })
  .trim()
  .regex(/^[a-f\d]{24}$/i, 'Invalid ID format');

const email = z.string().trim().toLowerCase().email('Invalid email format').max(254);

/** Accepts common formatting ("+1 (555) 010-2030") and stores an E.164-like value ("+15550102030"). */
const phone = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s\-().]/g, ''))
  .pipe(z.string().regex(/^\+?[1-9]\d{6,14}$/, 'Invalid phone number format'));

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[a-z]/, 'Password must contain a lowercase letter')
  .regex(/[A-Z]/, 'Password must contain an uppercase letter')
  .regex(/\d/, 'Password must contain a number');

const name = (max = 120) => z.string().trim().min(2, 'Must be at least 2 characters').max(max);
const optionalText = (max) => z.string().trim().max(max);

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Date query parameter. A bare date ("2026-01-31") used as an upper bound is treated as the
 * end of that day so date ranges are inclusive.
 */
const dateParam = ({ endOfDay = false } = {}) =>
  z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid date')
    .transform((value) => {
      const date = new Date(value);
      if (endOfDay && ISO_DATE_ONLY.test(value)) date.setUTCHours(23, 59, 59, 999);
      return date;
    });

const dateBody = z.coerce.date({ errorMap: () => ({ message: 'Invalid date' }) });

/** Accepts `?status=new,contacted` or `?status=new&status=contacted`. */
const listParam = (itemSchema) =>
  z.preprocess(
    (value) =>
      typeof value === 'string'
        ? value
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        : value,
    z.array(itemSchema).min(1),
  );

const booleanParam = z.enum(['true', 'false']).transform((value) => value === 'true');

const paginationShape = {
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
};

/** `sort=-createdAt,name`, restricted to a whitelist so clients cannot sort on unindexed/private fields. */
const sortParam = (allowedFields, defaultSort = '-createdAt') =>
  z
    .string()
    .trim()
    .default(defaultSort)
    .refine(
      (value) =>
        value.split(',').every((token) => allowedFields.includes(token.trim().replace(/^-/, ''))),
      { message: `Sort fields must be one of: ${allowedFields.join(', ')}` },
    )
    .transform((value) =>
      value
        .split(',')
        .map((token) => token.trim())
        .join(','),
    );

const searchParam = z.string().trim().min(1).max(100);

const createdRangeShape = {
  createdFrom: dateParam().optional(),
  createdTo: dateParam({ endOfDay: true }).optional(),
};

const idParams = z.object({ id: objectId });

/** Rejects ranges where the lower bound is after the upper bound. */
const rangeCheck = (fromKey, toKey) => (data, ctx) => {
  if (data[fromKey] !== undefined && data[toKey] !== undefined && data[fromKey] > data[toKey]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [fromKey],
      message: `${fromKey} must be before or equal to ${toKey}`,
    });
  }
};

const nonEmptyBody = (schema) =>
  schema.refine((data) => Object.keys(data).length > 0, { message: 'Request body must contain at least one field' });

module.exports = {
  z,
  objectId,
  email,
  phone,
  password,
  name,
  optionalText,
  dateParam,
  dateBody,
  listParam,
  booleanParam,
  paginationShape,
  sortParam,
  searchParam,
  createdRangeShape,
  idParams,
  rangeCheck,
  nonEmptyBody,
};
