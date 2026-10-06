import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { ok } from '../utils/ApiResponse.js';
import { Lead } from '../models/Lead.js';
import { notifyAdmins } from '../services/notify.js';

// @route POST /api/leads   (public — contact / get started forms)
export const createLead = asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) throw ApiError.badRequest('Name and email are required');
  const lead = await Lead.create(req.body);
  notifyAdmins({ type: 'lead', title: 'New enquiry', body: `${lead.name}${lead.interest ? ` · ${lead.interest}` : ''}`, link: '/admin/leads' });
  ok(res, { lead }, "Thanks! We'll be in touch soon.", 201);
});

// @route GET /api/leads   (admin)
export const getLeads = asyncHandler(async (req, res) => {
  const leads = await Lead.find().sort('-createdAt');
  ok(res, { leads });
});

// @route PATCH /api/leads/:id   (admin) — update status
export const updateLead = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const lead = await Lead.findByIdAndUpdate(
    req.params.id,
    { $set: { ...(status ? { status } : {}) } },
    { new: true }
  );
  if (!lead) throw ApiError.notFound('Lead not found');
  ok(res, { lead }, 'Lead updated');
});
