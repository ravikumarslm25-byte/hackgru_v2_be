import { asyncHandler } from '../../utils/asyncHandler.js';
import { ok } from '../../utils/ApiResponse.js';
import { Settings } from '../../models/Settings.js';

const FIELDS = ['orgName', 'supportEmail', 'supportPhone', 'address', 'gstin', 'website', 'ticketAutoCloseDays'];

// GET /api/admin/settings
export const getSettings = asyncHandler(async (req, res) => {
  ok(res, { settings: await Settings.load() });
});

// PUT /api/admin/settings
export const updateSettings = asyncHandler(async (req, res) => {
  const s = await Settings.load();
  for (const f of FIELDS) if (req.body[f] !== undefined) s[f] = req.body[f];
  await s.save();
  ok(res, { settings: s }, 'Settings saved');
});
