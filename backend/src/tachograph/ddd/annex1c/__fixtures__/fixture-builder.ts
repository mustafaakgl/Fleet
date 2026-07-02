import { createSign, type KeyObject } from 'node:crypto';
import {
  ACTIVITY_AVAILABLE,
  ACTIVITY_DRIVING,
  ACTIVITY_REST,
  ACTIVITY_WORK,
  CARD_RECORD_DATA,
  CARD_RECORD_SIGNATURE,
  DRIVER_CARD_TYPE_ID,
  EF_APPLICATION_IDENTIFICATION_GEN1,
  EF_DRIVER_ACTIVITY_DATA_GEN1,
  EF_IDENTIFICATION_GEN1,
  VU_BLOCK_ACTIVITIES_GEN1,
  VU_BLOCK_EVENTS_FAULTS_GEN1,
  VU_BLOCK_OVERVIEW_GEN1,
  VU_EVENT_DRIVING_WITHOUT_CARD,
} from '../constants';
import {
  encodeActivityChangeInfo,
  encodeDailyActivityRecord,
  type ActivityChangeInfo,
  type DailyActivityRecord,
} from '../activity-change';
import { encodeTimeReal } from '../time-real';
import { encodeCardTlv, encodeVuTrepBlock } from '../tlv';
import { getTestCaKeyPair } from '../signature/test-ca';

const DAY1_EPOCH = 1_717_200_000; // 2024-06-01 UTC
const DAY2_EPOCH = 1_717_286_400; // 2024-06-02 UTC

function change(activity: number, minutes: number, cardInserted = true): ActivityChangeInfo {
  return { slot: false, crew: false, cardInserted, activity, minutes };
}

function makeDailyRecord(
  recordDateEpoch: number,
  changes: ActivityChangeInfo[],
  previousRecordLength = 0,
  dayDistance = 100,
): DailyActivityRecord {
  const recordLength = 10 + changes.length * 2;
  return { previousRecordLength, recordLength, recordDateEpoch, dayDistance, changes };
}

function buildDriverActivityPayload(records: DailyActivityRecord[], ringSize: number): Buffer {
  const ring = Buffer.alloc(ringSize, 0);
  let offset = 0;

  for (const record of records) {
    const encoded = encodeDailyActivityRecord(record);
    for (let i = 0; i < encoded.length; i += 1) {
      ring[(offset + i) % ringSize] = encoded[i];
    }
    offset += encoded.length;
  }

  const oldestPtr = 0;
  const newestPtr =
    records.length === 1
      ? 0
      : records.slice(0, -1).reduce((acc, record) => acc + record.recordLength, 0);

  const header = Buffer.alloc(4);
  header.writeUInt16BE(oldestPtr, 0);
  header.writeUInt16BE(newestPtr, 2);
  return Buffer.concat([header, ring]);
}

function buildWrapAroundActivityPayload(): Buffer {
  const record1 = makeDailyRecord(DAY1_EPOCH, [
    change(ACTIVITY_REST, 0),
    change(ACTIVITY_DRIVING, 360),
  ], 0, 50);

  const record2 = makeDailyRecord(DAY2_EPOCH, [
    change(ACTIVITY_WORK, 0),
    change(ACTIVITY_DRIVING, 120),
  ], record1.recordLength, 80);

  const ringSize = 28;
  const body1 = encodeDailyActivityRecord(record1);
  const body2 = encodeDailyActivityRecord(record2);
  const ring = Buffer.alloc(ringSize, 0);

  const oldestPtr = 20;
  placeInRing(ring, oldestPtr, body1);
  placeInRing(ring, 6, body2);

  const header = Buffer.alloc(4);
  header.writeUInt16BE(oldestPtr, 0);
  header.writeUInt16BE(6, 2);
  return Buffer.concat([header, ring]);
}

function placeInRing(ring: Buffer, offset: number, data: Buffer): void {
  for (let i = 0; i < data.length; i += 1) {
    ring[(offset + i) % ring.length] = data[i];
  }
}

function signData(data: Buffer, privateKey: KeyObject): Buffer {
  const signer = createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  return signer.sign(privateKey);
}

function appendSignedTlv(chunks: Buffer[], fid: number, value: Buffer, privateKey?: KeyObject): void {
  chunks.push(encodeCardTlv(fid, CARD_RECORD_DATA, value));
  if (privateKey) {
    chunks.push(encodeCardTlv(fid, CARD_RECORD_SIGNATURE, signData(value, privateKey)));
  }
}

