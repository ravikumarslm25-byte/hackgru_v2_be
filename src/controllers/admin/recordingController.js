import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiError } from '../../utils/ApiError.js';
import { ok } from '../../utils/ApiResponse.js';
import { Course } from '../../models/Course.js';
import { Upload } from '../../models/Upload.js';
import { signedDownload } from '../../services/storage/index.js';

async function videoUrl(id) {
  if (!id) return '';
  const up = await Upload.findById(id);
  if (!up) return '';
  try { return await signedDownload(up, { inline: true, expiresIn: 3600 }); } catch { return ''; }
}

const countLessons = (sections) => (sections || []).reduce((n, s) => n + (s.lessons?.length || 0), 0);

// GET /api/admin/recordings — courses with a recordings-lesson count.
export const listCourses = asyncHandler(async (_req, res) => {
  const courses = await Course.find().select('title mode thumbnail recordingSections category subcategory')
    .populate('category', 'name').populate('subcategory', 'name').sort('title').lean();
  ok(res, { courses: courses.map((c) => ({
    id: c._id, title: c.title, mode: c.mode, thumbnail: c.thumbnail,
    category: c.category?.name || '', subcategory: c.subcategory?.name || '',
    sectionCount: c.recordingSections?.length || 0, lessonCount: countLessons(c.recordingSections),
  })) });
});

// GET /api/admin/recordings/:courseId — the full curriculum, with signed preview URLs.
export const getCurriculum = asyncHandler(async (req, res) => {
  const c = await Course.findById(req.params.courseId).select('title recordingSections');
  if (!c) throw ApiError.notFound('Course not found.');
  const sections = await Promise.all((c.recordingSections || []).sort((a, b) => a.order - b.order).map(async (s) => ({
    id: s._id, title: s.title, order: s.order,
    lessons: await Promise.all((s.lessons || []).sort((a, b) => a.order - b.order).map(async (l) => ({
      id: l._id, title: l.title, video: l.video, durationSec: l.durationSec, isPreview: l.isPreview, order: l.order,
      videoUrl: await videoUrl(l.video),
    }))),
  })));
  ok(res, { course: { id: c._id, title: c.title }, sections });
});

import mongoose from 'mongoose';
const keepId = (x) => (x && mongoose.isValidObjectId(x.id) ? { _id: x.id } : {});

// PUT /api/admin/recordings/:courseId — save the whole curriculum tree.
export const saveCurriculum = asyncHandler(async (req, res) => {
  const c = await Course.findById(req.params.courseId);
  if (!c) throw ApiError.notFound('Course not found.');
  const incoming = Array.isArray(req.body.sections) ? req.body.sections : [];
  // Preserve existing section/lesson _ids (so student progress keyed by lesson id survives edits).
  c.recordingSections = incoming.map((s, si) => ({
    ...keepId(s),
    title: s.title || 'Untitled section',
    order: si,
    lessons: (s.lessons || []).map((l, li) => ({
      ...keepId(l),
      title: l.title || 'Untitled lesson',
      video: l.video || null,
      durationSec: Number(l.durationSec) || 0,
      isPreview: !!l.isPreview,
      order: li,
    })),
  }));
  // keep the flag in sync: recordings are "available" once there's at least one lesson
  c.recordingsAvailable = countLessons(c.recordingSections) > 0;
  await c.save();
  ok(res, { saved: true, lessonCount: countLessons(c.recordingSections) }, 'Curriculum saved');
});
