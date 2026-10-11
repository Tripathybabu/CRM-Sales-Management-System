const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const userService = require('../services/user.service');

const createUser = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'User created successfully', data: user });
});

const listUsers = asyncHandler(async (req, res) => {
  const result = await userService.listUsers(req.query, req.user);
  sendPaginated(res, { message: 'Users fetched successfully', result });
});

const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUser(req.params.id, req.user);
  sendSuccess(res, { message: 'User fetched successfully', data: user });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'User updated successfully', data: user });
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const user = await userService.setUserStatus(req.params.id, req.body.isActive, req.user);
  sendSuccess(res, {
    message: `User ${req.body.isActive ? 'activated' : 'deactivated'} successfully`,
    data: user,
  });
});

const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(req.params.id, req.user);
  sendSuccess(res, { message: 'User deleted successfully' });
});

module.exports = { createUser, listUsers, getUser, updateUser, updateUserStatus, deleteUser };
