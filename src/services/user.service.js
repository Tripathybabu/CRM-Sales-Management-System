const { User, Lead, Customer, Deal, Activity } = require('../models');
const { ROLES, TIMELINE_ACTIONS } = require('../constants');
const AppError = require('../utils/AppError');
const { paginate, buildSearchFilter, buildRange, inOrEquals, combineFilters, compact } = require('../utils/query');
const { runInTransaction } = require('../utils/transaction');
const access = require('./access.service');
const timeline = require('./timeline.service');
const tokenService = require('./token.service');

const USER_POPULATE = { path: 'manager', select: 'name email role isActive' };

async function assertValidManager(managerId) {
  if (!managerId) return;
  const manager = await User.findById(managerId).select('role isActive').lean();
  if (!manager || manager.role !== ROLES.SALES_MANAGER) {
    throw AppError.businessRule('Manager must be an existing user with the sales_manager role');
  }
  if (!manager.isActive) throw AppError.businessRule('Manager must be an active user');
}

async function createUser(data, actor) {
  await assertValidManager(data.manager);

  return runInTransaction(async (session) => {
    const [user] = await User.create([{ ...data, manager: data.manager ?? null }], { session });
    await timeline.record(
      {
        action: TIMELINE_ACTIONS.USER_CREATED,
        entityType: 'user',
        entityId: user._id,
        performedBy: actor._id,
        newValue: { name: user.name, email: user.email, role: user.role },
      },
      session,
    );
    return user;
  });
}

/** Admins see all users; managers see themselves and their team. */
async function listUsers(query, actor) {
  const visibleIds = await access.getVisibleUserIds(actor);
  const scope = visibleIds === null ? {} : { _id: { $in: visibleIds } };

  const filters = compact({
    role: inOrEquals(query.role),
    isActive: query.isActive,
    manager: query.manager,
    createdAt: buildRange(query.createdFrom, query.createdTo),
  });

  const filter = combineFilters(scope, filters, buildSearchFilter(query.search, ['name', 'email']));
  return paginate(User, filter, { page: query.page, limit: query.limit, sort: query.sort, populate: USER_POPULATE });
}

async function getUser(id, actor) {
  if (!(await access.canSeeUser(actor, id))) throw AppError.notFound('User');
  const user = await User.findById(id).populate(USER_POPULATE);
  if (!user) throw AppError.notFound('User');
  return user;
}

async function updateUser(id, updates, actor) {
  const user = await User.findById(id).select('+tokenVersion');
  if (!user) throw AppError.notFound('User');

  const isSelf = String(user._id) === String(actor._id);
  if (isSelf && updates.role && updates.role !== user.role) {
    throw AppError.businessRule('You cannot change your own role');
  }

  const nextRole = updates.role ?? user.role;

  if (user.role === ROLES.SALES_MANAGER && nextRole !== ROLES.SALES_MANAGER) {
    const teamSize = await User.countDocuments({ manager: user._id });
    if (teamSize > 0) {
      throw AppError.conflict(`This manager still has ${teamSize} team member(s). Reassign them before changing the role.`);
    }
  }

  if (updates.manager !== undefined && updates.manager !== null && nextRole !== ROLES.SALES_EXECUTIVE) {
    throw AppError.businessRule('Only sales executives can report to a manager');
  }
  if (updates.manager) {
    if (String(updates.manager) === String(user._id)) throw AppError.businessRule('A user cannot be their own manager');
    await assertValidManager(updates.manager);
  }

  const previous = { name: user.name, email: user.email, phone: user.phone, role: user.role, manager: user.manager };

  for (const field of ['name', 'email', 'role']) {
    if (updates[field] !== undefined) user[field] = updates[field];
  }
  if (updates.phone !== undefined) user.phone = updates.phone ?? undefined;
  if (updates.manager !== undefined) user.manager = updates.manager;
  if (nextRole !== ROLES.SALES_EXECUTIVE) user.manager = null;

  const passwordReset = Boolean(updates.password);
  const roleChanged = previous.role !== user.role;
  if (passwordReset) user.password = updates.password;
  // Role change or admin password reset invalidates existing sessions so new permissions apply immediately.
  if (passwordReset || roleChanged) user.tokenVersion += 1;

  await runInTransaction(async (session) => {
    await user.save({ session });
    if (passwordReset || roleChanged) await tokenService.revokeAllForUser(user._id, session);

    const changedFields = Object.keys(updates).filter((key) => key !== 'password');
    await timeline.record(
      {
        action: TIMELINE_ACTIONS.USER_UPDATED,
        entityType: 'user',
        entityId: user._id,
        performedBy: actor._id,
        previousValue: Object.fromEntries(changedFields.map((key) => [key, previous[key]])),
        newValue: {
          ...Object.fromEntries(changedFields.map((key) => [key, user[key]])),
          ...(passwordReset && { passwordReset: true }),
        },
      },
      session,
    );
  });
  return user.populate(USER_POPULATE);
}

async function setUserStatus(id, isActive, actor) {
  if (String(id) === String(actor._id)) {
    throw AppError.businessRule('You cannot change the status of your own account');
  }

  const user = await User.findById(id).select('+tokenVersion');
  if (!user) throw AppError.notFound('User');
  if (user.isActive === isActive) {
    throw AppError.conflict(`User is already ${isActive ? 'active' : 'inactive'}`);
  }

  user.isActive = isActive;
  if (!isActive) user.tokenVersion += 1;

  await runInTransaction(async (session) => {
    await user.save({ session });
    if (!isActive) await tokenService.revokeAllForUser(user._id, session);
    await timeline.record(
      {
        action: isActive ? TIMELINE_ACTIONS.USER_ACTIVATED : TIMELINE_ACTIONS.USER_DEACTIVATED,
        entityType: 'user',
        entityId: user._id,
        performedBy: actor._id,
        previousValue: { isActive: !isActive },
        newValue: { isActive },
      },
      session,
    );
  });
  return user.populate(USER_POPULATE);
}

/**
 * Hard delete is only allowed for users without CRM history; otherwise deactivation is the
 * correct operation, so ownership and the audit trail stay intact.
 */
async function deleteUser(id, actor) {
  if (String(id) === String(actor._id)) throw AppError.businessRule('You cannot delete your own account');

  const user = await User.findById(id);
  if (!user) throw AppError.notFound('User');

  const owns = { $or: [{ assignedTo: user._id }, { createdBy: user._id }] };
  const [leads, customers, deals, activities, team] = await Promise.all([
    Lead.exists(owns),
    Customer.exists(owns),
    Deal.exists(owns),
    Activity.exists(owns),
    User.exists({ manager: user._id }),
  ]);

  if (leads || customers || deals || activities || team) {
    throw AppError.conflict('User has associated CRM records or team members. Deactivate the user instead.');
  }

  await runInTransaction(async (session) => {
    await User.deleteOne({ _id: user._id }, { session });
    await tokenService.revokeAllForUser(user._id, session);
    await timeline.record(
      {
        action: TIMELINE_ACTIONS.USER_DELETED,
        entityType: 'user',
        entityId: user._id,
        performedBy: actor._id,
        previousValue: { name: user.name, email: user.email, role: user.role },
      },
      session,
    );
  });
}

module.exports = { createUser, listUsers, getUser, updateUser, setUserStatus, deleteUser };
