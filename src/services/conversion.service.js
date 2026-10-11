const { Lead, Customer, Deal, User } = require('../models');
const { LEAD_STATUS, TIMELINE_ACTIONS } = require('../constants');
const AppError = require('../utils/AppError');
const { runInTransaction } = require('../utils/transaction');
const leadService = require('./lead.service');
const dealService = require('./deal.service');
const customerService = require('./customer.service');
const timeline = require('./timeline.service');

/**
 * Converts a qualified lead into a Customer (and optionally a Deal) atomically.
 *
 * Safety guarantees:
 *  - The lead is flipped qualified -> converted with a conditional update inside the
 *    transaction, so two concurrent requests cannot both convert the same lead.
 *  - Customer, deal, lead back-references and timeline entries are written in the same
 *    transaction: any failure (e.g. duplicate customer email) rolls everything back.
 *  - A unique index on Customer.lead is a final DB-level guard against double conversion.
 */
async function convertLead(leadId, payload, actor) {
  // Fast-fail checks with clear messages before opening a transaction.
  const lead = await leadService.findLead(leadId, actor);

  if (lead.status === LEAD_STATUS.CONVERTED) {
    throw AppError.conflict('Lead has already been converted');
  }
  if (lead.status !== LEAD_STATUS.QUALIFIED) {
    throw AppError.businessRule(`Only qualified leads can be converted (current status: "${lead.status}")`);
  }
  if (!lead.assignedTo) {
    throw AppError.businessRule('Assign the lead to a sales executive before converting it');
  }
  const owner = await User.findById(lead.assignedTo).select('isActive').lean();
  if (!owner?.isActive) {
    throw AppError.businessRule('The lead owner is inactive. Reassign the lead before converting it.');
  }

  const customerInput = payload.customer || {};
  const customerData = {
    name: customerInput.name ?? lead.name,
    email: customerInput.email ?? lead.email,
    phone: customerInput.phone ?? lead.phone,
    company: customerInput.company ?? lead.company,
    address: customerInput.address,
    description: customerInput.description ?? lead.description,
    lead: lead._id,
    assignedTo: lead.assignedTo,
    createdBy: actor._id,
  };
  if (!customerData.email && !customerData.phone) {
    throw AppError.badRequest('Customer requires an email or phone; provide one in customer.email / customer.phone');
  }

  // Validates deal rules (value, probability, close date) before touching the database.
  // The customer reference is set inside the transaction once the customer exists.
  const deal = payload.deal
    ? await dealService.buildDeal({
        data: payload.deal,
        customer: { _id: undefined },
        leadId: lead._id,
        assignedTo: lead.assignedTo,
        actor,
      })
    : null;

  const result = await runInTransaction(async (session) => {
    const convertedAt = new Date();
    const updatedLead = await Lead.findOneAndUpdate(
      { _id: lead._id, status: LEAD_STATUS.QUALIFIED },
      { $set: { status: LEAD_STATUS.CONVERTED, convertedAt, convertedBy: actor._id } },
      { new: true, session },
    );
    if (!updatedLead) {
      throw AppError.conflict('Lead was modified or converted by another request; reload and try again');
    }

    const [customer] = await Customer.create([customerData], { session });

    if (deal) {
      deal.customer = customer._id;
      await deal.save({ session });
    }

    updatedLead.customer = customer._id;
    updatedLead.deal = deal?._id ?? null;
    await updatedLead.save({ session });

    const context = timeline.contextOf({ lead: lead._id, customer: customer._id, deal: deal?._id });
    const events = [
      {
        action: TIMELINE_ACTIONS.LEAD_STATUS_CHANGED,
        entityType: 'lead',
        entityId: lead._id,
        performedBy: actor._id,
        previousValue: LEAD_STATUS.QUALIFIED,
        newValue: LEAD_STATUS.CONVERTED,
        ...context,
      },
      {
        action: TIMELINE_ACTIONS.CUSTOMER_CREATED,
        entityType: 'customer',
        entityId: customer._id,
        performedBy: actor._id,
        newValue: { name: customer.name, email: customer.email, company: customer.company },
        message: 'Created from lead conversion',
        ...context,
      },
    ];
    if (deal) {
      events.push({
        action: TIMELINE_ACTIONS.DEAL_CREATED,
        entityType: 'deal',
        entityId: deal._id,
        performedBy: actor._id,
        newValue: { name: deal.name, value: deal.value, stage: deal.stage, probability: deal.probability },
        message: 'Created from lead conversion',
        ...context,
      });
    }
    events.push({
      action: TIMELINE_ACTIONS.LEAD_CONVERTED,
      entityType: 'lead',
      entityId: lead._id,
      performedBy: actor._id,
      newValue: { customer: customer._id, deal: deal?._id ?? null },
      ...context,
    });
    await timeline.record(events, session);

    return { leadId: updatedLead._id, customerId: customer._id, dealId: deal?._id ?? null };
  });

  const [convertedLead, customer, createdDeal] = await Promise.all([
    Lead.findById(result.leadId).populate(leadService.DETAIL_POPULATE),
    Customer.findById(result.customerId).populate(customerService.DETAIL_POPULATE),
    result.dealId ? Deal.findById(result.dealId).populate(dealService.DETAIL_POPULATE) : null,
  ]);

  return { lead: convertedLead, customer, deal: createdDeal };
}

module.exports = { convertLead };
