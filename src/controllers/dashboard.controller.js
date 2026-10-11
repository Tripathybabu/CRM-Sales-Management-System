const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const dashboardService = require('../services/dashboard.service');

const getSummary = asyncHandler(async (req, res) => {
  const data = await dashboardService.getSummary(req.query, req.user);
  sendSuccess(res, { message: 'Dashboard summary fetched successfully', data });
});

const getPipeline = asyncHandler(async (req, res) => {
  const data = await dashboardService.getPipeline(req.query, req.user);
  sendSuccess(res, { message: 'Sales pipeline fetched successfully', data });
});

const getTeamPerformance = asyncHandler(async (req, res) => {
  const data = await dashboardService.getTeamPerformance(req.query, req.user);
  sendSuccess(res, { message: 'Team performance fetched successfully', data });
});

const getRevenueTrend = asyncHandler(async (req, res) => {
  const data = await dashboardService.getRevenueTrend(req.query, req.user);
  sendSuccess(res, { message: 'Revenue trend fetched successfully', data });
});

module.exports = { getSummary, getPipeline, getTeamPerformance, getRevenueTrend };
