const ROLES = Object.freeze({
  ADMIN: 'admin',
  SALES_MANAGER: 'sales_manager',
  SALES_EXECUTIVE: 'sales_executive',
});

const LEAD_SOURCES = Object.freeze(['website', 'referral', 'social_media', 'email', 'phone', 'other']);

const LEAD_STATUS = Object.freeze({
  NEW: 'new',
  CONTACTED: 'contacted',
  QUALIFIED: 'qualified',
  UNQUALIFIED: 'unqualified',
  CONVERTED: 'converted',
  LOST: 'lost',
});

/**
 * Allowed lead status transitions. `converted` is intentionally never a target here:
 * a lead only becomes converted through the conversion workflow (POST /leads/:id/convert).
 */
const LEAD_STATUS_TRANSITIONS = Object.freeze({
  new: ['contacted', 'qualified', 'unqualified', 'lost'],
  contacted: ['qualified', 'unqualified', 'lost'],
  qualified: ['contacted', 'unqualified', 'lost'],
  unqualified: ['contacted', 'lost'],
  lost: ['contacted'],
  converted: [],
});

const PRIORITIES = Object.freeze(['low', 'medium', 'high']);

const CUSTOMER_STATUSES = Object.freeze(['active', 'inactive', 'churned']);

const DEAL_STAGE = Object.freeze({
  QUALIFICATION: 'qualification',
  DISCOVERY: 'discovery',
  PROPOSAL: 'proposal',
  NEGOTIATION: 'negotiation',
  WON: 'won',
  LOST: 'lost',
});

const DEAL_STAGES = Object.freeze(Object.values(DEAL_STAGE));
const OPEN_DEAL_STAGES = Object.freeze(['qualification', 'discovery', 'proposal', 'negotiation']);
const CLOSED_DEAL_STAGES = Object.freeze(['won', 'lost']);
const DEAL_STATUSES = Object.freeze(['open', 'won', 'lost']);

const DEFAULT_STAGE_PROBABILITIES = Object.freeze({
  qualification: 10,
  discovery: 25,
  proposal: 50,
  negotiation: 75,
});

const ACTIVITY_TYPES = Object.freeze(['call', 'email', 'meeting', 'demo', 'follow_up', 'reminder', 'note']);

const ACTIVITY_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  // Never persisted: derived from `pending` + a due date in the past.
  OVERDUE: 'overdue',
});

const ACTIVITY_RELATED_TYPES = Object.freeze(['lead', 'customer', 'deal', 'user']);

const ENTITY_TYPES = Object.freeze(['lead', 'customer', 'deal', 'activity', 'user']);

const TIMELINE_ACTIONS = Object.freeze({
  LEAD_CREATED: 'lead_created',
  LEAD_UPDATED: 'lead_updated',
  LEAD_ASSIGNED: 'lead_assigned',
  LEAD_REASSIGNED: 'lead_reassigned',
  LEAD_STATUS_CHANGED: 'lead_status_changed',
  LEAD_PRIORITY_CHANGED: 'lead_priority_changed',
  LEAD_CONVERTED: 'lead_converted',
  LEAD_DELETED: 'lead_deleted',

  NOTE_ADDED: 'note_added',
  FOLLOW_UP_CREATED: 'follow_up_created',
  FOLLOW_UP_COMPLETED: 'follow_up_completed',
  ACTIVITY_CREATED: 'activity_created',
  ACTIVITY_COMPLETED: 'activity_completed',
  ACTIVITY_DELETED: 'activity_deleted',

  CUSTOMER_CREATED: 'customer_created',
  CUSTOMER_UPDATED: 'customer_updated',
  CUSTOMER_ASSIGNED: 'customer_assigned',
  CUSTOMER_DELETED: 'customer_deleted',

  DEAL_CREATED: 'deal_created',
  DEAL_UPDATED: 'deal_updated',
  DEAL_STAGE_CHANGED: 'deal_stage_changed',
  DEAL_ASSIGNED: 'deal_assigned',
  DEAL_WON: 'deal_won',
  DEAL_LOST: 'deal_lost',
  DEAL_REOPENED: 'deal_reopened',
  DEAL_DELETED: 'deal_deleted',

  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_ACTIVATED: 'user_activated',
  USER_DEACTIVATED: 'user_deactivated',
  USER_DELETED: 'user_deleted',
});

const PAGINATION = Object.freeze({ DEFAULT_PAGE: 1, DEFAULT_LIMIT: 20, MAX_LIMIT: 100 });

module.exports = {
  ROLES,
  LEAD_SOURCES,
  LEAD_STATUS,
  LEAD_STATUS_TRANSITIONS,
  PRIORITIES,
  CUSTOMER_STATUSES,
  DEAL_STAGE,
  DEAL_STAGES,
  OPEN_DEAL_STAGES,
  CLOSED_DEAL_STAGES,
  DEAL_STATUSES,
  DEFAULT_STAGE_PROBABILITIES,
  ACTIVITY_TYPES,
  ACTIVITY_STATUS,
  ACTIVITY_RELATED_TYPES,
  ENTITY_TYPES,
  TIMELINE_ACTIONS,
  PAGINATION,
};
