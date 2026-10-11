const { User } = require('../models');
const { ROLES } = require('../constants');
const AppError = require('../utils/AppError');

/**
 * Record-level authorization.
 *
 *  - admin            → everything
 *  - sales_manager    → records assigned to themselves or to executives in their team
 *  - sales_executive  → records assigned to themselves
 *
 * Scopes are MongoDB filter fragments that every read/write query is combined with, so a user
 * can never load a record outside their scope. Out-of-scope records produce 404 (not 403) to
 * avoid leaking the existence of other teams' data.
 */

const isAdmin = (user) => user.role === ROLES.ADMIN;
const isManager = (user) => user.role === ROLES.SALES_MANAGER;
const isExecutive = (user) => user.role === ROLES.SALES_EXECUTIVE;

/** IDs of the executives reporting to a manager. Memoised on the request user object. */
async function getTeamMemberIds(user) {
  if (!isManager(user)) return [];
  if (!user.teamMemberIds) {
    user.teamMemberIds = await User.find({ manager: user._id, role: ROLES.SALES_EXECUTIVE }).distinct('_id');
  }
  return user.teamMemberIds;
}

/** Users whose records the given user may see (null = unrestricted). */
async function getVisibleUserIds(user) {
  if (isAdmin(user)) return null;
  if (isManager(user)) return [user._id, ...(await getTeamMemberIds(user))];
  return [user._id];
}

/**
 * Ownership scope for assignable records (leads, customers, deals).
 * `includeUnassigned` lets managers see unassigned leads created by their team.
 */
async function ownershipScope(user, { includeUnassigned = false } = {}) {
  const ids = await getVisibleUserIds(user);
  if (ids === null) return {};
  const conditions = [{ assignedTo: { $in: ids } }];
  if (includeUnassigned && !isExecutive(user)) {
    conditions.push({ assignedTo: null, createdBy: { $in: ids } });
  }
  return conditions.length === 1 ? conditions[0] : { $or: conditions };
}

/** Activities are visible to their assignee and their creator (and the team's manager / admins). */
async function activityScope(user) {
  const ids = await getVisibleUserIds(user);
  if (ids === null) return {};
  return { $or: [{ assignedTo: { $in: ids } }, { createdBy: { $in: ids } }] };
}

async function canSeeUser(actor, userId) {
  const ids = await getVisibleUserIds(actor);
  return ids === null || ids.some((id) => String(id) === String(userId));
}

/**
 * Validates that `actor` may assign a record to `assigneeId`:
 *   - assignee exists, is active and has one of `allowedRoles`
 *   - executives may only assign to themselves
 *   - managers may assign to themselves (if allowed) or executives in their team
 */
async function assertAssignable(actor, assigneeId, { allowedRoles = [ROLES.SALES_EXECUTIVE] } = {}) {
  const assignee = await User.findById(assigneeId).select('name email role isActive manager').lean();

  if (!assignee) throw AppError.businessRule('Assignee does not exist');
  if (!assignee.isActive) throw AppError.businessRule('Cannot assign to an inactive user');
  if (!allowedRoles.includes(assignee.role)) {
    throw AppError.businessRule(`Assignee must have one of the roles: ${allowedRoles.join(', ')}`);
  }

  const isSelf = String(assignee._id) === String(actor._id);

  if (isExecutive(actor) && !isSelf) {
    throw AppError.forbidden('Sales executives can only assign records to themselves');
  }
  if (isManager(actor) && !isSelf && String(assignee.manager) !== String(actor._id)) {
    throw AppError.forbidden('Managers can only assign records to executives in their own team');
  }

  return assignee;
}

/** Loads a document inside the actor's scope or throws 404. */
async function findInScope(Model, id, scope, { entityName, populate, session, select } = {}) {
  let query = Model.findOne({ $and: [{ _id: id }, scope] });
  if (session) query = query.session(session);
  if (select) query = query.select(select);
  for (const option of [].concat(populate || [])) query = query.populate(option);
  const doc = await query;
  if (!doc) throw AppError.notFound(entityName || Model.modelName);
  return doc;
}

module.exports = {
  isAdmin,
  isManager,
  isExecutive,
  getTeamMemberIds,
  getVisibleUserIds,
  ownershipScope,
  activityScope,
  canSeeUser,
  assertAssignable,
  findInScope,
};
