const { Activity, Lead, Customer, Deal } = require('../models');
const { ROLES, ACTIVITY_STATUS, TIMELINE_ACTIONS } = require('../constants');
const AppError = require('../utils/AppError');
const { paginate, buildSearchFilter, buildRange, inOrEquals, combineFilters, compact } = require('../utils/query');
const { runInTransaction } = require('../utils/transaction');
const access = require('./access.service');
const timeline = require('./timeline.service');

const ALL_ROLES = Object.values(ROLES);
// Small grace period so a client clock slightly behind the server does not reject "now".
const PAST_DUE_GRACE_MS = 5 * 60 * 1000;

const POPULATE = [
  { path: 'assignedTo', select: 'name email role' },
  { path: 'createdBy', select: 'name email' },
  { path: 'completedBy', select: 'name email' },
  { path: 'relatedId', select: 'name email company stage status' },
];

const present = (activity) => Activity.withEffectiveStatus(activity);

/**
 * Verifies the actor can access the related record and returns the timeline context
 * (lead/customer/deal ids) for events about this activity.
 */
async function resolveRelated(relatedType, relatedId, actor) {
  if (!relatedType) return {};

  if (relatedType === 'user') {
    if (!(await access.canSeeUser(actor, relatedId))) throw AppError.notFound('User');
    return {};
  }

  if (relatedType === 'lead') {
    const scope = await access.ownershipScope(actor, { includeUnassigned: true });
    const lead = await access.findInScope(Lead, relatedId, scope, { entityName: 'Lead', select: '_id' });
    return { lead: lead._id };
  }

  const scope = await access.ownershipScope(actor);
  if (relatedType === 'customer') {
    const customer = await access.findInScope(Customer, relatedId, scope, { entityName: 'Customer', select: '_id lead' });
    return timeline.contextOf({ customer: customer._id, lead: customer.lead });
  }

  const deal = await access.findInScope(Deal, relatedId, scope, { entityName: 'Deal', select: '_id lead customer' });
  return timeline.contextOf({ deal: deal._id, customer: deal.customer, lead: deal.lead });
}

/** Timeline context for an existing activity (access was already checked on the activity itself). */
async function contextOfActivity(activity, session) {
  const { relatedType, relatedId } = activity;
  if (relatedType === 'lead') return { lead: relatedId };
  if (relatedType === 'customer') {
    const customer = await Customer.findById(relatedId).select('lead').session(session).lean();
    return timeline.contextOf({ customer: relatedId, lead: customer?.lead });
  }
  if (relatedType === 'deal') {
    const deal = await Deal.findById(relatedId).select('lead customer').session(session).lean();
    return timeline.contextOf({ deal: relatedId, customer: deal?.customer, lead: deal?.lead });
  }
  return {};
}

function creationAction(type) {
  if (type === 'note') return TIMELINE_ACTIONS.NOTE_ADDED;
  if (type === 'follow_up') return TIMELINE_ACTIONS.FOLLOW_UP_CREATED;
  return TIMELINE_ACTIONS.ACTIVITY_CREATED;
}

function assertDueDateNotPast(dueDate) {
  if (dueDate && dueDate.getTime() < Date.now() - PAST_DUE_GRACE_MS) {
    throw AppError.businessRule('Due date cannot be in the past', [{ field: 'dueDate', message: 'Must be a future date' }]);
  }
}

async function findActivity(id, actor, options = {}) {
  return access.findInScope(Activity, id, await access.activityScope(actor), { entityName: 'Activity', ...options });
}

async function createActivity(data, actor) {
  const context = await resolveRelated(data.relatedType, data.relatedId, actor);

  const assigneeId = data.assignedTo
    ? (await access.assertAssignable(actor, data.assignedTo, { allowedRoles: ALL_ROLES }))._id
    : actor._id;

  const isNote = data.type === 'note';
  if (!isNote) assertDueDateNotPast(data.dueDate);

  const activity = await runInTransaction(async (session) => {
    const [created] = await Activity.create(
      [
        {
          ...data,
          assignedTo: assigneeId,
          createdBy: actor._id,
          // A note is a record of something that happened, so it is complete when logged.
          ...(isNote && { status: ACTIVITY_STATUS.COMPLETED, completedAt: new Date(), completedBy: actor._id }),
        },
      ],
      { session },
    );

    await timeline.record(
      {
        action: creationAction(created.type),
        entityType: 'activity',
        entityId: created._id,
        performedBy: actor._id,
        newValue: { type: created.type, title: created.title, dueDate: created.dueDate, assignedTo: assigneeId },
        ...context,
      },
      session,
    );
    return created;
  });

  await activity.populate(POPULATE);
  return present(activity);
}

