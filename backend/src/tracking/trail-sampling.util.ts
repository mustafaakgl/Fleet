export function sampleTrailPoints<T>(points: T[], maxPoints = 200): T[] {
  if (points.length <= maxPoints) {
    return points;
  }

  const step = Math.ceil(points.length / maxPoints);
  const sampled = points.filter((_, index) => index % step === 0);
  const lastPoint = points[points.length - 1];

  if (sampled[sampled.length - 1] !== lastPoint) {
    sampled.push(lastPoint);
  }

  if (sampled.length > maxPoints) {
    return [...sampled.slice(0, maxPoints - 1), lastPoint];
  }

  return sampled;
}
