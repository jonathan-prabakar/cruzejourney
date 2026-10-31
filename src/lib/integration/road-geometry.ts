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