async function listActivities(query, actor) {
  let scope = await access.activityScope(actor);

  // Anyone who can access a lead/customer/deal can see that record's full activity history,
  // including activities logged by its previous owners.
  if (query.relatedId && ['lead', 'customer', 'deal'].includes(query.relatedType)) {
    await resolveRelated(query.relatedType, query.relatedId, actor);
    scope = {};
  }

  const now = new Date();
  const filters = compact({
    type: inOrEquals(query.type),
    assignedTo: query.assignedTo,
    createdBy: query.createdBy,
    relatedType: query.relatedType,
    relatedId: query.relatedId,
    dueDate: buildRange(query.dueFrom, query.dueTo),
    createdAt: buildRange(query.createdFrom, query.createdTo),
  });

  const filter = combineFilters(
    scope,
    filters,
    query.status ? Activity.statusFilter(query.status, now) : null,
    buildSearchFilter(query.search, ['title', 'description']),
  );

  const result = await paginate(Activity, filter, {
    page: query.page,
    limit: query.limit,
    sort: query.sort,
    populate: POPULATE,
  });
  return { ...result, items: result.items.map((item) => Activity.withEffectiveStatus(item, now)) };
}

async function getActivity(id, actor) {
  return present(await findActivity(id, actor, { populate: POPULATE }));
}

/** Only the creator, the assignee, or a manager/admin in scope may change an activity. */
function assertCanModify(activity, actor) {
  if (actor.role !== ROLES.SALES_EXECUTIVE) return;
  const own = [String(activity.createdBy), String(activity.assignedTo)].includes(String(actor._id));
  if (!own) throw AppError.forbidden('You can only modify your own activities');
}

async function updateActivity(id, updates, actor) {
  if (updates.dueDate) assertDueDateNotPast(updates.dueDate);
  const assignee = updates.assignedTo
    ? await access.assertAssignable(actor, updates.assignedTo, { allowedRoles: ALL_ROLES })
    : null;

  const activity = await runInTransaction(async (session) => {
    const doc = await findActivity(id, actor, { session });
    assertCanModify(doc, actor);
    if (doc.status === ACTIVITY_STATUS.COMPLETED) {
      throw AppError.businessRule('Completed activities cannot be modified');
    }

    if (updates.title !== undefined) doc.title = updates.title;
    if (updates.description !== undefined) doc.description = updates.description ?? undefined;
    if (updates.dueDate !== undefined) doc.dueDate = updates.dueDate;
    if (assignee) doc.assignedTo = assignee._id;
    await doc.save({ session });
    return doc;
  });

  await activity.populate(POPULATE);
  return present(activity);
}

async function completeActivity(id, { outcome }, actor) {
  const activity = await runInTransaction(async (session) => {
    const doc = await findActivity(id, actor, { session });
    assertCanModify(doc, actor);
    if (doc.status === ACTIVITY_STATUS.COMPLETED) throw AppError.conflict('Activity is already completed');

    const wasOverdue = Boolean(doc.dueDate && doc.dueDate < new Date());
    doc.status = ACTIVITY_STATUS.COMPLETED;
    doc.completedAt = new Date();
    doc.completedBy = actor._id;
    if (outcome) doc.outcome = outcome;
    await doc.save({ session });

    const context = await contextOfActivity(doc, session);
    await timeline.record(
      {
        action: doc.type === 'follow_up' ? TIMELINE_ACTIONS.FOLLOW_UP_COMPLETED : TIMELINE_ACTIONS.ACTIVITY_COMPLETED,
        entityType: 'activity',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: wasOverdue ? ACTIVITY_STATUS.OVERDUE : ACTIVITY_STATUS.PENDING,
        newValue: ACTIVITY_STATUS.COMPLETED,
        message: outcome,
        ...context,
      },
      session,
    );
    return doc;
  });

  await activity.populate(POPULATE);
  return present(activity);
}

async function deleteActivity(id, actor) {
  await runInTransaction(async (session) => {
    const doc = await findActivity(id, actor, { session });
    if (actor.role === ROLES.SALES_EXECUTIVE && String(doc.createdBy) !== String(actor._id)) {
      throw AppError.forbidden('You can only delete activities you created');
    }

    await Activity.deleteOne({ _id: doc._id }, { session });
    const context = await contextOfActivity(doc, session);
    await timeline.record(
      {
        action: TIMELINE_ACTIONS.ACTIVITY_DELETED,
        entityType: 'activity',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: { type: doc.type, title: doc.title, status: doc.status },
        ...context,
      },
      session,
    );
  });
}

module.exports = { createActivity, listActivities, getActivity, updateActivity, completeActivity, deleteActivity };
