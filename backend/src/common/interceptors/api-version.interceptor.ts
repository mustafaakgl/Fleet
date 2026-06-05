import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

const API_VERSION = 'v1';
// HTTP headers must be ASCII; avoid em-dashes and other non-Latin chars.
const API_DEPRECATION_POLICY =
  'https://docs.myfleet.app/api/versioning - v1 stable; v2 announced 30 days before sunset';

@Injectable()
export class ApiVersionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<{
      setHeader: (name: string, value: string) => void;
    }>();

    return next.handle().pipe(
      tap(() => {
        response.setHeader('X-API-Version', API_VERSION);
        response.setHeader('X-API-Deprecation-Policy', API_DEPRECATION_POLICY);
      }),
    );
  }
}
