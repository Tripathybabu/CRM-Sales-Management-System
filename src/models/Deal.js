const mongoose = require('mongoose');
const { DEAL_STAGES, DEAL_STATUSES, DEAL_STAGE } = require('../constants');

const { Schema } = mongoose;

const deriveStatus = (stage) => {
  if (stage === DEAL_STAGE.WON) return 'won';
  if (stage === DEAL_STAGE.LOST) return 'lost';
  return 'open';
};

const dealSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    value: {
      type: Number,
      required: true,
      validate: { validator: (v) => v > 0, message: 'Deal value must be greater than zero' },
    },
    currency: { type: String, uppercase: true, trim: true, minlength: 3, maxlength: 3, default: 'USD' },
    probability: { type: Number, min: 0, max: 100, required: true },
    // Always derived server-side: value * probability / 100.
    expectedRevenue: { type: Number, min: 0 },
    expectedCloseDate: { type: Date, required: true },

    stage: { type: String, enum: DEAL_STAGES, default: DEAL_STAGE.QUALIFICATION },
    // Derived from stage, stored so "open/won/lost" filters and aggregations can use an index.
    status: { type: String, enum: DEAL_STATUSES, default: 'open' },
    description: { type: String, trim: true, maxlength: 2000 },

    closedAt: { type: Date, default: null },
    closedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    lostReason: { type: String, trim: true, maxlength: 500 },
  },
  { timestamps: true, versionKey: false },
);

dealSchema.pre('validate', function deriveFields(next) {
  this.status = deriveStatus(this.stage);
  if (typeof this.value === 'number' && typeof this.probability === 'number') {
    this.expectedRevenue = Math.round(this.value * this.probability) / 100;
  }
  next();
});

dealSchema.index({ assignedTo: 1, stage: 1, createdAt: -1 });
dealSchema.index({ stage: 1, value: 1 });
dealSchema.index({ status: 1, expectedCloseDate: 1 });
dealSchema.index({ status: 1, closedAt: -1 });
dealSchema.index({ customer: 1, createdAt: -1 });
dealSchema.index({ lead: 1 });
dealSchema.index({ createdAt: -1 });

dealSchema.statics.deriveStatus = deriveStatus;

module.exports = mongoose.model('Deal', dealSchema);
