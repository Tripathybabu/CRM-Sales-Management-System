const { Deal, Customer, Lead, Activity, User } = require('../models');
const { ROLES, DEAL_STAGE, OPEN_DEAL_STAGES, CLOSED_DEAL_STAGES, TIMELINE_ACTIONS } = require('../constants');
const AppError = require('../utils/AppError');
const { paginate, buildSearchFilter, buildRange, inOrEquals, combineFilters, compact } = require('../utils/query');
const { runInTransaction } = require('../utils/transaction');
const { startOfDay, addDays } = require('../utils/dates');
const access = require('./access.service');
const timeline = require('./timeline.service');
const configService = require('./config.service');

const ASSIGNABLE_ROLES = [ROLES.SALES_EXECUTIVE, ROLES.SALES_MANAGER];

const LIST_POPULATE = [
  { path: 'customer', select: 'name company email' },
  { path: 'assignedTo', select: 'name email role' },
];

const DETAIL_POPULATE = [
  ...LIST_POPULATE,
  { path: 'lead', select: 'name email company status' },
  { path: 'createdBy', select: 'name email' },
  { path: 'closedBy', select: 'name email' },
];

const isClosed = (stage) => CLOSED_DEAL_STAGES.includes(stage);

const dealScope = (actor) => access.ownershipScope(actor);

async function findDeal(id, actor, options = {}) {
  return access.findInScope(Deal, id, await dealScope(actor), { entityName: 'Deal', ...options });
}

/** Expected close date must be today or later, and within the configured planning horizon. */
function assertValidCloseDate(date, config) {
  const today = startOfDay();
  if (date < today) {
    throw AppError.businessRule('Expected closing date cannot be in the past', [
      { field: 'expectedCloseDate', message: 'Must be today or a future date' },
    ]);
  }
  const limit = addDays(today, config.maxDealCloseDays);
  if (date > limit) {
    throw AppError.businessRule(`Expected closing date cannot be more than ${config.maxDealCloseDays} days ahead`, [
      { field: 'expectedCloseDate', message: `Must be on or before ${limit.toISOString().slice(0, 10)}` },
    ]);
  }
}

function defaultProbability(stage, config) {
  if (stage === DEAL_STAGE.WON) return 100;
  if (stage === DEAL_STAGE.LOST) return 0;
  return config.stageProbabilities?.[stage] ?? 0;
}

const dealContext = (deal) => timeline.contextOf({ lead: deal.lead, customer: deal.customer, deal: deal._id });

/**
 * Builds (but does not save) a new deal document. Shared with the lead-conversion workflow so
 * both paths enforce identical rules.
 */
async function buildDeal({ data, customer, leadId, assignedTo, actor }) {
  const config = await configService.getConfig();
  assertValidCloseDate(data.expectedCloseDate, config);

  return new Deal({
    name: data.name,
    lead: leadId ?? null,
    customer: customer._id,
    assignedTo,
    createdBy: actor._id,
    value: data.value,
    currency: data.currency || config.defaultCurrency,
    probability: data.probability ?? defaultProbability(data.stage, config),
    expectedCloseDate: data.expectedCloseDate,
    stage: data.stage,
    description: data.description,
  });
}

async function createDeal(data, actor) {
  const customerScope = await access.ownershipScope(actor);
  const customer = await access.findInScope(Customer, data.customer, customerScope, { entityName: 'Customer' });

  if (customer.status === 'churned') {
    throw AppError.businessRule('Cannot create a deal for a churned customer');
  }

  let assignedTo;
  if (data.assignedTo) {
    assignedTo = (await access.assertAssignable(actor, data.assignedTo, { allowedRoles: ASSIGNABLE_ROLES }))._id;
  } else if (actor.role === ROLES.SALES_EXECUTIVE) {
    assignedTo = actor._id;
  } else {
    assignedTo = customer.assignedTo;
  }

  const deal = await buildDeal({ data, customer, leadId: customer.lead, assignedTo, actor });

  await runInTransaction(async (session) => {
    await deal.save({ session });
    await timeline.record(
      {
        action: TIMELINE_ACTIONS.DEAL_CREATED,
        entityType: 'deal',
        entityId: deal._id,
        performedBy: actor._id,
        newValue: { name: deal.name, value: deal.value, stage: deal.stage, probability: deal.probability },
        ...dealContext(deal),
      },
      session,
    );
  });

  return deal.populate(DETAIL_POPULATE);
}

