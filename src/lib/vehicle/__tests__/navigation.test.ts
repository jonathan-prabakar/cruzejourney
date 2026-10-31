import { describe, expect, it } from 'vitest';
import { ConnectedVehicleSession, replayConnectedJourneys } from '../connected';
import { fuelOptions, remainingRoad } from '../fuel-options';
import { navigationDecision } from '../navigation-decision';
import { makeJourneyIntelligenceContext, deterministicJourneyInsight, validateJourneyDecision } from '../../journey/intelligence';
import { resolveJourneyContext } from '../../journey/context.server';
import { compactJourneyFacts } from '../../journey/gemma-core-bridge';
import { planFromTelemetry, INITIAL_VEHICLE_TELEMETRY } from '../connected';
import { DEMO_LOCATIONS } from '../../journey/routes';

function session() {
  const source = new ConnectedVehicleSession();
  source.subscribe(()=>{});
  return source;
}
describe('map-first fuel decisions and accepted continuations', () => {
  it('ranks estimated total purchase cost instead of the cheapest diesel price', () => {
    const source = session(), snapshot = source.getSnapshot();
    const result = fuelOptions(snapshot.planning,snapshot.frame);
    expect(result.options.length).toBeGreaterThan(3);
    expect(result.recommended!.purchaseCost).toBe(Math.min(...result.options.map(o=>o.purchaseCost!)));
    const cheapest = [...result.options].sort((a,b)=>a.station.pricePerGallon!-b.station.pricePerGallon!)[0];
    expect(result.recommended!.station.id).not.toBe(cheapest.station.id);
    expect(result.recommended!.station.pricePerGallon!).toBeGreaterThan(cheapest.station.pricePerGallon!);
    expect(result.options.every(o=>o.arrivalFuelPercent!>=10)).toBe(true);
    source.dispose();
  });
  it('keeps plan IDs stable across immaterial JavaScript floating-point differences', () => {
    const a=planFromTelemetry('san-antonio','austin',{...INITIAL_VEHICLE_TELEMETRY,fuel_percent:13.91234567000001});
    const b=planFromTelemetry('san-antonio','austin',{...INITIAL_VEHICLE_TELEMETRY,fuel_percent:13.91234566999999});
    expect(a.requested.id).toBe(b.requested.id);
    expect(a.requested.feasible).toBe(b.requested.feasible);
  });
  it('updates range conservatively when observed moving MPG declines, and ignores zero MPG while stopped', () => {
    const source=session(), s=source.getSnapshot();
    const normal=fuelOptions(s.planning,{...s.frame,phase:'driving',telemetry:{...s.frame.telemetry,mpg:8}});
    const decline=fuelOptions(s.planning,{...s.frame,phase:'driving',telemetry:{...s.frame.telemetry,mpg:5}});
    const stopped=fuelOptions(s.planning,{...s.frame,phase:'fuel-stop',telemetry:{...s.frame.telemetry,mpg:0}});
    expect(decline.fuel.fuel.usableRangeMiles!).toBeLessThan(normal.fuel.fuel.usableRangeMiles!);
    expect(stopped.fuel.fuel.valid).toBe(true);
    expect(stopped.planningMpg).toBeGreaterThan(0);
    source.dispose();
  });
  it('offers no refueling recommendation when the destination is already within range', () => {
    const source=session();source.planJourney('san-marcos','austin');
    const s=source.getSnapshot(), result=fuelOptions(s.planning,s.frame);
    expect(result.needed).toBe(false);expect(result.recommended).toBeNull();
    expect(()=>source.acceptStation(s.planning.stations[0].id)).toThrow();
    source.dispose();
  });
  it('preserves telemetry, trip distance and purchases when accepting a reachable stop midway', () => {
    const source=session();
    source.seekTo(source.frames.findIndex(f=>f.telemetry.diagnostic_code==='P0301'));
    const before=source.getSnapshot(), current={...source.getCurrentTelemetry()};
    const candidate=fuelOptions(before.planning,before.frame).recommended!;
    // A proposal is a pure query; nothing has been applied.
    expect(source.getSnapshot()).toBe(before);
    source.acceptStation(candidate.station.id);
    const after=source.getSnapshot();
    expect(source.getCurrentTelemetry()).toEqual(current);
    expect(after.tripDistanceMiles).toBeCloseTo(before.tripDistanceMiles,8);
    expect(after.totalAdded).toBe(before.totalAdded);
    expect(after.frame.remainingDistanceMiles).toBeLessThan(before.frame.remainingDistanceMiles+1);
    expect(after.planning.requested.baseRoute.origin.name).toBe('Current position');
    expect(after.planning.requested.fuelStops[0].station.id).toBe(candidate.station.id);
    expect(after.frame.telemetry.diagnostic_code).toBe('P0301');
    const canonical=replayConnectedJourneys(source.getJourneySelectors());
    expect(canonical.frame.telemetry).toEqual(current);
    expect(canonical.tripDistanceMiles).toBeCloseTo(after.tripDistanceMiles,8);
    expect(resolveJourneyContext({journeys:source.getJourneySelectors()}).core.telemetry).toEqual(current);
    source.reset();
    expect(source.getSnapshot().tripDistanceMiles).toBe(0);
    expect(source.getCurrentTelemetry().fuel_percent).toBe(17);
    expect(source.getCurrentTelemetry().diagnostic_code).toBeNull();
    source.dispose();
  });
  it('rejects stale, unknown or already-passed station acceptance without changing the drive', () => {
    const source=session();const first=source.getSnapshot();
    expect(()=>source.acceptStation('invented')).toThrow();
    expect(source.getSnapshot()).toBe(first);
    const station=fuelOptions(first.planning,first.frame).recommended!.station.id;
    source.seekTo(source.frames.length-1);
    const arrived=source.getSnapshot();
    expect(()=>source.acceptStation(station)).toThrow();
    expect(source.getSnapshot()).toBe(arrived);
    source.dispose();
  });
  it('permits only prevalidated proposal plans for model-suggested route changes', () => {
    const source=session();source.seekTo(source.frames.findIndex(f=>f.telemetry.diagnostic_code==='P0301'));
    const s=source.getSnapshot(), c=makeJourneyIntelligenceContext(s.planning,s.frame);
    const p=c.proposals![0];
    expect(p.feasible).toBe(true);
    const decision={source:'gemma4' as const,model:'gemma-4-26b-a4b-it',priority:'critical' as const,strategy:'evaluate-first' as const,
      selectedPlanId:p.id,stationId:p.fuelStops[0].station.id,amenityId:null,diagnosticCodes:['P0301']};
    expect(validateJourneyDecision(decision,c)).toBe(true);
    expect(validateJourneyDecision({...decision,selectedPlanId:'invented'},c)).toBe(false);
    expect(compactJourneyFacts(c).alternatives.some(a=>a.proposal)).toBe(true);
    source.dispose();
  });
  it('keeps current safety warnings authoritative over a continue decision', () => {
    const source=session();source.seekTo(source.frames.findIndex(f=>f.telemetry.diagnostic_code==='P0301'));
    const s=source.getSnapshot(), c=makeJourneyIntelligenceContext(s.planning,s.frame), choices=fuelOptions(s.planning,s.frame);
    const result=navigationDecision(c,choices,{...deterministicJourneyInsight(c),source:'gemma4',strategy:'monitor'});
    expect(result.kind).toBe('vehicle-warning');
    const critical={...c,frame:{...c.frame,telemetry:{...c.frame.telemetry,coolant_temp_f:245}}};
    expect(navigationDecision(critical,choices,deterministicJourneyInsight(critical)).kind).toBe('stop-safely');
    source.dispose();
  });
  it('generates fictional truck-stop coordinates on all supported directed cached routes', () => {
    const source=session();
    for(const a of DEMO_LOCATIONS)for(const b of DEMO_LOCATIONS)if(a.id!==b.id){
      const planning=resolveJourneyContext({journeys:[{originId:a.id,destinationId:b.id,elapsedSeconds:0}]}).journey;
      expect(planning.plan.baseRoute.provenance).toBe('cached-road');
      const stations=planning.fuel.recommendation.assessments.map(a=>a.station);
      expect(stations.every(s=>s.isSynthetic&&Number.isFinite(s.latitude)&&Number.isFinite(s.longitude))).toBe(true);
    }
    const s=source.getSnapshot(), cropped=remainingRoad(s.planning.requested.baseRoute,10);
    expect(cropped.cumulativeMiles[0]).toBe(0);
    expect(cropped.distanceMiles).toBeCloseTo(s.planning.requested.baseRoute.distanceMiles-10);
    source.dispose();
  });
});
