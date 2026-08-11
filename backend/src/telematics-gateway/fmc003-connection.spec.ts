import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { once } from 'node:events';
import { describe, it } from 'node:test';
import { crc16Arc } from './codec8-parser';
import { TeltonikaGatewayService } from './teltonika-gateway.service';
import type { TelemetryRecordPayload } from '../queue/telemetry.types';

/**
 * Uctan uca: sahte bir FMC003 gercekten baglanip veri gonderebiliyor mu.
 *
 * Cihaz elde yokken yazildi. Kapsam: IMEI el sikismasi, Codec 8 Extended
 * cozumu, MODEL BAZLI IO eslemesi ve ACK. Ozellikle kontrol edilen sey, ayni
 * AVL 32 elemanini bu modelde sogutucu sicakligi olarak okumasi — ana unite
 * haritasi kullanilsaydi motor devri sanilirdi.
 */

const IMEI = '350424060000001';

function buildIoBlock(): Buffer {
  const parts: Buffer[] = [];

  const u16 = (value: number) => {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16BE(value);
    return buffer;
  };

  parts.push(u16(0)); // event io id
  parts.push(u16(6)); // total elements

  // 1 baytlik: kontak (239), ariza sayaci (30)
  parts.push(u16(2));
  parts.push(u16(239), Buffer.from([1]));
  parts.push(u16(30), Buffer.from([2]));

  // 2 baytlik: sogutucu (32), voltaj (66), yakit OEM (390)
  parts.push(u16(3));
  parts.push(u16(32), u16(91));
  parts.push(u16(66), u16(13_980));
  parts.push(u16(390), u16(62));

  // 4 baytlik: kilometre OEM (389), metre cinsinden
  parts.push(u16(1));
  const odometer = Buffer.alloc(4);
  odometer.writeUInt32BE(154_321);
  parts.push(u16(389), odometer);

  // 8 baytlik: yok
  parts.push(u16(0));

  // Degisken uzunluklu: ariza kodlari (281)
  const codes = Buffer.from('P0100,P0234', 'ascii');
  parts.push(u16(1));
  parts.push(u16(281), u16(codes.length), codes);

  return Buffer.concat(parts);
}

function buildCodec8ExtFrame(): Buffer {
  const record: Buffer[] = [];

  const timestamp = Buffer.alloc(8);
  timestamp.writeBigInt64BE(BigInt(Date.UTC(2026, 7, 11, 9, 0, 0)));
  record.push(timestamp);
  record.push(Buffer.from([1])); // priority

  const longitude = Buffer.alloc(4);
  longitude.writeInt32BE(Math.round(13.404954 * 10_000_000));
  const latitude = Buffer.alloc(4);
  latitude.writeInt32BE(Math.round(52.520008 * 10_000_000));
  const altitude = Buffer.alloc(2);
  altitude.writeUInt16BE(34);
  const angle = Buffer.alloc(2);
  angle.writeUInt16BE(180);
  const speed = Buffer.alloc(2);
  speed.writeUInt16BE(48);

  record.push(longitude, latitude, altitude, angle, Buffer.from([9]), speed);
  record.push(buildIoBlock());

  // Codec 8 Extended'da kayit sayaci 2 bayt (duz Codec 8'de 1).
  const recordCount = Buffer.alloc(2);
  recordCount.writeUInt16BE(1);

  const data = Buffer.concat([
    Buffer.from([0x8e]), // codec 8 extended
    recordCount,
    ...record,
    recordCount, // sonda tekrarlanir
  ]);

  const header = Buffer.alloc(8);
  header.writeUInt32BE(0, 0); // preamble
  header.writeUInt32BE(data.length, 4);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc16Arc(data));

  return Buffer.concat([header, data, crc]);
}

describe('FMC003 end-to-end connection', () => {
  it('accepts the device and maps its OBD elements to the right fields', async () => {
    const enqueued: Array<{ imei: string; records: TelemetryRecordPayload[] }> = [];

    const prisma = {
      unscoped: {
        device: {
          findMany: async () => [
            { tenantId: 'tenant-1', vehicleId: 'vehicle-1', model: 'FMC003' },
          ],
        },
      },
    };
    const queue = {
      enqueueIngest: async (job: { imei: string; records: TelemetryRecordPayload[] }) => {
        enqueued.push(job);
      },
      enqueueQuarantine: async () => undefined,
    };
    const metrics = {
      telematicsParseErrorsTotal: { inc: () => undefined },
    };

    // Port 0: isletim sistemi bos bir port versin, testler cakismasin.
    const gateway = new TeltonikaGatewayService(
      prisma as never,
      queue as never,
      metrics as never,
      0,
      '127.0.0.1',
    );
    await gateway.start();

    const port = (gateway as unknown as { server: { address(): { port: number } } }).server.address()
      .port;

    const socket = connect({ host: '127.0.0.1', port });
    await once(socket, 'connect');

    try {
      // IMEI el sikismasi: 2 bayt uzunluk + ascii imei, cihaz 0x01 bekler.
      const imeiFrame = Buffer.alloc(2 + IMEI.length);
      imeiFrame.writeUInt16BE(IMEI.length, 0);
      imeiFrame.write(IMEI, 2, 'ascii');
      socket.write(imeiFrame);

      const [handshake] = (await once(socket, 'data')) as [Buffer];
      assert.deepEqual([...handshake], [0x01], 'cihaz kabul edilmeliydi');

      socket.write(buildCodec8ExtFrame());
      const [ack] = (await once(socket, 'data')) as [Buffer];
      assert.equal(ack.readUInt32BE(0), 1, 'bir kayit onaylanmaliydi');
    } finally {
      socket.destroy();
      await gateway.stop();
    }

    assert.equal(enqueued.length, 1);
    const [record] = enqueued[0].records;

    assert.equal(enqueued[0].imei, IMEI);
    assert.equal(record.coolantTemp, 91, 'AVL 32 bu modelde sogutucu sicakligi');
    assert.equal(record.rpm, undefined, 'AVL 32 devir olarak okunmamali');
    assert.equal(record.fuelLevelPct, 62);
    assert.equal(record.odometerKm, 154.321);
    assert.equal(record.voltage, 14);
    assert.equal(record.ignition, true);
    assert.equal(record.speedKph, 48);
    assert.equal(record.dtcPresent, true);
    assert.deepEqual(
      record.dtc.map((entry) => entry.code),
      ['P0100', 'P0234'],
    );
  });
});