async function listDeals(query, actor) {
  const scope = await dealScope(actor);

  const filters = compact({
    stage: inOrEquals(query.stage),
    status: inOrEquals(query.status),
    assignedTo: query.assignedTo,
    customer: query.customer,
    lead: query.lead,
    value: buildRange(query.minAmount, query.maxAmount),
    expectedCloseDate: buildRange(query.closeDateFrom, query.closeDateTo),
    createdAt: buildRange(query.createdFrom, query.createdTo),
  });

  const filter = combineFilters(scope, filters, buildSearchFilter(query.search, ['name', 'description']));
  return paginate(Deal, filter, { page: query.page, limit: query.limit, sort: query.sort, populate: LIST_POPULATE });
}

async function getDeal(id, actor) {
  return findDeal(id, actor, { populate: DETAIL_POPULATE });
}

/** General field updates. Stage changes go through `changeStage`. Closed deals are frozen. */
async function updateDeal(id, updates, actor) {
  const config = await configService.getConfig();

  const deal = await runInTransaction(async (session) => {
    const doc = await findDeal(id, actor, { session });

    const editableWhenClosed = ['description'];
    if (isClosed(doc.stage) && Object.keys(updates).some((field) => !editableWhenClosed.includes(field))) {
      throw AppError.businessRule(`Deal is closed (${doc.stage}); only the description can be changed. Reopen the deal first.`);
    }

    if (updates.expectedCloseDate && updates.expectedCloseDate.getTime() !== doc.expectedCloseDate.getTime()) {
      assertValidCloseDate(updates.expectedCloseDate, config);
    }

    const previous = {};
    const next = {};
    for (const [field, value] of Object.entries(updates)) {
      const current = doc[field];
      const incoming = value ?? undefined;
      const same = current instanceof Date ? current.getTime() === incoming?.getTime() : current === incoming;
      if (!same) {
        previous[field] = current ?? null;
        next[field] = incoming ?? null;
        doc[field] = incoming;
      }
    }
    if (Object.keys(next).length === 0) return doc;

    const previousExpectedRevenue = doc.expectedRevenue;
    await doc.save({ session });
    if (doc.expectedRevenue !== previousExpectedRevenue) {
      previous.expectedRevenue = previousExpectedRevenue;
      next.expectedRevenue = doc.expectedRevenue;
    }

    await timeline.record(
      {
        action: TIMELINE_ACTIONS.DEAL_UPDATED,
        entityType: 'deal',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: previous,
        newValue: next,
        ...dealContext(doc),
      },
      session,
    );
    return doc;
  });

  return deal.populate(DETAIL_POPULATE);
}

/**
 * Stage state machine:
 *   open  -> any other open stage (probability defaults to the configured stage probability)
 *   open  -> won   (deal must be valid: value > 0, customer exists, owner active; probability = 100)
 *   open  -> lost  (lostReason required; probability = 0)
 *   won/lost -> open  only by admin/manager with a reopenReason (deal_reopened is audited)
 *   won <-> lost  never directly
 */
