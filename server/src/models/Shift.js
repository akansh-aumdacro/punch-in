const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema(
  {
    org_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true, trim: true },
    startTime: { type: String, required: true }, // "HH:mm"
    endTime: { type: String, required: true },   // "HH:mm"
    breakMinutes: { type: Number, default: 0 },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    type: {
      type: String,
      enum: ['fixed', 'rotating', 'flexible', 'split', 'multiday'],
      default: 'fixed',
    },
    gracePeriodMinutes: { type: Number, default: 10 },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

shiftSchema.index({ org_id: 1, name: 1 });
shiftSchema.index({ org_id: 1, deletedAt: 1 });

module.exports = mongoose.model('Shift', shiftSchema);
