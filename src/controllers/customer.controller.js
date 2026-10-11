const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const customerService = require('../services/customer.service');
const timelineService = require('../services/timeline.service');

const createCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Customer created successfully', data: customer });
});

const listCustomers = asyncHandler(async (req, res) => {
  const result = await customerService.listCustomers(req.query, req.user);
  sendPaginated(res, { message: 'Customers fetched successfully', result });
});

const getCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomer(req.params.id, req.user);
  sendSuccess(res, { message: 'Customer fetched successfully', data: customer });
});

const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Customer updated successfully', data: customer });
});

const assignCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.assignCustomer(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Customer assigned successfully', data: customer });
});

const deleteCustomer = asyncHandler(async (req, res) => {
  await customerService.deleteCustomer(req.params.id, req.user);
  sendSuccess(res, { message: 'Customer deleted successfully' });
});

const getCustomerTimeline = asyncHandler(async (req, res) => {
  const result = await timelineService.getEntityTimeline('customer', req.params.id, req.user, req.query);
  sendPaginated(res, { message: 'Customer timeline fetched successfully', result });
});

module.exports = {
  createCustomer,
  listCustomers,
  getCustomer,
  updateCustomer,
  assignCustomer,
  deleteCustomer,
  getCustomerTimeline,
};
