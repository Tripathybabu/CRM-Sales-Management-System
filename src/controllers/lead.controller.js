const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendPaginated } = require('../utils/apiResponse');
const leadService = require('../services/lead.service');
const conversionService = require('../services/conversion.service');
const timelineService = require('../services/timeline.service');

const createLead = asyncHandler(async (req, res) => {
  const lead = await leadService.createLead(req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Lead created successfully', data: lead });
});

const listLeads = asyncHandler(async (req, res) => {
  const result = await leadService.listLeads(req.query, req.user);
  sendPaginated(res, { message: 'Leads fetched successfully', result });
});

const getLead = asyncHandler(async (req, res) => {
  const lead = await leadService.getLead(req.params.id, req.user);
  sendSuccess(res, { message: 'Lead fetched successfully', data: lead });
});

const updateLead = asyncHandler(async (req, res) => {
  const lead = await leadService.updateLead(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Lead updated successfully', data: lead });
});

const updateLeadStatus = asyncHandler(async (req, res) => {
  const lead = await leadService.updateLeadStatus(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Lead status updated successfully', data: lead });
});

const assignLead = asyncHandler(async (req, res) => {
  const lead = await leadService.assignLead(req.params.id, req.body, req.user);
  sendSuccess(res, { message: 'Lead assigned successfully', data: lead });
});

const convertLead = asyncHandler(async (req, res) => {
  const result = await conversionService.convertLead(req.params.id, req.body, req.user);
  sendSuccess(res, { statusCode: 201, message: 'Lead converted successfully', data: result });
});

const deleteLead = asyncHandler(async (req, res) => {
  await leadService.deleteLead(req.params.id, req.user);
  sendSuccess(res, { message: 'Lead deleted successfully' });
});

const getLeadTimeline = asyncHandler(async (req, res) => {
  const result = await timelineService.getEntityTimeline('lead', req.params.id, req.user, req.query);
  sendPaginated(res, { message: 'Lead timeline fetched successfully', result });
});

module.exports = {
  createLead,
  listLeads,
  getLead,
  updateLead,
  updateLeadStatus,
  assignLead,
  convertLead,
  deleteLead,
  getLeadTimeline,
};
