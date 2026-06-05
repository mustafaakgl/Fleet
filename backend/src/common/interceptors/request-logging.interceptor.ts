import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { MetricsService } from '../../metrics/metrics.service';

type RequestUser = {
  id?: string;
  tenantId?: string;
};

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      url?: string;
      user?: RequestUser;
    }>();
    const path = request.originalUrl ?? request.url ?? '';
    if (path.includes('/health')) {
      return next.handle();
    }

    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(request, path, startedAt, context),
        error: () => this.log(request, path, startedAt, context),
      }),
    );
  }

  private log(
    request: { method?: string; user?: RequestUser },
    path: string,
    startedAt: number,
    context: ExecutionContext,
  ) {
    const response = context.switchToHttp().getResponse<{ statusCode?: number }>();
    const entry = {
      level: 'info',
      type: 'http_request',
      method: request.method ?? 'UNKNOWN',
      path,
      status: response.statusCode ?? 0,
      durationMs: Date.now() - startedAt,
      userId: request.user?.id,
      tenantId: request.user?.tenantId,
    };
    console.log(JSON.stringify(entry));

    const route = path.split('?')[0] ?? path;
    const labels = {
      method: entry.method,
      route,
      status: String(entry.status),
    };
    this.metrics.httpRequestsTotal.inc(labels);
    this.metrics.httpRequestDuration.observe(labels, entry.durationMs / 1000);
  }
}
