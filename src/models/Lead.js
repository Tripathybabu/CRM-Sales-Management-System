const mongoose = require('mongoose');
const { LEAD_SOURCES, LEAD_STATUS, PRIORITIES } = require('../constants');

const { Schema } = mongoose;

const leadSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true },
    company: { type: String, trim: true, maxlength: 150 },
    source: { type: String, enum: LEAD_SOURCES, default: 'other' },
    status: { type: String, enum: Object.values(LEAD_STATUS), default: LEAD_STATUS.NEW },
    priority: { type: String, enum: PRIORITIES, default: 'medium' },
    description: { type: String, trim: true, maxlength: 2000 },
    lostReason: { type: String, trim: true, maxlength: 500 },

    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    // Populated by the conversion workflow: Lead -> Customer -> Deal
    convertedAt: { type: Date },
    convertedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
    deal: { type: Schema.Types.ObjectId, ref: 'Deal', default: null },
  },
  { timestamps: true, versionKey: false },
);

// One lead per email address (leads without an email are allowed).
leadSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
// Main listing pattern: "my/team leads, filtered by status, newest first".
leadSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ source: 1, createdAt: -1 });
leadSchema.index({ priority: 1 });
leadSchema.index({ createdBy: 1 });
leadSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Lead', leadSchema);
