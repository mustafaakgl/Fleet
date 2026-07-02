import { Logger } from '@nestjs/common';
import { DeviceModel } from '@prisma/client';
import { createServer, type Server, type Socket } from 'node:net';
import { TELEMATICS_IO_MAP, normalizeIoToTelemetry, type ParsedAvlIo } from './avl-io-map';
import { parseCodec8Frame } from './codec8-parser';
import { PrismaService } from '../prisma/prisma.service';
import { MetricsService } from '../metrics/metrics.service';
import { TelemetryQueueService } from '../queue/telemetry-queue.service';
import type { TelemetryRecordPayload } from '../queue/telemetry.types';

type DeviceBinding = {
  tenantId: string;
  vehicleId: string;
  model: DeviceModel;
};

type SessionState = {
  imei?: string;
  device?: DeviceBinding;
  buffer: Buffer;
};

export class TeltonikaGatewayService {
  private readonly logger = new Logger(TeltonikaGatewayService.name);
  private server: Server | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly telemetryQueue: TelemetryQueueService,
    private readonly metrics: MetricsService,
    private readonly port: number,
    private readonly host = '0.0.0.0',
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const server = createServer((socket) => {
      const state: SessionState = { buffer: Buffer.alloc(0) };
      this.logger.log(`client connected remote=${socket.remoteAddress}:${socket.remotePort}`);

      socket.on('data', (chunk) => {
        const chunkBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        void this.handleData(socket, state, chunkBuffer);
      });

      socket.on('error', (error) => {
        this.logger.warn(`socket error remote=${socket.remoteAddress}:${socket.remotePort} error=${error.message}`);
      });

      socket.on('close', () => {
        this.logger.log(`client disconnected remote=${socket.remoteAddress}:${socket.remotePort} imei=${state.imei ?? '-'}`);
      });
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.port, this.host, () => {
        server.off('error', reject);
        resolve();
      });
    });

    this.server = server;
    this.logger.log(`Teltonika Codec8 gateway listening on ${this.host}:${this.port}`);
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    const server = this.server;
    this.server = null;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.logger.log('Teltonika Codec8 gateway stopped');
  }

  private async handleData(socket: Socket, state: SessionState, chunk: Buffer): Promise<void> {
    state.buffer = Buffer.concat([state.buffer, chunk]);

    try {
      if (!state.imei) {
        const didHandshake = await this.tryHandshake(socket, state);
        if (!didHandshake) {
          return;
        }
      }

      while (state.buffer.length > 0) {
        const preambleIndex = this.findPreamble(state.buffer);
        if (preambleIndex === -1) {
          state.buffer = Buffer.alloc(0);
          return;
        }
        if (preambleIndex > 0) {
          this.logger.warn(`discarding ${preambleIndex} bytes before preamble imei=${state.imei}`);
          state.buffer = state.buffer.subarray(preambleIndex);
        }

        const parsed = parseCodec8Frame(state.buffer);
        if (!parsed) {
          return;
        }

        const consumedFrame = state.buffer.subarray(0, parsed.bytesConsumed);

        if (!parsed.crcValid) {
          this.metrics.telematicsParseErrorsTotal.inc();
          await this.quarantineFrame(state, consumedFrame, 'crc mismatch');
          state.buffer = state.buffer.subarray(parsed.bytesConsumed);
          this.writeAck(socket, 0);
          continue;
        }

        const records = this.mapRecords(parsed.packet.records);
        const accepted = await this.enqueuePacket(state, records);
        if (accepted === null) {
          this.logger.warn(`queue enqueue failed — withholding ACK imei=${state.imei}`);
          return;
        }

        state.buffer = state.buffer.subarray(parsed.bytesConsumed);
        this.writeAck(socket, accepted);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.metrics.telematicsParseErrorsTotal.inc();
      const rawHex = state.buffer.subarray(0, Math.min(state.buffer.length, 512)).toString('hex');
      await this.quarantineFrame(state, Buffer.from(rawHex, 'hex'), message);
      this.writeAck(socket, 0);
      state.buffer = Buffer.alloc(0);
      this.logger.warn(`failed to process chunk imei=${state.imei ?? '-'} error=${message}`);
    }
  }

  private mapRecords(
    records: Array<{
      timestampMs: number;
      priority: number;
      latitude: number;
      longitude: number;
      speedKph: number;
      angleDeg: number;
      io: ParsedAvlIo;
    }>,
  ): TelemetryRecordPayload[] {
    return records.map((record) => {
      const normalized = normalizeIoToTelemetry(record.io, record.speedKph);
      const dtcPresent = TELEMATICS_IO_MAP.dtc.ids.some((id) => record.io.values.has(id));

      return {
        timestampMs: record.timestampMs,
        priority: record.priority,
        latitude: record.latitude,
        longitude: record.longitude,
        speedKph: record.speedKph,
        angleDeg: record.angleDeg,
        ignition: normalized.ignition,
        rpm: normalized.rpm,
        fuelLevelPct: normalized.fuelLevelPct,
        coolantTemp: normalized.coolantTemp,
        voltage: normalized.voltage,
        odometerKm: normalized.odometerKm,
        dtcPresent,
        dtc: normalized.dtc,
        events: normalized.events,
      };
    });
  }

  private async enqueuePacket(
    state: SessionState,
    records: TelemetryRecordPayload[],
  ): Promise<number | null> {
    if (!state.device || !state.imei || records.length === 0) {
      return 0;
    }

    try {
      await this.telemetryQueue.enqueueIngest({
        tenantId: state.device.tenantId,
        vehicleId: state.device.vehicleId,
        imei: state.imei,
        records,
      });
      return records.length;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`telemetry queue enqueue failed imei=${state.imei} error=${message}`);
      return null;
    }
  }

  private async quarantineFrame(
    state: SessionState,
    frame: Buffer,
    error: string,
  ): Promise<void> {
    try {
      await this.telemetryQueue.enqueueQuarantine({
        tenantId: state.device?.tenantId,
        imei: state.imei,
        rawHex: frame.toString('hex'),
        error,
      });
    } catch (quarantineError) {
      const message =
        quarantineError instanceof Error ? quarantineError.message : String(quarantineError);
      this.logger.error(`quarantine enqueue failed imei=${state.imei ?? '-'} error=${message}`);
    }
  }

  private writeAck(socket: Socket, accepted: number): void {
    const ack = Buffer.alloc(4);
    ack.writeUInt32BE(accepted, 0);
    socket.write(ack);
  }

  private async tryHandshake(socket: Socket, state: SessionState): Promise<boolean> {
    if (state.buffer.length < 2) {
      return false;
    }

    const imeiLength = state.buffer.readUInt16BE(0);
    if (imeiLength <= 0 || imeiLength > 32) {
      this.logger.warn(`invalid imei length=${imeiLength}`);
      socket.write(Buffer.from([0x00]));
      socket.destroy();
      return false;
    }

    if (state.buffer.length < 2 + imeiLength) {
      return false;
    }

    const imei = state.buffer.subarray(2, 2 + imeiLength).toString('ascii').trim();
    state.buffer = state.buffer.subarray(2 + imeiLength);

    const binding = await this.resolveDeviceBinding(imei);
    if (!binding) {
      this.logger.warn(`imei rejected imei=${imei}`);
      socket.write(Buffer.from([0x00]));
      socket.destroy();
      return false;
    }

    state.imei = imei;
    state.device = binding;
    socket.write(Buffer.from([0x01]));

    this.logger.log(
      `imei accepted imei=${imei} tenant=${binding.tenantId} vehicle=${binding.vehicleId} model=${binding.model}`,
    );

    return true;
  }

  private async resolveDeviceBinding(imei: string): Promise<DeviceBinding | null> {
    const candidates = await this.prisma.unscoped.device.findMany({
      where: {
        imei,
        vehicleId: { not: null },
      },
      select: {
        tenantId: true,
        vehicleId: true,
        model: true,
      },
      take: 2,
    });

    if (candidates.length !== 1) {
      return null;
    }

    return {
      tenantId: candidates[0].tenantId,
      vehicleId: candidates[0].vehicleId as string,
      model: candidates[0].model,
    };
  }

  private findPreamble(buffer: Buffer): number {
    for (let i = 0; i <= buffer.length - 4; i += 1) {
      if (
        buffer[i] === 0x00
        && buffer[i + 1] === 0x00
        && buffer[i + 2] === 0x00
        && buffer[i + 3] === 0x00
      ) {
        return i;
      }
    }

    return -1;
  }
}
