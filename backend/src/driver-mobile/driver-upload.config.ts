import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';

export const MAX_DRIVER_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_REQUEST_ATTACHMENTS = 5;

export const DRIVER_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const DRIVER_FILE_UPLOAD_INTERCEPTOR = FileInterceptor('file', {
  storage: diskStorage({
    destination: DOCUMENT_UPLOAD_ABSOLUTE_DIR,
    filename: (_req, file, cb) => {
      const extension = file.originalname.includes('.')
        ? file.originalname.slice(file.originalname.lastIndexOf('.')).toLowerCase()
        : '';
      const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${uniqueSuffix}${extension}`);
    },
  }),
  limits: {
    fileSize: MAX_DRIVER_UPLOAD_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!DRIVER_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new BadRequestException(
          'Unsupported file type. Allowed: PDF, JPG, JPEG, PNG, WEBP.',
        ) as Error,
        false,
      );
      return;
    }
    cb(null, true);
  },
});
