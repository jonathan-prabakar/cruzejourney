import { describe, expect, it, vi } from 'vitest';
import { DEMO_LOCATIONS, buildCuratedRoute, curatedRouteProvider, requestJourneyRoute, swapEndpoints, validateEndpoints } from '../routes';
import { DEFAULT_PREFERENCES, calculateJourneyPlan, evaluateItinerary, PLANNING_MPG } from '../planner';
import { stationsForRoute, amenitiesForRoute } from '../places';
import { positionAt } from '../geometry';
import type { JourneyPreferences, JourneyWaypoint } from '../types';

vi.mock('../places', async importOriginal => ({
  ...await importOriginal<typeof import('../places')>(),
  stationsForRoute: (await import('./station-fixtures')).testStationsForRoute,
  amenitiesForRoute: (await import('./station-fixtures')).testAmenitiesForRoute,
}));

const route = buildCuratedRoute('san-antonio', 'austin');
const input = (preferences: Partial<JourneyPreferences> = {}, waypoints?: JourneyWaypoint[]) =>
  ({ route, preferences: { ...DEFAULT_PREFERENCES, ...preferences }, waypoints });

describe('curated endpoints and road routing', () => {
  it('searches supported suggestions without treating arbitrary addresses as resolved', () => {
    expect(curatedRouteProvider.search('marcos').map(l => l.id)).toEqual(['san-marcos']);
    expect(curatedRouteProvider.search('123 invented address')).toEqual([]);
    expect(validateEndpoints('not-selected', 'austin')).toContain('Select both');
    expect(validateEndpoints('austin', 'austin')).toContain('different');
    expect(swapEndpoints('san-antonio', 'austin')).toEqual(['austin', 'san-antonio']);
  });
  it('contains dense cached road geometry rather than a city-to-city straight line', () => {
    expect(route.coordinates.length).toBeGreaterThan(1000);
    expect(route.distanceMiles).toBeGreaterThan(80);
    expect(route.distanceMiles).toBeLessThan(90);
    expect(route.durationSeconds).toBeGreaterThan(3600);
    expect(route.provider).toBe('cached-osrm');
    expect(route.cumulativeMiles.at(-1)).toBeCloseTo(route.distanceMiles);
    expect(positionAt(route, 0)).toEqual(route.coordinates[0]);
    expect(positionAt(route, route.distanceMiles)).toEqual(route.coordinates.at(-1));
    expect(positionAt(route, route.distanceMiles / 2)).not.toEqual(route.coordinates[0]);
  });
  it('routes every distinct supported pair in both directions with increasing distance indices', () => {
    for (const from of DEMO_LOCATIONS) for (const to of DEMO_LOCATIONS) {
      if (from.id === to.id) continue;
      const path = buildCuratedRoute(from.id, to.id);
      expect(path.distanceMiles).toBeGreaterThan(0);
      expect(path.coordinates[0][1]).toBeCloseTo(from.coordinate[1], 2);
      expect(path.coordinates.at(-1)![1]).toBeCloseTo(to.coordinate[1], 2);
      expect(path.cumulativeMiles.every((n, i) => i === 0 || n >= path.cumulativeMiles[i - 1])).toBe(true);
    }
  });
  it('handles provider rejection, invalid geometry and cancellation', async () => {
    await expect(requestJourneyRoute({ search: () => [], route: async () => { throw new Error('offline provider error'); } }, 'san-antonio', 'austin')).rejects.toThrow('offline');
    await expect(requestJourneyRoute({ search: () => [], route: async () => ({ ...route, coordinates: [] }) }, 'san-antonio', 'austin')).rejects.toThrow('invalid geometry');
    const abort = new AbortController(); abort.abort();
    await expect(requestJourneyRoute(curatedRouteProvider, 'san-antonio', 'austin', abort.signal)).rejects.toThrow('cancelled');
  });
});

