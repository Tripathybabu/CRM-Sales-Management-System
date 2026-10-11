const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const activityService = require('../services/activity.service');

const createActivity = asyncHandler(async (req, res) => {
  const activity = await activityService.createActivity(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Activity created successfully', data: activity });
});

const listActivities = asyncHandler(async (req, res) => {
  const result = await activityService.listActivities(req.query, req.user);
  sendPaginated(res, { message: 'Activities fetched successfully', result });
});

const getActivity = asyncHandler(async (req, res) => {
  const activity = await activityService.getActivity(req.params.id, req.user);
  sendSuccess(res, { message: 'Activity fetched successfully', data: activity });
});

const updateActivity = asyncHandler(async (req, res) => {
  const activity = await activityService.updateActivity(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Activity updated successfully', data: activity });
});

const completeActivity = asyncHandler(async (req, res) => {
  const activity = await activityService.completeActivity(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Activity marked as completed', data: activity });
});

const deleteActivity = asyncHandler(async (req, res) => {
  await activityService.deleteActivity(req.params.id, req.user);
  sendSuccess(res, { message: 'Activity deleted successfully' });
});

module.exports = { createActivity, listActivities, getActivity, updateActivity, completeActivity, deleteActivity };
