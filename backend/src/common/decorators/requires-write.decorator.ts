import { SetMetadata } from '@nestjs/common';

export const REQUIRES_WRITE_KEY = 'requiresWrite';
export const RequiresWrite = () => SetMetadata(REQUIRES_WRITE_KEY, true);
