const { Customer, Deal, Activity } = require('../models');
const { ROLES, TIMELINE_ACTIONS } = require('../constants');
const AppError = require('../utils/AppError');
const { paginate, buildSearchFilter, buildRange, inOrEquals, combineFilters, compact } = require('../utils/query');
const { runInTransaction } = require('../utils/transaction');
const access = require('./access.service');
const timeline = require('./timeline.service');

const ASSIGNABLE_ROLES = [ROLES.SALES_EXECUTIVE, ROLES.SALES_MANAGER];

const LIST_POPULATE = [{ path: 'assignedTo', select: 'name email role' }];

const DETAIL_POPULATE = [
  ...LIST_POPULATE,
  { path: 'createdBy', select: 'name email' },
  { path: 'lead', select: 'name email company source status convertedAt' },
  {
    path: 'deals',
    select: 'name value currency stage status probability expectedRevenue expectedCloseDate assignedTo',
    options: { sort: { createdAt: -1 }, limit: 50 },
  },
];

const customerContext = (customer) => timeline.contextOf({ lead: customer.lead, customer: customer._id });

async function findCustomer(id, actor, options = {}) {
  return access.findInScope(Customer, id, await access.ownershipScope(actor), { entityName: 'Customer', ...options });
}

async function createCustomer(data, actor) {
  let assignedTo = actor._id;
  if (data.assignedTo) {
    assignedTo = (await access.assertAssignable(actor, data.assignedTo, { allowedRoles: ASSIGNABLE_ROLES }))._id;
  } else if (actor.role === ROLES.ADMIN) {
    throw AppError.badRequest('assignedTo is required when an admin creates a customer');
  }

  const customer = await runInTransaction(async (session) => {
    const [created] = await Customer.create([{ ...data, assignedTo, createdBy: actor._id }], { session });
    await timeline.record(
      {
        action: TIMELINE_ACTIONS.CUSTOMER_CREATED,
        entityType: 'customer',
        entityId: created._id,
        performedBy: actor._id,
        newValue: { name: created.name, email: created.email, company: created.company },
        ...customerContext(created),
      },
      session,
    );
    return created;
  });

  return customer.populate(DETAIL_POPULATE);
}

async function listCustomers(query, actor) {
  const scope = await access.ownershipScope(actor);

  let leadFilter = query.lead;
  if (query.fromLead === true && !leadFilter) leadFilter = { $ne: null };
  if (query.fromLead === false) leadFilter = null;

  const filters = compact({
    status: inOrEquals(query.status),
    assignedTo: query.assignedTo,
    lead: leadFilter,
    createdAt: buildRange(query.createdFrom, query.createdTo),
  });

  const filter = combineFilters(scope, filters, buildSearchFilter(query.search, ['name', 'email', 'company', 'phone']));
  return paginate(Customer, filter, { page: query.page, limit: query.limit, sort: query.sort, populate: LIST_POPULATE });
}

async function getCustomer(id, actor) {
  return findCustomer(id, actor, { populate: DETAIL_POPULATE });
}

async function updateCustomer(id, updates, actor) {
  const customer = await runInTransaction(async (session) => {
    const doc = await findCustomer(id, actor, { session });

    const previous = {};
    const next = {};
    for (const [field, value] of Object.entries(updates)) {
      const current = field === 'address' ? JSON.stringify(doc.address ?? null) : doc[field];
      const incoming = field === 'address' ? JSON.stringify(value ?? null) : value ?? undefined;
      if (current !== incoming) {
        previous[field] = field === 'address' ? doc.address ?? null : doc[field] ?? null;
        next[field] = value ?? null;
        doc[field] = value ?? undefined;
      }
    }
    if (Object.keys(next).length === 0) return doc;

    await doc.save({ session });
    await timeline.record(
      {
        action: TIMELINE_ACTIONS.CUSTOMER_UPDATED,
        entityType: 'customer',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: previous,
        newValue: next,
        ...customerContext(doc),
      },
      session,
    );
    return doc;
  });

  return customer.populate(DETAIL_POPULATE);
}

async function assignCustomer(id, { assignedTo }, actor) {
  const assignee = await access.assertAssignable(actor, assignedTo, { allowedRoles: ASSIGNABLE_ROLES });

  const customer = await runInTransaction(async (session) => {
    const doc = await findCustomer(id, actor, { session, populate: { path: 'assignedTo', select: 'name email' } });
    if (String(doc.assignedTo?._id) === String(assignee._id)) {
      throw AppError.businessRule('Customer is already assigned to this user');
    }
    const previous = doc.assignedTo;
    doc.assignedTo = assignee._id;
    await doc.save({ session });

    await timeline.record(
      {
        action: TIMELINE_ACTIONS.CUSTOMER_ASSIGNED,
        entityType: 'customer',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: previous ? { _id: previous._id, name: previous.name, email: previous.email } : null,
        newValue: { _id: assignee._id, name: assignee.name, email: assignee.email },
        ...customerContext(doc),
      },
      session,
    );
    return doc;
  });

  return customer.populate(DETAIL_POPULATE);
}

/**
 * Customers that came from a lead conversion or that have deals are part of the sales history
 * and cannot be deleted — set their status to inactive/churned instead.
 */
async function deleteCustomer(id, actor) {
  await runInTransaction(async (session) => {
    const doc = await findCustomer(id, actor, { session });

    if (doc.lead) {
      throw AppError.conflict('Customers created from a lead conversion cannot be deleted; set status to inactive instead');
    }
    if (await Deal.exists({ customer: doc._id }).session(session)) {
      throw AppError.conflict('Customer has deals and cannot be deleted; set status to inactive instead');
    }

    await Activity.deleteMany({ relatedType: 'customer', relatedId: doc._id }, { session });
    await Customer.deleteOne({ _id: doc._id }, { session });

    await timeline.record(
      {
        action: TIMELINE_ACTIONS.CUSTOMER_DELETED,
        entityType: 'customer',
        entityId: doc._id,
        performedBy: actor._id,
        previousValue: { name: doc.name, email: doc.email },
        ...customerContext(doc),
      },
      session,
    );
  });
}

module.exports = {
  findCustomer,
  createCustomer,
  listCustomers,
  getCustomer,
  updateCustomer,
  assignCustomer,
  deleteCustomer,
  DETAIL_POPULATE,
};
