const mongoose = require('mongoose');
const { CUSTOMER_STATUSES } = require('../constants');

const { Schema } = mongoose;

// Embedded: an address has no identity or lifecycle of its own and is always read with the customer.
const addressSchema = new Schema(
  {
    street: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 20 },
    country: { type: String, trim: true, maxlength: 100 },
  },
  { _id: false },
);

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    phone: { type: String, trim: true },
    company: { type: String, trim: true, maxlength: 150 },
    address: { type: addressSchema, default: undefined },
    description: { type: String, trim: true, maxlength: 2000 },
    status: { type: String, enum: CUSTOMER_STATUSES, default: 'active' },

    // Original lead (null for customers created directly).
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    id: false,
  },
);

customerSchema.virtual('deals', {
  ref: 'Deal',
  localField: '_id',
  foreignField: 'customer',
});

customerSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
// A lead can be converted into at most one customer (a DB-level guard on top of the service check).
customerSchema.index({ lead: 1 }, { unique: true, partialFilterExpression: { lead: { $type: 'objectId' } } });
customerSchema.index({ assignedTo: 1, status: 1, createdAt: -1 });
customerSchema.index({ status: 1 });
customerSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Customer', customerSchema);
