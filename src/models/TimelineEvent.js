const mongoose = require('mongoose');
const { ENTITY_TYPES, TIMELINE_ACTIONS } = require('../constants');

const { Schema } = mongoose;

/**
 * Append-only audit trail. `entityType/entityId` is the subject of the event; the `lead`,
 * `customer` and `deal` context references let one query return the full history of a
 * record including related records (e.g. a customer's timeline includes its deals' stage changes).
 */
const timelineEventSchema = new Schema(
  {
    action: { type: String, enum: Object.values(TIMELINE_ACTIONS), required: true },
    entityType: { type: String, enum: ENTITY_TYPES, required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    previousValue: { type: Schema.Types.Mixed },
    newValue: { type: Schema.Types.Mixed },
    message: { type: String, maxlength: 500 },

    lead: { type: Schema.Types.ObjectId, ref: 'Lead' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer' },
    deal: { type: Schema.Types.ObjectId, ref: 'Deal' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

timelineEventSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
timelineEventSchema.index({ lead: 1, createdAt: -1 }, { partialFilterExpression: { lead: { $exists: true } } });
timelineEventSchema.index(
  { customer: 1, createdAt: -1 },
  { partialFilterExpression: { customer: { $exists: true } } },
);
timelineEventSchema.index({ deal: 1, createdAt: -1 }, { partialFilterExpression: { deal: { $exists: true } } });
timelineEventSchema.index({ performedBy: 1, createdAt: -1 });
timelineEventSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('TimelineEvent', timelineEventSchema);
