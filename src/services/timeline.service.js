const { TimelineEvent, Lead, Customer, Deal } = require('../models');
const { paginate, buildRange, inOrEquals, compact } = require('../utils/query');
const access = require('./access.service');

const ENTITY_MODELS = { lead: Lead, customer: Customer, deal: Deal };

/**
 * Records one or more timeline events. Pass the transaction session so audit entries are
 * committed (or rolled back) atomically with the change they describe.
 *
 * event: { action, entityType, entityId, performedBy, previousValue?, newValue?, message?, lead?, customer?, deal? }
 */
async function record(events, session) {
  const docs = [].concat(events).map((event) => compact({ ...event }));
  if (docs.length === 0) return [];
  return TimelineEvent.insertMany(docs, session ? { session } : {});
}

/** Builds the context references for an event about a lead/customer/deal. */
function contextOf({ lead, customer, deal } = {}) {
  return compact({
    lead: lead?._id ?? lead ?? undefined,
    customer: customer?._id ?? customer ?? undefined,
    deal: deal?._id ?? deal ?? undefined,
  });
}

/**
 * Timeline of a lead, customer or deal (including events of related records that carry it
 * as context). Access is checked against the entity first.
 */
async function getEntityTimeline(entityType, entityId, actor, query) {
  const Model = ENTITY_MODELS[entityType];
  const scope = await access.ownershipScope(actor, { includeUnassigned: entityType === 'lead' });
  await access.findInScope(Model, entityId, scope, { entityName: Model.modelName, select: '_id' });

  const filter = compact({
    [entityType]: entityId,
    action: inOrEquals(query.action),
    createdAt: buildRange(query.createdFrom, query.createdTo),
  });

  return paginate(TimelineEvent, filter, {
    page: query.page,
    limit: query.limit,
    sort: '-createdAt',
    populate: { path: 'performedBy', select: 'name email role' },
  });
}

/** Global audit log (admin only). */
async function listEvents(query) {
  const filter = compact({
    action: inOrEquals(query.action),
    entityType: query.entityType,
    entityId: query.entityId,
    performedBy: query.performedBy,
    createdAt: buildRange(query.createdFrom, query.createdTo),
  });

  return paginate(TimelineEvent, filter, {
    page: query.page,
    limit: query.limit,
    sort: '-createdAt',
    populate: { path: 'performedBy', select: 'name email role' },
  });
}

module.exports = { record, contextOf, getEntityTimeline, listEvents };
