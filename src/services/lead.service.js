const { Lead, Activity } = require('../models');
const { LEAD_STATUS, LEAD_STATUS_TRANSITIONS, TIMELINE_ACTIONS, ROLES } = require('../constants');
const AppError = require('../utils/AppError');
const { paginate, buildSearchFilter, buildRange, inOrEquals, combineFilters, compact } = require('../utils/query');
const { runInTransaction } = require('../utils/transaction');
const access = require('./access.service');
const timeline = require('./timeline.service');

const LIST_POPULATE = [
  { path: 'assignedTo', select: 'name email role' },
  { path: 'createdBy', select: 'name email' },
];

const DETAIL_POPULATE = [
  ...LIST_POPULATE,
  { path: 'convertedBy', select: 'name email' },
  { path: 'customer', select: 'name email company status' },
  { path: 'deal', select: 'name value stage status expectedCloseDate' },
];

const userSummary = (user) => (user ? { _id: user._id, name: user.name, email: user.email } : null);

const leadScope = (actor) => access.ownershipScope(actor, { includeUnassigned: true });

async function findLead(id, actor, options = {}) {
  return access.findInScope(Lead, id, await leadScope(actor), { entityName: 'Lead', ...options });
}

function assertNotConverted(lead) {
  if (lead.status === LEAD_STATUS.CONVERTED) {
    throw AppError.conflict('Converted leads are read-only; manage the related customer and deal instead');
  }
}

async function createLead(data, actor) {
  let assignee = null;
  if (data.assignedTo) {
    assignee = await access.assertAssignable(actor, data.assignedTo);
  } else if (actor.role === ROLES.SALES_EXECUTIVE) {
    // Executives own the leads they create.
    assignee = { _id: actor._id, name: actor.name, email: actor.email };
  }

  const lead = await runInTransaction(async (session) => {
    const [created] = await Lead.create(
      [{ ...data, assignedTo: assignee?._id ?? null, createdBy: actor._id }],
      { session },
    );

    const events = [
      {
        action: TIMELINE_ACTIONS.LEAD_CREATED,
        entityType: 'lead',
        entityId: created._id,
        performedBy: actor._id,
        newValue: { name: created.name, status: created.status, source: created.source, priority: created.priority },
        lead: created._id,
      },
    ];
    if (assignee) {
      events.push({
        action: TIMELINE_ACTIONS.LEAD_ASSIGNED,
        entityType: 'lead',
        entityId: created._id,
        performedBy: actor._id,
        previousValue: null,
        newValue: userSummary(assignee),
        lead: created._id,
      });
    }
    await timeline.record(events, session);
    return created;
  });

  return lead.populate(DETAIL_POPULATE);
}

async function listLeads(query, actor) {
  const scope = await leadScope(actor);

  const filters = compact({
    status: inOrEquals(query.status),
    priority: inOrEquals(query.priority),
    source: inOrEquals(query.source),
    assignedTo: query.assignedTo === 'unassigned' ? null : query.assignedTo,
    createdBy: query.createdBy,
    createdAt: buildRange(query.createdFrom, query.createdTo),
    updatedAt: buildRange(query.updatedFrom, query.updatedTo),
  });

  const filter = combineFilters(
    scope,
    filters,
    buildSearchFilter(query.search, ['name', 'email', 'company', 'phone']),
  );

  return paginate(Lead, filter, { page: query.page, limit: query.limit, sort: query.sort, populate: LIST_POPULATE });
}

async function getLead(id, actor) {
  return findLead(id, actor, { populate: DETAIL_POPULATE });
}

