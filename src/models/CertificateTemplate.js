import mongoose from 'mongoose';

const sigSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  role: { type: String, default: '' },
  image: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
}, { _id: false });

/**
 * A reusable certificate design. Two types:
 *   completion  → landscape "Certificate of Completion" (regular course)
 *   internship  → portrait "Internship Certificate" (adds start/end/duration)
 * The admin builds this once; issued certificates snapshot it (so later edits
 * never change a certificate already in a student's hands).
 */
const certificateTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['completion', 'internship'], default: 'completion' },
    orientation: { type: String, enum: ['landscape', 'portrait'], default: 'landscape' },

    // ── Branding ──
    companyName: { type: String, default: 'HackGRU' },
    logo: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
    additionalLogo: { type: mongoose.Schema.Types.ObjectId, ref: 'Upload', default: null },
    accentColor: { type: String, default: '#61429f' },
    secondaryColor: { type: String, default: '#f6b417' },
    titleColor: { type: String, default: '' },        // '' → falls back to accent
    bodyAlign: { type: String, enum: ['left', 'center', 'justify'], default: 'center' },
    address: { type: String, default: '' },
    website: { type: String, default: '' },
    email: { type: String, default: '' },

    // ── Content ──
    title: { type: String, default: 'Certificate of Completion' },
    subtitle: { type: String, default: '' },
    // Rich HTML with placeholders: {studentName} {courseName} {batchCode}
    // {collegeName} {issueDate} {startDate} {endDate} {duration} {serialNo} {companyName}
    bodyTemplate: { type: String, default: 'This is to certify that <strong>{studentName}</strong> has successfully completed <strong>{courseName}</strong>.' },

    signatures: { type: [sigSchema], default: [] },

    // ── Options ──
    dateLabel: { type: String, default: 'Date of Issue' },
    showSerial: { type: Boolean, default: true },
    showVerify: { type: Boolean, default: true },
    showBorder: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const CertificateTemplate = mongoose.model('CertificateTemplate', certificateTemplateSchema);
