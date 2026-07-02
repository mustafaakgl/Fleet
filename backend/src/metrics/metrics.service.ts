import { Injectable } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpRequestsTotal: Counter<string>;
  readonly httpRequestDuration: Histogram<string>;
  readonly telematicsFramesTotal: Counter<string>;
  readonly telematicsParseErrorsTotal: Counter<string>;
  readonly telematicsQuarantinedTotal: Counter<string>;
  readonly telematicsAckLatencyMs: Histogram<string>;
  readonly telematicsQueueDepth: Gauge<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'fleet_' });

    this.httpRequestsTotal = new Counter({
      name: 'fleet_http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'fleet_http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    this.telematicsFramesTotal = new Counter({
      name: 'fleet_telematics_frames_total',
      help: 'Codec8 AVL frames accepted by gateway',
      registers: [this.registry],
    });

    this.telematicsParseErrorsTotal = new Counter({
      name: 'fleet_telematics_parse_errors_total',
      help: 'Codec8 parse or CRC failures',
      registers: [this.registry],
    });

    this.telematicsQuarantinedTotal = new Counter({
      name: 'fleet_telematics_quarantined_total',
      help: 'Frames quarantined due to parse errors',
      registers: [this.registry],
    });

    this.telematicsAckLatencyMs = new Histogram({
      name: 'fleet_telematics_ack_latency_ms',
      help: 'Milliseconds from queue add to ACK',
      buckets: [1, 5, 10, 25, 50, 100, 250, 500, 1000],
      registers: [this.registry],
    });

    this.telematicsQueueDepth = new Gauge({
      name: 'fleet_telematics_queue_depth',
      help: 'Waiting + active telemetry jobs',
      registers: [this.registry],
    });
  }

  async metricsText(): Promise<string> {
    return this.registry.metrics();
  }
}