async function updateLead(id, updates, actor) {
  const lead = await runInTransaction(async (session) => {
    const doc = await findLead(id, actor, { session });
    assertNotConverted(doc);

    const changes = {};
    for (const [field, value] of Object.entries(updates)) {
      const next = value ?? undefined;
      if (String(doc[field] ?? '') !== String(next ?? '')) {
        changes[field] = { from: doc[field] ?? null, to: next ?? null };
        doc[field] = next;
      }
    }
    if (Object.keys(changes).length === 0) return doc;

    await doc.save({ session });

    const events = [];
    const context = { entityType: 'lead', entityId: doc._id, performedBy: actor._id, lead: doc._id };

    if (changes.priority) {
      events.push({
        ...context,
        action: TIMELINE_ACTIONS.LEAD_PRIORITY_CHANGED,
        previousValue: changes.priority.from,
        newValue: changes.priority.to,
      });
      delete changes.priority;
    }
    if (Object.keys(changes).length > 0) {
      events.push({
        ...context,
        action: TIMELINE_ACTIONS.LEAD_UPDATED,
        previousValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.from])),
        newValue: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, v.to])),
      });
    }
    await timeline.record(events, session);
    return doc;
  });

  return lead.populate(DETAIL_POPULATE);
}

async function updateLeadStatus(id, { status, reason }, actor) {
  const lead = await runInTransaction(async (session) => {
    const doc = await findLead(id, actor, { session });
    assertNotConverted(doc);

    if (doc.status === status) {
      throw AppError.businessRule(`Lead is already "${status}"`);
    }
    const allowed = LEAD_STATUS_TRANSITIONS[doc.status] || [];
    if (!allowed.includes(status)) {
      throw AppError.businessRule(`Invalid status transition from "${doc.status}" to "${status}"`, {
        allowedTransitions: allowed,
      });
    }

    const previous = doc.status;
    doc.status = status;
    doc.lostReason = status === LEAD_STATUS.LOST ? reason : undefined;
    await doc.save({ session });

    await timeline.record(
      {
        action: TIMELINE_ACTIONS.LEAD_STATUS_CHANGED,
        entityType: 'lead',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: previous,
        newValue: status,
        message: reason,
        lead: doc._id,
      },
      session,
    );
    return doc;
  });

  return lead.populate(DETAIL_POPULATE);
}

/** Admin: any lead to any active executive. Manager: team leads to team executives. */
async function assignLead(id, { assignedTo, note }, actor) {
  const assignee = await access.assertAssignable(actor, assignedTo);

  const lead = await runInTransaction(async (session) => {
    const doc = await findLead(id, actor, { session, populate: { path: 'assignedTo', select: 'name email' } });
    assertNotConverted(doc);

    const previous = doc.assignedTo;
    if (previous && String(previous._id) === String(assignee._id)) {
      throw AppError.businessRule('Lead is already assigned to this user');
    }

    doc.assignedTo = assignee._id;
    await doc.save({ session });

    await timeline.record(
      {
        action: previous ? TIMELINE_ACTIONS.LEAD_REASSIGNED : TIMELINE_ACTIONS.LEAD_ASSIGNED,
        entityType: 'lead',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: userSummary(previous),
        newValue: userSummary(assignee),
        message: note,
        lead: doc._id,
      },
      session,
    );
    return doc;
  });

  return lead.populate(DETAIL_POPULATE);
}

/** Converted leads are part of the customer/deal lineage and cannot be deleted. */
async function deleteLead(id, actor) {
  await runInTransaction(async (session) => {
    const doc = await findLead(id, actor, { session });
    if (doc.status === LEAD_STATUS.CONVERTED) {
      throw AppError.conflict('Converted leads cannot be deleted because customers and deals reference them');
    }

    await Activity.deleteMany({ relatedType: 'lead', relatedId: doc._id }, { session });
    await Lead.deleteOne({ _id: doc._id }, { session });

    await timeline.record(
      {
        action: TIMELINE_ACTIONS.LEAD_DELETED,
        entityType: 'lead',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: { name: doc.name, email: doc.email, status: doc.status },
        lead: doc._id,
      },
      session,
    );
  });
}

module.exports = {
  findLead,
  createLead,
  listLeads,
  getLead,
  updateLead,
  updateLeadStatus,
  assignLead,
  deleteLead,
  DETAIL_POPULATE,
};
