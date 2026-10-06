import mongoose from 'mongoose';

/** App-wide settings (singleton — one document, key 'app'). */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'app', unique: true },
    orgName: { type: String, default: 'HackGRU' },
    supportEmail: { type: String, default: '' },
    supportPhone: { type: String, default: '' },
    address: { type: String, default: '' },
    gstin: { type: String, default: '' },
    website: { type: String, default: '' },
    ticketAutoCloseDays: { type: Number, default: 7 },   // resolved → auto-closed after N days
  },
  { timestamps: true }
);
settingsSchema.statics.load = async function () {
  return (await this.findOne({ key: 'app' })) || (await this.create({ key: 'app' }));
};
export const Settings = mongoose.model('Settings', settingsSchema);
