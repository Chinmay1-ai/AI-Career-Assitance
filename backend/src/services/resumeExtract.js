import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

const PDF_MIME = 'application/pdf';
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const ALLOWED_RESUME_MIMES = new Set([PDF_MIME, DOCX_MIME]);
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export function isAllowedResumeFile(file) {
  if (!file) return false;
  const name = (file.originalname || '').toLowerCase();
  const mime = file.mimetype || '';
  const pdf = mime === PDF_MIME || name.endsWith('.pdf');
  const docx = mime === DOCX_MIME || name.endsWith('.docx');
  return pdf || docx;
}

export function resumeKind(file) {
  const name = (file.originalname || '').toLowerCase();
  const mime = file.mimetype || '';
  if (mime === PDF_MIME || name.endsWith('.pdf')) return 'pdf';
  if (mime === DOCX_MIME || name.endsWith('.docx')) return 'docx';
  return null;
}

/**
 * Extract plain text from a PDF or DOCX buffer.
 * Gemini analysis is intentionally not called here.
 */
export async function extractResumeText(file) {
  const kind = resumeKind(file);
  if (!kind) {
    throw new Error('Only PDF and DOCX resumes are supported.');
  }

  let text = '';

  if (kind === 'pdf') {
    const parser = new PDFParse({ data: file.buffer });
    try {
      const result = await parser.getText();
      text = result?.text ?? '';
    } finally {
      await parser.destroy();
    }
  } else {
    const result = await mammoth.extractRawText({ buffer: file.buffer });
    text = result?.value ?? '';
  }

  const extractedText = text.replace(/\u0000/g, '').trim();
  if (!extractedText) {
    throw new Error(
      'Could not extract readable text. Try a text-based PDF or DOCX (not a scanned image).',
    );
  }

  return extractedText;
}

export function textPreview(extractedText, maxLength = 600) {
  const compact = extractedText.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength).trim()}…`;
}
