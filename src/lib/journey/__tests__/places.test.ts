import { describe, expect, it } from 'vitest';
import { verifiedTruckStops } from '@/data/verified-truck-stops';
import { stationsForRoute, amenitiesForRoute } from '../places';
import { buildCuratedRoute } from '../routes';
import { calculateJourneyPlan, DEFAULT_PREFERENCES } from '../planner';

describe('verified truck-stop integration in the journey planner', () => {
  it('keeps official coordinates and price provenance instead of projecting station icons onto the highway', () => {
    const route = buildCuratedRoute('san-antonio', 'austin');
    const stations = stationsForRoute(route);
    expect(stations.length).toBeGreaterThan(0);
    for (const station of stations) {
      const source = verifiedTruckStops.find(s => s.id === station.id)!;
      expect(source).toBeDefined();
      expect(station.coordinate).toEqual([source.longitude, source.latitude]);
      expect(station.isSynthetic).toBe(false);
      expect(station.truckAccess).toBe('yes');
      expect(station.priceSource).toBe('verified');
      expect(station.sourceUrl).toBe(source.sourceUrl);
      expect(station.detourMiles).toBeGreaterThan(0);
      expect(station.distanceAlongRouteMiles).toBeGreaterThanOrEqual(0);
      expect(station.distanceAlongRouteMiles).toBeLessThanOrEqual(route.distanceMiles);
    }
    expect(amenitiesForRoute(stations)).toEqual([]);
  });

  it('plans a feasible default refueling trip with the real source and retains the reserve', () => {
    const planning = calculateJourneyPlan({ route: buildCuratedRoute('san-antonio', 'austin'), preferences: DEFAULT_PREFERENCES });
    expect(planning.requested.feasible).toBe(true);
    expect(planning.requested.fuelStops).toHaveLength(1);
    expect(planning.requested.fuelStops[0].station.isSynthetic).toBe(false);
    expect(planning.requested.arrivalFuelPercent).toBeGreaterThanOrEqual(10);
    expect(planning.amenities).toEqual([]);
  });

  it('leaves unsupported corridor segments empty instead of inventing coverage', () => {
    expect(stationsForRoute(buildCuratedRoute('kyle', 'austin'))).toEqual([]);
    const reverse = buildCuratedRoute('austin', 'san-antonio');
    expect(stationsForRoute(reverse).every(s => s.isSynthetic === false)).toBe(true);
  });
});
