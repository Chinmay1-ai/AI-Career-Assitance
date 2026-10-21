import multer from 'multer';
import { MAX_RESUME_BYTES } from '../services/resumeExtract.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RESUME_BYTES, files: 1 },
});

export const resumeUpload = upload.single('file');

export function handleResumeUploadError(error, _req, res, next) {
  if (!error) {
    next();
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({ error: 'File is too large. Maximum size is 5 MB.' });
      return;
    }
    res.status(400).json({ error: 'Upload failed. Please try a PDF or DOCX file under 5 MB.' });
    return;
  }

  next(error);
}
