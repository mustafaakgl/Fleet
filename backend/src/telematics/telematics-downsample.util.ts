export type TimeSeriesPoint = {
  recordedAt: Date;
  value: number | null;
};

export type DownsampledBucket = {
  bucketStart: string;
  value: number | null;
};

export type DownsampleOptions = {
  bucketMs: number;
  windowStart: Date;
  windowEnd: Date;
  aggregate?: (values: number[]) => number | null;
};

const defaultAggregate = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return Number((sum / values.length).toFixed(2));
};

export function downsampleTimeSeries(
  points: TimeSeriesPoint[],
  options: DownsampleOptions,
): DownsampledBucket[] {
  const aggregate = options.aggregate ?? defaultAggregate;
  const { bucketMs, windowStart, windowEnd } = options;
  const startMs = windowStart.getTime();
  const endMs = windowEnd.getTime();
  const bucketCount = Math.max(1, Math.ceil((endMs - startMs) / bucketMs));

  const buckets: number[][] = Array.from({ length: bucketCount }, () => []);

  for (const point of points) {
    const ts = point.recordedAt.getTime();
    if (ts < startMs || ts > endMs || point.value === null || Number.isNaN(point.value)) {
      continue;
    }
    const index = Math.min(bucketCount - 1, Math.floor((ts - startMs) / bucketMs));
    buckets[index]?.push(point.value);
  }

  return buckets.map((values, index) => ({
    bucketStart: new Date(startMs + index * bucketMs).toISOString(),
    value: aggregate(values),
  }));
}

export function mergeScalarSeriesToBuckets(
  buckets: DownsampledBucket[],
  scalar: number | null,
): DownsampledBucket[] {
  if (scalar === null) return buckets;
  return buckets.map((bucket) => ({
    ...bucket,
    value: bucket.value ?? scalar,
  }));
}
