const mongoose = require('mongoose');
const { ACTIVITY_TYPES, ACTIVITY_STATUS, ACTIVITY_RELATED_TYPES } = require('../constants');

const { Schema } = mongoose;

const RELATED_MODELS = { lead: 'Lead', customer: 'Customer', deal: 'Deal', user: 'User' };

const activitySchema = new Schema(
  {
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    // Only `pending` and `completed` are persisted; `overdue` is derived (see effectiveStatus).
    status: {
      type: String,
      enum: [ACTIVITY_STATUS.PENDING, ACTIVITY_STATUS.COMPLETED],
      default: ACTIVITY_STATUS.PENDING,
    },
    dueDate: { type: Date },
    completedAt: { type: Date },
    completedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    outcome: { type: String, trim: true, maxlength: 1000 },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // Polymorphic association to a Lead, Customer, Deal or User.
    relatedType: { type: String, enum: ACTIVITY_RELATED_TYPES },
    relatedId: {
      type: Schema.Types.ObjectId,
      ref() {
        return RELATED_MODELS[this.relatedType];
      },
    },
  },
  { timestamps: true, versionKey: false },
);

// "My pending/overdue activities ordered by due date" — the dominant query.
activitySchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
activitySchema.index({ status: 1, dueDate: 1 });
activitySchema.index({ relatedType: 1, relatedId: 1, createdAt: -1 });
activitySchema.index({ createdBy: 1, createdAt: -1 });
activitySchema.index({ createdAt: -1 });

/**
 * The backend decides whether an activity is overdue: pending + due date in the past.
 * Works on both hydrated documents and lean objects.
 */
function withEffectiveStatus(activity, now = new Date()) {
  if (!activity) return activity;
  const plain = typeof activity.toObject === 'function' ? activity.toObject() : { ...activity };
  const isOverdue =
    plain.status === ACTIVITY_STATUS.PENDING && Boolean(plain.dueDate) && new Date(plain.dueDate) < now;
  return { ...plain, status: isOverdue ? ACTIVITY_STATUS.OVERDUE : plain.status, isOverdue };
}

/** Translates API statuses (pending | completed | overdue) into a MongoDB filter. */
function statusFilter(statuses, now = new Date()) {
  const list = [].concat(statuses);
  const clauses = list.map((status) => {
    if (status === ACTIVITY_STATUS.COMPLETED) return { status: ACTIVITY_STATUS.COMPLETED };
    if (status === ACTIVITY_STATUS.OVERDUE) return { status: ACTIVITY_STATUS.PENDING, dueDate: { $lt: now } };
    return {
      status: ACTIVITY_STATUS.PENDING,
      $or: [{ dueDate: null }, { dueDate: { $gte: now } }],
    };
  });
  return clauses.length === 1 ? clauses[0] : { $or: clauses };
}

activitySchema.statics.withEffectiveStatus = withEffectiveStatus;
activitySchema.statics.statusFilter = statusFilter;
activitySchema.statics.RELATED_MODELS = RELATED_MODELS;

module.exports = mongoose.model('Activity', activitySchema);