describe('sequential fuel planning and editable itineraries', () => {
  it('adds an automatic safe stop for low fuel and explicitly models its refill', () => {
    const result = calculateJourneyPlan(input());
    const plan = result.requested;
    expect(plan.feasible).toBe(true);
    expect(plan.fuelStops).toHaveLength(1);
    const stop = plan.fuelStops[0];
    expect(stop.leg.fuelAddedGallons).toBeGreaterThan(0);
    expect(stop.leg.departureFuelGallons).toBe(120);
    expect(stop.leg.arrivalFuelGallons).toBeGreaterThanOrEqual(12);
    expect(plan.arrivalFuelPercent).toBeGreaterThanOrEqual(10);
    expect(plan.fuelAddedGallons).toBeCloseTo(120 - stop.leg.arrivalFuelGallons);
    expect(plan.estimatedConsumptionGallons).toBeCloseTo(plan.totalDistanceMiles / PLANNING_MPG);
  });
  it('uses no unnecessary fuel stops in automatic mode when starting fuel is sufficient', () => {
    const plan = calculateJourneyPlan(input({ startingFuelPercent: 60 })).requested;
    expect(plan.feasible).toBe(true);
    expect(plan.fuelStops).toHaveLength(0);
    expect(plan.purchaseCost).toBe(0);
  });
  it('keeps an infeasible no-stop request separate from a safe recommended alternative', () => {
    const r = calculateJourneyPlan(input({ fuelStops: 'none' }));
    expect(r.requested.feasible).toBe(false);
    expect(r.recommended!.feasible).toBe(true);
    expect(r.recommended!.fuelStops.length).toBeGreaterThan(0);
    expect(r.preferenceExplanation).toContain('cannot preserve');
  });
  it.each([['one', 1], ['two', 2], ['three', 3]] as const)('models explicit %s preference with %s sequential refills', (fuelStops, count) => {
    const plan = calculateJourneyPlan(input({ fuelStops })).requested;
    expect(plan.feasible).toBe(true);
    expect(plan.fuelStops).toHaveLength(count);
    let gallons = 120 * DEFAULT_PREFERENCES.startingFuelPercent / 100;
    for (const leg of plan.legs) {
      expect(leg.arrivalFuelGallons).toBeCloseTo(gallons - leg.travelMiles / PLANNING_MPG);
      expect(leg.arrivalFuelGallons).toBeGreaterThanOrEqual(12 - 1e-8);
      gallons = leg.arrivalFuelGallons + leg.fuelAddedGallons;
      expect(leg.departureFuelGallons).toBeCloseTo(gallons);
      expect(gallons).toBeLessThanOrEqual(120);
    }
  });
  it('flags removing a required stop rather than silently marking the route safe', () => {
    const original = calculateJourneyPlan(input()).requested;
    const changed = calculateJourneyPlan(input({}, original.waypoints.filter(w => w.kind !== 'fuel')));
    expect(changed.requested.feasible).toBe(false);
    expect(changed.requested.arrivalFuelPercent).toBeNull();
    expect(changed.requested.warnings.join(' ')).toContain('beyond usable');
    expect(changed.recommended!.feasible).toBe(true);
  });
  it('validates manual stop reordering and rejects unsupported backtracking', () => {
    const original = calculateJourneyPlan(input({ fuelStops: 'two' })).requested;
    const reversed = evaluateItinerary(input(), [...original.waypoints].reverse());
    expect(reversed.feasible).toBe(false);
    expect(reversed.warnings.join(' ')).toContain('backtracking');
    expect(evaluateItinerary(input(), original.waypoints).feasible).toBe(true);
  });
  it('recalculates route distance, duration, fuel and geometry after amenity insertion', () => {
    const result = calculateJourneyPlan(input());
    const amenity = result.amenities.find(a => a.stationId === result.requested.fuelStops[0].station.id)!;
    const next = evaluateItinerary(input(), [...result.requested.waypoints, { id: amenity.id, kind: 'amenity' }]);
    expect(next.feasible).toBe(true);
    expect(next.totalDistanceMiles).toBeCloseTo(result.requested.totalDistanceMiles + amenity.extraDistanceMiles);
    expect(next.durationSeconds).toBeGreaterThan(result.requested.durationSeconds);
    expect(next.estimatedConsumptionGallons).toBeGreaterThan(result.requested.estimatedConsumptionGallons!);
    expect(next.amenityStops[0].id).toBe(amenity.id);
    expect(next.route.provenance).toBe('cached-road-with-modeled-access');
    expect(next.route.distanceMiles).toBeCloseTo(next.totalDistanceMiles);
    expect(next.route.cumulativeMiles.at(-1)).toBeCloseTo(next.totalDistanceMiles);
  });
  it('does not invent stations, amenities, prices, hours or ratings', () => {
    const stations = stationsForRoute(route), amenities = amenitiesForRoute(stations);
    expect(stations.every(s => s.isSynthetic && s.priceSource === 'sample')).toBe(true);
    expect(amenities.every(a => a.isSynthetic && a.hours === null && a.rating === null && a.walkingMinutes === null)).toBe(true);
    for (const waypoint of [{ kind: 'fuel' as const, id: 'imaginary' }, { kind: 'amenity' as const, id: 'imaginary' }]) {
      expect(evaluateItinerary(input(), [waypoint]).warnings.join(' ')).toContain('No location was invented');
    }
    const unknownPrice = stations.find(s => s.pricePerGallon === null)!;
    const plan = evaluateItinerary(input({ startingFuelPercent: 60 }), [{ kind: 'fuel', id: unknownPrice.id }]);
    expect(plan.feasible).toBe(true);
    expect(plan.purchaseCost).toBeNull();
  });
  it('excludes unavailable, incompatible and unknown-detour stations', () => {
    const stations = stationsForRoute(route);
    for (const s of stations.filter(s => !s.isAvailable || !s.fuelTypes.includes('diesel') || s.detourMiles === null)) {
      expect(evaluateItinerary(input({ startingFuelPercent: 60 }), [{ kind: 'fuel', id: s.id }]).feasible).toBe(false);
    }
  });
  it.each([5, NaN, -1, 101])('cannot confirm a route with unsafe/invalid starting fuel %s', startingFuelPercent => {
    expect(calculateJourneyPlan(input({ startingFuelPercent })).recommended).toBeNull();
  });
  it('is deterministic, leaves inputs unchanged and supports reverse-corridor stations', () => {
    const source = input(), before = structuredClone(source);
    expect(calculateJourneyPlan(source)).toEqual(calculateJourneyPlan(source));
    expect(source).toEqual(before);
    const reverse = calculateJourneyPlan({ ...source, route: buildCuratedRoute('austin', 'san-antonio') });
    expect(reverse.requested.feasible).toBe(true);
    expect(reverse.stations.every(s => s.distanceAlongRouteMiles! > 0 && s.distanceAlongRouteMiles! < reverse.requested.baseRoute.distanceMiles)).toBe(true);
  });
});