async function changeStage(id, payload, actor) {
  const config = await configService.getConfig();
  const { stage, probability, lostReason, reopenReason, finalValue } = payload;

  const deal = await runInTransaction(async (session) => {
    const doc = await findDeal(id, actor, { session });
    const from = doc.stage;

    if (from === stage) throw AppError.businessRule(`Deal is already in stage "${stage}"`);

    const events = [];
    const base = { entityType: 'deal', entityId: doc._id, performedBy: actor._id, ...dealContext(doc) };

    if (isClosed(from)) {
      if (isClosed(stage)) {
        throw AppError.businessRule(`A ${from} deal cannot be moved directly to ${stage}. Reopen it first.`);
      }
      if (actor.role === ROLES.SALES_EXECUTIVE) {
        throw AppError.forbidden('Only managers or admins can reopen a closed deal');
      }
      if (!reopenReason || reopenReason.length < 3) {
        throw AppError.businessRule('A reopenReason is required to move a closed deal back to an active stage', [
          { field: 'reopenReason', message: 'Required when reopening a closed deal' },
        ]);
      }
      if (doc.expectedCloseDate < startOfDay()) {
        throw AppError.businessRule('Update the expected closing date to a future date before reopening this deal');
      }
      doc.closedAt = null;
      doc.closedBy = null;
      doc.lostReason = undefined;
      events.push({ ...base, action: TIMELINE_ACTIONS.DEAL_REOPENED, previousValue: from, newValue: stage, message: reopenReason });
    }

    if (stage === DEAL_STAGE.WON) {
      if (finalValue !== undefined) doc.value = finalValue;
      // Sequential on purpose: operations sharing a transaction session must not run in parallel.
      const customerExists = await Customer.exists({ _id: doc.customer }).session(session);
      const ownerActive = await User.exists({ _id: doc.assignedTo, isActive: true }).session(session);
      if (!(doc.value > 0)) throw AppError.businessRule('A won deal must have a value greater than zero');
      if (!customerExists) throw AppError.businessRule('A won deal must be linked to an existing customer');
      if (!ownerActive) throw AppError.businessRule('A won deal must be assigned to an active sales user');
      doc.lostReason = undefined;
    }

    if (stage === DEAL_STAGE.LOST) doc.lostReason = lostReason;

    if (isClosed(stage)) {
      doc.closedAt = new Date();
      doc.closedBy = actor._id;
    }

    const previousProbability = doc.probability;
    doc.stage = stage;
    doc.probability = probability ?? defaultProbability(stage, config);
    await doc.save({ session });

    events.push({
      ...base,
      action: TIMELINE_ACTIONS.DEAL_STAGE_CHANGED,
      previousValue: { stage: from, probability: previousProbability },
      newValue: { stage, probability: doc.probability },
    });
    if (stage === DEAL_STAGE.WON) {
      events.push({ ...base, action: TIMELINE_ACTIONS.DEAL_WON, newValue: { value: doc.value, currency: doc.currency } });
    }
    if (stage === DEAL_STAGE.LOST) {
      events.push({ ...base, action: TIMELINE_ACTIONS.DEAL_LOST, newValue: { value: doc.value }, message: lostReason });
    }

    await timeline.record(events, session);
    return doc;
  });

  return deal.populate(DETAIL_POPULATE);
}

async function assignDeal(id, { assignedTo }, actor) {
  const assignee = await access.assertAssignable(actor, assignedTo, { allowedRoles: ASSIGNABLE_ROLES });

  const deal = await runInTransaction(async (session) => {
    const doc = await findDeal(id, actor, { session, populate: { path: 'assignedTo', select: 'name email' } });
    if (isClosed(doc.stage)) throw AppError.businessRule('Closed deals cannot be reassigned');
    if (String(doc.assignedTo?._id) === String(assignee._id)) {
      throw AppError.businessRule('Deal is already assigned to this user');
    }

    const previous = doc.assignedTo;
    doc.assignedTo = assignee._id;
    await doc.save({ session });

    await timeline.record(
      {
        action: TIMELINE_ACTIONS.DEAL_ASSIGNED,
        entityType: 'deal',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: previous ? { _id: previous._id, name: previous.name, email: previous.email } : null,
        newValue: { _id: assignee._id, name: assignee.name, email: assignee.email },
        ...dealContext(doc),
      },
      session,
    );
    return doc;
  });

  return deal.populate(DETAIL_POPULATE);
}

/** Won deals are revenue records: only admins may delete them. */
async function deleteDeal(id, actor) {
  await runInTransaction(async (session) => {
    const doc = await findDeal(id, actor, { session });
    if (doc.stage === DEAL_STAGE.WON && actor.role !== ROLES.ADMIN) {
      throw AppError.forbidden('Only admins can delete won deals');
    }

    await Activity.deleteMany({ relatedType: 'deal', relatedId: doc._id }, { session });
    await Lead.updateOne({ deal: doc._id }, { $set: { deal: null } }, { session });
    await Deal.deleteOne({ _id: doc._id }, { session });

    await timeline.record(
      {
        action: TIMELINE_ACTIONS.DEAL_DELETED,
        entityType: 'deal',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: { name: doc.name, value: doc.value, stage: doc.stage },
        ...dealContext(doc),
      },
      session,
    );
  });
}

module.exports = {
  OPEN_DEAL_STAGES,
  findDeal,
  buildDeal,
  createDeal,
  listDeals,
  getDeal,
  updateDeal,
  changeStage,
  assignDeal,
  deleteDeal,
  DETAIL_POPULATE,
};
