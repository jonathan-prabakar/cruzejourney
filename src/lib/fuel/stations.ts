import demo from '../../data/demo-fuel-stations.json';
import { isNonnegativeFinite } from './range';
import type { FuelStation, StationValidationIssue, StationValidationResult } from './types';

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const optionalNonnegative = (value: unknown): boolean => value === null || isNonnegativeFinite(value);

/** Strict schema: missing measurements must be explicit null, never default to zero. */
export function validateFuelStations(input: unknown): StationValidationResult {
  const errors: StationValidationIssue[] = [];
  const stations: FuelStation[] = [];
  const issue = (index: number | null, field: string, message: string) => errors.push({ index, field, message });
  if (!Array.isArray(input)) return { valid: false, stations, errors: [{ index: null, field: 'stations', message: 'Expected a station array' }] };
  const ids = new Set<string>();
  input.forEach((row: unknown, index) => {
    const before = errors.length;
    if (!object(row)) { issue(index, 'station', 'Expected a station object'); return; }
    for (const field of ['id', 'name']) if (!nonempty(row[field])) issue(index, field, 'Expected a nonempty string');
    if (nonempty(row.id)) {
      if (ids.has(row.id)) issue(index, 'id', 'Duplicate station ID');
      ids.add(row.id);
    }
    for (const [field, bound] of [['latitude', 90], ['longitude', 180]] as const) {
      const value = row[field];
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > bound)) issue(index, field, 'Expected null or finite valid coordinates');
    }
    if (!Array.isArray(row.fuelTypes) || row.fuelTypes.length === 0 || !row.fuelTypes.every(nonempty)) issue(index, 'fuelTypes', 'Expected a nonempty list of fuel types');
    if (!optionalNonnegative(row.pricePerGallon) || row.pricePerGallon === 0) issue(index, 'pricePerGallon', 'Expected a positive price or explicit null');
    if (row.priceSource !== 'sample' && row.priceSource !== 'verified' && row.priceSource !== 'unknown') issue(index, 'priceSource', 'Expected sample, verified or unknown');
    if (row.truckAccess !== undefined && !['yes', 'no', 'unknown'].includes(String(row.truckAccess))) issue(index, 'truckAccess', 'Expected yes, no or unknown');
    for (const field of ['distanceAlongRouteMiles', 'detourMiles']) {
      if (!optionalNonnegative(row[field])) issue(index, field, 'Expected finite nonnegative miles or explicit null');
    }
    for (const field of ['isAvailable', 'isSynthetic']) if (typeof row[field] !== 'boolean') issue(index, field, 'Expected a boolean');
    if (errors.length === before) stations.push({
      id: row.id as string, name: row.name as string,
      latitude: row.latitude as number | null, longitude: row.longitude as number | null,
      fuelTypes: [...row.fuelTypes as string[]],
      pricePerGallon: row.pricePerGallon as number | null,
      priceSource: row.priceSource as FuelStation['priceSource'],
      distanceAlongRouteMiles: row.distanceAlongRouteMiles as number | null,
      detourMiles: row.detourMiles as number | null,
      ...(row.truckAccess === undefined ? {} : { truckAccess: row.truckAccess as FuelStation['truckAccess'] }),
      isAvailable: row.isAvailable as boolean, isSynthetic: row.isSynthetic as boolean,
    });
  });
  return { valid: errors.length === 0, stations, errors };
}
export function parseFuelStationsJson(text: string): StationValidationResult {
  try { return validateFuelStations(JSON.parse(text) as unknown); }
  catch { return { valid: false, stations: [], errors: [{ index: null, field: 'json', message: 'Invalid JSON syntax' }] }; }
}
/** Fresh copies protect the bundled fictional source from consumer mutation. */
export function getDemoFuelStations(): FuelStation[] {
  const result = validateFuelStations(demo.stations);
  if (!result.valid) throw new Error('Bundled fictional station data failed validation');
  return result.stations;
}
export const demoStationMetadata = Object.freeze({ ...demo.metadata });
