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
    if (row.sourceUrl !== undefined && (typeof row.sourceUrl !== 'string' || !/^https:\/\//.test(row.sourceUrl))) issue(index, 'sourceUrl', 'Expected an HTTPS source URL');
    if (row.priceVerifiedAt !== undefined && (typeof row.priceVerifiedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.priceVerifiedAt))) issue(index, 'priceVerifiedAt', 'Expected a YYYY-MM-DD price check date');
    if (row.address !== undefined && !nonempty(row.address)) issue(index, 'address', 'Expected a nonempty address');
    for (const field of ['truckParkingSpaces', 'defLanes']) {
      if (row[field] !== undefined && (!Number.isInteger(row[field]) || (row[field] as number) < 0)) issue(index, field, 'Expected a nonnegative integer');
    }
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
      ...(row.sourceUrl === undefined ? {} : { sourceUrl: row.sourceUrl as string }),
      ...(row.priceVerifiedAt === undefined ? {} : { priceVerifiedAt: row.priceVerifiedAt as string }),
      ...(row.address === undefined ? {} : { address: row.address as string }),
      ...(row.truckParkingSpaces === undefined ? {} : { truckParkingSpaces: row.truckParkingSpaces as number }),
      ...(row.defLanes === undefined ? {} : { defLanes: row.defLanes as number }),
      isAvailable: row.isAvailable as boolean, isSynthetic: row.isSynthetic as boolean,
    });
  });
  return { valid: errors.length === 0, stations, errors };
}
export function parseFuelStationsJson(text: string): StationValidationResult {
  try { return validateFuelStations(JSON.parse(text) as unknown); }
  catch { return { valid: false, stations: [], errors: [{ index: null, field: 'json', message: 'Invalid JSON syntax' }] }; }
}
