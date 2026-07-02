import { formatTachographDurationS } from './tachograph-format';

function readCalculated(evidence: Record<string, unknown> | null): Record<string, unknown> | null {
  const calculated = evidence?.calculatedValues;
  if (!calculated || typeof calculated !== 'object') return null;
  return calculated as Record<string, unknown>;
}

/** Single-line evidence sentence: calculated value · limit · exhausted rights. */
export function formatEvidenceLineText(
  type: string,
  evidence: Record<string, unknown> | null,
  t: (key: string, opts?: Record<string, string | number>) => string,
): string {
  const values = readCalculated(evidence);
  if (!values) {
    return t('tachograph.infringements.evidence.fallback');
  }

  const drivingS = typeof values.drivingS === 'number' ? values.drivingS : null;
  const thresholdS = typeof values.thresholdS === 'number' ? values.thresholdS : null;
  const restS = typeof values.restS === 'number' ? values.restS : null;
  const requiredRestS = typeof values.requiredRestS === 'number' ? values.requiredRestS : null;

  if (type === 'daily_driving_exceeded' && drivingS !== null && thresholdS !== null) {
    const extensionsUsed =
      typeof values.extensionsUsed === 'number' ? Math.round(values.extensionsUsed) : null;
    const extensionsMax =
      typeof values.extensionsMax === 'number' ? Math.round(values.extensionsMax) : 2;
    const extensionPart =
      extensionsUsed !== null
        ? t('tachograph.infringements.evidence.extensionsExhausted', {
            used: extensionsUsed,
            max: extensionsMax,
          })
        : '';
    return t('tachograph.infringements.evidence.dailyDriving', {
      calculated: formatTachographDurationS(drivingS, t),
      limit: formatTachographDurationS(thresholdS, t),
      extensions: extensionPart,
    });
  }

  if (type === 'insufficient_daily_rest' && restS !== null && requiredRestS !== null) {
    return t('tachograph.infringements.evidence.dailyRest', {
      calculated: formatTachographDurationS(restS, t),
      limit: formatTachographDurationS(requiredRestS, t),
    });
  }

  if (drivingS !== null && thresholdS !== null) {
    return t('tachograph.infringements.evidence.genericDriving', {
      calculated: formatTachographDurationS(drivingS, t),
      limit: formatTachographDurationS(thresholdS, t),
    });
  }

  if (restS !== null && requiredRestS !== null) {
    return t('tachograph.infringements.evidence.genericRest', {
      calculated: formatTachographDurationS(restS, t),
      limit: formatTachographDurationS(requiredRestS, t),
    });
  }

  return t('tachograph.infringements.evidence.fallback');
}
