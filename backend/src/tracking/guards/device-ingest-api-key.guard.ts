import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class DeviceIngestApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.DEVICE_INGEST_TOKEN?.trim();
    if (!expected) {
      throw new ServiceUnavailableException('DEVICE_INGEST_TOKEN is not configured');
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
    }>();

    const tokenHeader = request.headers['x-device-ingest-token'];
    const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;

    if (!token || token.trim() !== expected) {
      throw new UnauthorizedException('Invalid device ingest token');
    }

    return true;
  }
}
