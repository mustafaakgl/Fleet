const DEFAULT_TACHO_ACK_SLA_DAYS = 7;

export function getTachoAckSlaDays(): number {
  const raw = Number(process.env.TACHO_ACK_SLA_DAYS ?? DEFAULT_TACHO_ACK_SLA_DAYS);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_TACHO_ACK_SLA_DAYS;
  }
  return Math.floor(raw);
}

export function getTachoAckSlaCutoff(referenceDate = new Date()): Date {
  const cutoff = new Date(referenceDate);
  cutoff.setDate(cutoff.getDate() - getTachoAckSlaDays());
  return cutoff;
}