function buildGen1CardBase(options: {
  activityPayload: Buffer;
  cardNo?: string;
  sign?: boolean;
}): Buffer {
  const chunks: Buffer[] = [];
  const privateKey = options.sign ? getTestCaKeyPair().privateKey : undefined;

  const appId = Buffer.alloc(3);
  appId.writeUInt8(DRIVER_CARD_TYPE_ID, 0);
  appId.writeUInt16BE(0x0100, 1);
  appendSignedTlv(chunks, EF_APPLICATION_IDENTIFICATION_GEN1, appId, privateKey);

  const identification = Buffer.alloc(32, 0);
  identification.write(options.cardNo ?? 'CARD-ANNEX-0001', 0, 'ascii');
  appendSignedTlv(chunks, EF_IDENTIFICATION_GEN1, identification, privateKey);

  appendSignedTlv(chunks, EF_DRIVER_ACTIVITY_DATA_GEN1, options.activityPayload, privateKey);

  return Buffer.concat(chunks);
}

export function buildTwoDayGen1CardFile(cardNo = 'CARD-ANNEX-0001'): Buffer {
  const day1 = makeDailyRecord(DAY1_EPOCH, [
    change(ACTIVITY_REST, 0),
    change(ACTIVITY_DRIVING, 480),
    change(ACTIVITY_REST, 600),
  ]);

  const day2 = makeDailyRecord(DAY2_EPOCH, [
    change(ACTIVITY_WORK, 0),
    change(ACTIVITY_DRIVING, 240),
    change(ACTIVITY_AVAILABLE, 540),
  ], day1.recordLength);

  const payload = buildDriverActivityPayload([day1, day2], 64);
  return buildGen1CardBase({ activityPayload: payload, cardNo });
}

export function buildWrapAroundGen1CardFile(): Buffer {
  return buildGen1CardBase({ activityPayload: buildWrapAroundActivityPayload() });
}

export function buildSignedGen1CardFile(cardNo = 'CARD-ANNEX-SIGN1'): Buffer {
  const day = makeDailyRecord(DAY1_EPOCH, [
    change(ACTIVITY_REST, 0),
    change(ACTIVITY_DRIVING, 60),
    change(ACTIVITY_DRIVING, 600),
  ], 0, 300);

  const payload = buildDriverActivityPayload([day], 32);
  return buildGen1CardBase({ activityPayload: payload, cardNo, sign: true });
}

export function corruptSignedBuffer(buffer: Buffer): Buffer {
  const copy = Buffer.from(buffer);
  copy[copy.length - 3] ^= 0xff;
  return copy;
}

export function buildDrivingWithoutCardVuFile(): Buffer {
  const overview = Buffer.alloc(32, 0);
  overview.write('WDB96340310234567', 0, 'ascii');
  overview.write('34-FL-9999', 17, 'ascii');

  const dayEpoch = encodeTimeReal(DAY1_EPOCH);
  const changes = [
    encodeActivityChangeInfo(change(ACTIVITY_REST, 0, false)),
    encodeActivityChangeInfo(change(ACTIVITY_DRIVING, 120, false)),
  ];
  const activitiesBody = Buffer.concat([
    dayEpoch,
    Buffer.from([0x00, changes.length]),
    ...changes.map((raw) => {
      const b = Buffer.alloc(2);
      b.writeUInt16BE(raw, 0);
      return b;
    }),
  ]);

  const eventEpoch = encodeTimeReal(DAY1_EPOCH + 7_200);
  const eventBody = Buffer.alloc(10);
  eventEpoch.copy(eventBody, 0);
  eventBody.writeUInt8(VU_EVENT_DRIVING_WITHOUT_CARD, 4);
  eventBody.writeUInt16BE(0, 5);
  eventBody.writeUInt16BE(1_800, 7);

  return Buffer.concat([
    encodeVuTrepBlock(VU_BLOCK_OVERVIEW_GEN1, overview),
    encodeVuTrepBlock(VU_BLOCK_ACTIVITIES_GEN1, activitiesBody),
    encodeVuTrepBlock(VU_BLOCK_EVENTS_FAULTS_GEN1, eventBody),
  ]);
}

export const FIXTURE_EXPECTATIONS = {
  twoDayCardNo: 'CARD-ANNEX-0001',
  signedCardNo: 'CARD-ANNEX-SIGN1',
  vuVin: 'WDB96340310234567',
};
