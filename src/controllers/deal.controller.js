const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const dealService = require('../services/deal.service');
const timelineService = require('../services/timeline.service');

const createDeal = asyncHandler(async (req, res) => {
  const deal = await dealService.createDeal(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Deal created successfully', data: deal });
});

const listDeals = asyncHandler(async (req, res) => {
  const result = await dealService.listDeals(req.query, req.user);
  sendPaginated(res, { message: 'Deals fetched successfully', result });
});

const getDeal = asyncHandler(async (req, res) => {
  const deal = await dealService.getDeal(req.params.id, req.user);
  sendSuccess(res, { message: 'Deal fetched successfully', data: deal });
});

const updateDeal = asyncHandler(async (req, res) => {
  const deal = await dealService.updateDeal(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Deal updated successfully', data: deal });
});

const changeDealStage = asyncHandler(async (req, res) => {
  const deal = await dealService.changeStage(req.params.id, req.body, req.user);
  sendSuccess(res, { message: `Deal moved to ${deal.stage}`, data: deal });
});

const assignDeal = asyncHandler(async (req, res) => {
  const deal = await dealService.assignDeal(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Deal assigned successfully', data: deal });
});

const deleteDeal = asyncHandler(async (req, res) => {
  await dealService.deleteDeal(req.params.id, req.user);
  sendSuccess(res, { message: 'Deal deleted successfully' });
});

const getDealTimeline = asyncHandler(async (req, res) => {
  const result = await timelineService.getEntityTimeline('deal', req.params.id, req.user, req.query);
  sendPaginated(res, { message: 'Deal timeline fetched successfully', result });
});

module.exports = { createDeal, listDeals, getDeal, updateDeal, changeDealStage, assignDeal, deleteDeal, getDealTimeline };
