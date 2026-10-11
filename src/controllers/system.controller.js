const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const configService = require('../services/config.service');
const timelineService = require('../services/timeline.service');

const getConfig = asyncHandler(async (req, res) => {
  const config = await configService.getConfig();
  sendSuccess(res, { message: 'CRM configuration fetched successfully', data: config });
});

const updateConfig = asyncHandler(async (req, res) => {
  const config = await configService.updateConfig(req.body, req.user);
  sendSuccess(res, { message: 'CRM configuration updated successfully', data: config });
});

const listTimeline = asyncHandler(async (req, res) => {
  const result = await timelineService.listEvents(req.query);
  sendPaginated(res, { message: 'Audit log fetched successfully', result });
});

module.exports = { getConfig, updateConfig, listTimeline };
