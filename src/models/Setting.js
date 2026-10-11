const mongoose = require('mongoose');
const { DEFAULT_STAGE_PROBABILITIES } = require('../constants');

const { Schema } = mongoose;

const probability = { type: Number, min: 0, max: 100 };

/** Singleton document holding admin-managed CRM configuration. */
const settingSchema = new Schema(
  {
    key: { type: String, default: 'crm', immutable: true },
    defaultCurrency: { type: String, uppercase: true, minlength: 3, maxlength: 3, default: 'USD' },
    // Default win probability applied when a deal enters a stage without an explicit probability.
    stageProbabilities: {
      qualification: { ...probability, default: DEFAULT_STAGE_PROBABILITIES.qualification },
      discovery: { ...probability, default: DEFAULT_STAGE_PROBABILITIES.discovery },
      proposal: { ...probability, default: DEFAULT_STAGE_PROBABILITIES.proposal },
      negotiation: { ...probability, default: DEFAULT_STAGE_PROBABILITIES.negotiation },
    },
    // Expected close date may not be further than this many days in the future.
    maxDealCloseDays: { type: Number, min: 1, max: 3650, default: 730 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, versionKey: false },
);

settingSchema.index({ key: 1 }, { unique: true });

module.exports = mongoose.model('Setting', settingSchema);
