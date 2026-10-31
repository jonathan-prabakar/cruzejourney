import demo from '../../../data/demo-telemetry.json';
import { getDemoFuelStations } from '../../fuel/__tests__/station-fixtures';
import { getDemoRouteContext } from '../../fuel/demo';
import { calculateFuelIntelligence } from '../../fuel/intelligence';
import type { VehicleIntelligenceContext } from '../types';

/** Reproducible INPUT scenarios only. No model responses or fabricated AI successes. */
export function createIntelligenceScenarios(): Record<'lowFuel' | 'criticalFuel' | 'diagnostic' | 'combined', VehicleIntelligenceContext> {
  const stations = getDemoFuelStations();
  const make = (index: number, fuelPercent?: number): VehicleIntelligenceContext => {
    const telemetry = { ...demo.records[index], ...(fuelPercent === undefined ? {} : { fuel_percent: fuelPercent }) };
    const context: VehicleIntelligenceContext = {
      telemetry, history: demo.records.slice(Math.max(0, index - 20), index), vehicle: { ...demo.metadata.vehicle },
      route: getDemoRouteContext(index), stations: structuredClone(stations), requiredFuelType: 'diesel', demoMode: true,
      diagnostics: { available: false, findings: [] }, efficiency: null,
    };
    context.fuelIntelligence = calculateFuelIntelligence(context);
    return context;
  };
  return {
    lowFuel: make(0), criticalFuel: make(0, 9),
    // M2's actual P0301 onset. The isolated diagnostic scenario deliberately raises fuel
    // to remove the fuel concern; combined uses the unmodified M2 reading.
    diagnostic: make(160, 30), combined: make(160),
  };
}
