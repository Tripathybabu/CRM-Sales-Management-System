const { z, email, phone, password, name, nonEmptyBody } = require('./common');

const register = {
  body: z
    .object({
      name: name(100),
      email,
      phone: phone.optional(),
      password,
    })
    .strict(),
};

const login = {
  body: z
    .object({
      email,
      password: z.string().min(1, 'Password is required').max(128),
    })
    .strict(),
};

const updateProfile = {
  body: nonEmptyBody(
    z
      .object({
        name: name(100).optional(),
        phone: phone.nullable().optional(),
      })
      .strict(),
  ),
};

const changePassword = {
  body: z
    .object({
      currentPassword: z.string().min(1, 'Current password is required').max(128),
      newPassword: password,
    })
    .strict()
    .refine((data) => data.currentPassword !== data.newPassword, {
      path: ['newPassword'],
      message: 'New password must be different from the current password',
    }),
};

module.exports = { register, login, updateProfile, changePassword };
