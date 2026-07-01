import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class TachoIngestTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.TACHO_INGEST_TOKEN?.trim();
    if (!expected) {
      throw new ServiceUnavailableException('TACHO_INGEST_TOKEN is not configured');
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const tokenHeader = request.headers['x-tacho-ingest-token'];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

    if (!token || token.trim() !== expected) {
      throw new UnauthorizedException('Invalid tacho ingest token');
    }

    return true;
  }
}
