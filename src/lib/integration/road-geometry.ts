export type Coordinate = [number, number];
export function geometryDistances(coordinates: readonly number[][]): number[] {
  let distance = 0;
  const rad = Math.PI / 180;
  return coordinates.map((point, index) => {
    if (index) {
      const previous = coordinates[index - 1];
      const x =
        (point[0] - previous[0]) *
        rad *
        Math.cos(((point[1] + previous[1]) / 2) * rad);
      const y = (point[1] - previous[1]) * rad;
      distance += Math.hypot(x, y) * 6371000;
    }
    return distance;
  });
}
/** Interpolation follows cached road geometry, never a straight city-to-city line. */
export function pointAtProgress(
  coordinates: readonly number[][],
  cumulative: readonly number[],
  progress: number,
): Coordinate {
  const target =
    Math.max(0, Math.min(1, progress)) * cumulative[cumulative.length - 1];
  let low = 1,
    high = cumulative.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (cumulative[mid] < target) low = mid + 1;
    else high = mid;
  }
  const before = coordinates[low - 1],
    after = coordinates[low];
  const span = cumulative[low] - cumulative[low - 1];
  const fraction = span ? (target - cumulative[low - 1]) / span : 0;
  return [
    before[0] + (after[0] - before[0]) * fraction,
    before[1] + (after[1] - before[1]) * fraction,
  ];
}

/** Finds the nearest point on the road line and its distance from the route start. */
export function nearestRoutePosition(
  coordinates: readonly number[][],
  cumulative: readonly number[],
  point: readonly [number, number],
): { distanceAlongMeters: number; distanceFromRouteMeters: number } {
  const radians = Math.PI / 180;
  let best = { distanceAlongMeters: 0, distanceFromRouteMeters: Infinity };
  for (let index = 1; index < coordinates.length; index++) {
    const start = coordinates[index - 1];
    const end = coordinates[index];
    const cosLatitude = Math.cos(((start[1] + end[1] + point[1]) / 3) * radians);
    const ax = start[0] * radians * cosLatitude;
    const ay = start[1] * radians;
    const bx = end[0] * radians * cosLatitude;
    const by = end[1] * radians;
    const px = point[0] * radians * cosLatitude;
    const py = point[1] * radians;
    const dx = bx - ax;
    const dy = by - ay;
    const segmentSquared = dx * dx + dy * dy;
    const progress = segmentSquared
      ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / segmentSquared))
      : 0;
    const offsetMeters = Math.hypot(px - (ax + dx * progress), py - (ay + dy * progress)) * 6371000;
    if (offsetMeters < best.distanceFromRouteMeters) {
      best = {
        distanceAlongMeters:
          cumulative[index - 1] +
          (cumulative[index] - cumulative[index - 1]) * progress,
        distanceFromRouteMeters: offsetMeters,
      };
    }
  }
  return best;
}

/** Road heading in MapLibre's clockwise degrees from north, stable at turns and endpoints. */
export function bearingAtProgress(
  coordinates: readonly number[][],
  cumulative: readonly number[],
  progress: number,
): number {
  const target = Math.max(0, Math.min(1, progress)) * cumulative[cumulative.length - 1];
  let segment = -1;
  // Strictly greater selects the outgoing segment at an exact vertex.
  for (let index = 1; index < cumulative.length; index++) {
    if (cumulative[index] > target && cumulative[index] > cumulative[index - 1]) {
      segment = index;
      break;
    }
  }
  if (segment < 0) {
    for (let index = cumulative.length - 1; index > 0; index--) {
      if (cumulative[index] > cumulative[index - 1]) {
        segment = index;
        break;
      }
    }
  }
  if (segment < 0) return 0;
  const before = coordinates[segment - 1];
  const after = coordinates[segment];
  const longitudeDelta = (after[0] - before[0]) * Math.cos(((after[1] + before[1]) * Math.PI) / 360);
  const latitudeDelta = after[1] - before[1];
  return (Math.atan2(longitudeDelta, latitudeDelta) * 180 / Math.PI + 360) % 360;
}
