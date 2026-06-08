import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { DOCUMENT_UPLOAD_ABSOLUTE_DIR } from '../storage/local-storage.service';

export const CUSTOMER_PROOF_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

export const CUSTOMER_PROOF_UPLOAD_INTERCEPTOR = FileInterceptor('file', {
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
    fileSize: CUSTOMER_PROOF_MAX_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(
        new BadRequestException(
          'Unsupported file type. Allowed types: PDF, JPG, JPEG, PNG, WEBP.',
        ) as Error,
        false,
      );
      return;
    }
    cb(null, true);
  },
});

export type CustomerUploadedFile = {
  originalname: string;
  filename: string;
  mimetype: string;
  size: number;
};
