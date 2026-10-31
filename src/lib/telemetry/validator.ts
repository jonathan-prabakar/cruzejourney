import type { DatasetMetadata, DatasetValidationResult, ValidationIssue, VehicleTelemetry } from './types';
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const numeric = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** Reject timezone ambiguity and calendar overflow such as February 30. */
function timestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute, second, , zone] = match;
  const y = Number(year);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][Number(month) - 1];
  return Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= days &&
    Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60 &&
    (zone === 'Z' || (Number(zone.slice(1, 3)) <= 23 && Number(zone.slice(4)) < 60)) &&
    Number.isFinite(Date.parse(value));
}
function metadata(value: unknown): value is DatasetMetadata {
  if (!object(value) || !object(value.vehicle)) return false;
  return ['name', 'source', 'route'].every(key => typeof value[key] === 'string' && value[key].length > 0) &&
    typeof value.synthetic === 'boolean' && Array.isArray(value.limitations) &&
    value.limitations.every(item => typeof item === 'string') &&
    typeof value.vehicle.name === 'string' && value.vehicle.name.length > 0 &&
    numeric(value.vehicle.tank_capacity_gallons, 0.001, 10000) &&
    numeric(value.vehicle.typical_mpg, 0.001, 1000);
}
/** Invalid rows are excluded and reported. The engine rejects datasets with any errors. */
export function validateDataset(input: unknown): DatasetValidationResult {
  const errors: ValidationIssue[] = [];
  const records: VehicleTelemetry[] = [];
  const issue = (index: number | null, field: string, message: string) => errors.push({ index, field, message });
  if (!object(input) || !Array.isArray(input.records)) {
    return { valid: false, metadata: null, records, errors: [{ index: null, field: 'records', message: 'Expected a dataset object with a records array' }] };
  }
  const meta = metadata(input.metadata) ? structuredClone(input.metadata) : null;
  if (!meta) issue(null, 'metadata', 'Expected source, synthetic flag, route, limitations, and a valid vehicle profile');
  const seen = new Set<number>();
  input.records.forEach((row: unknown, index: number) => {
    const before = errors.length;
    if (!object(row)) { issue(index, 'record', 'Expected an object'); return; }
    if (!timestamp(row.timestamp)) issue(index, 'timestamp', 'Expected a valid ISO date-time with explicit timezone');
    const bounds = { speed_mph: [0, 200], rpm: [0, 12000], fuel_percent: [0, 100], mpg: [0, 1000] } as const;
    for (const [field, [min, max]] of Object.entries(bounds)) {
      if (!numeric(row[field], min, max)) issue(index, field, 'Expected a finite number between ' + min + ' and ' + max);
    }
    const optional = { latitude: [-90, 90], longitude: [-180, 180], coolant_temp_f: [-100, 350] } as const;
    for (const [field, [min, max]] of Object.entries(optional)) {
      if (row[field] != null && !numeric(row[field], min, max)) issue(index, field, 'Expected null or a finite number between ' + min + ' and ' + max);
    }
    if (row.diagnostic_code != null && (typeof row.diagnostic_code !== 'string' || !/^[PBCU][0-3][0-9A-F]{3}$/.test(row.diagnostic_code))) {
      issue(index, 'diagnostic_code', 'Expected null or an uppercase OBD diagnostic code');
    }
    if (timestamp(row.timestamp)) {
      const time = Date.parse(row.timestamp);
      if (seen.has(time)) issue(index, 'timestamp', 'Duplicate timestamp instant');
      seen.add(time);
    }
    if (errors.length === before) records.push({
      timestamp: row.timestamp as string,
      latitude: (row.latitude ?? null) as number | null,
      longitude: (row.longitude ?? null) as number | null,
      speed_mph: row.speed_mph as number,
      rpm: row.rpm as number,
      fuel_percent: row.fuel_percent as number,
      mpg: row.mpg as number,
      coolant_temp_f: (row.coolant_temp_f ?? null) as number | null,
      diagnostic_code: (row.diagnostic_code ?? null) as string | null,
    });
  });
  records.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  return { valid: errors.length === 0, metadata: meta, records, errors };
}
