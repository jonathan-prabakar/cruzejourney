import { isNonnegativeFinite } from '../fuel/range';
import { calculateFuelIntelligence } from '../fuel/intelligence';
import { validateDataset } from '../telemetry/validator';
import { IntelligenceError } from './errors';
import type { CoolantStatus, DiagnosticFinding, EvidenceFact, PreparedContext, VehicleIntelligenceContext } from './types';

export const MAX_CONTEXT_BYTES = 100000;
export const MAX_HISTORY = 120;
export const MAX_STATIONS = 30;
/** Demo thresholds only, not a manufacturer-specific diagnosis. */
export function getCoolantStatus(temp: number | null): CoolantStatus {
  return temp === null || !Number.isFinite(temp) ? 'unknown' : temp >= 240 ? 'critical' : temp >= 225 ? 'elevated' : 'normal';
}
export function prepareIntelligenceContext(input: VehicleIntelligenceContext): PreparedContext {
  // Size bound before copying, sorting or building the prompt. JSON-boundary data only.
  let json: string;
  try { json = JSON.stringify(input); } catch { throw new IntelligenceError('INVALID_CONTEXT'); }
  if (!json || new TextEncoder().encode(json).length > MAX_CONTEXT_BYTES ||
      !input || !Array.isArray(input.history) || input.history.length > MAX_HISTORY ||
      !Array.isArray(input.stations) || input.stations.length > MAX_STATIONS ||
      typeof input.demoMode !== 'boolean' || !input.vehicle || !input.route ||
      (input.recentInsights?.length ?? 0) > 6) throw new IntelligenceError('INVALID_CONTEXT');
  if (![input.route.currentDistanceAlongRouteMiles, input.route.remainingRouteMiles]
      .every(v => v === null || isNonnegativeFinite(v)) ||
      !['simulated', 'verified', 'unknown'].includes(input.route.distanceSource) ||
      (input.diagnostics !== undefined && (!input.diagnostics || typeof input.diagnostics.available !== 'boolean')) ||
      (input.recentInsights !== undefined && !Array.isArray(input.recentInsights))) throw new IntelligenceError('INVALID_CONTEXT');
  const metadata = {
    name: 'Intelligence context validation', source: 'Application context', synthetic: input.demoMode,
    route: 'Caller-supplied route', limitations: [], vehicle: input.vehicle,
  };
  const current = validateDataset({ metadata, records: input.telemetry === null ? [] : [input.telemetry] });
  const recent = validateDataset({ metadata, records: input.history });
  if (!current.valid || !recent.valid) throw new IntelligenceError('INVALID_CONTEXT');
  const telemetry = current.records[0] ?? null;
  const time = telemetry ? Date.parse(telemetry.timestamp) : -Infinity;
  // Seeking backwards must not leak future measurements, events, or AI advice into the snapshot.
  const history = recent.records.filter(row => Date.parse(row.timestamp) <= time);
  const observedCodes = [...new Set([...history, ...(telemetry ? [telemetry] : [])]
    .flatMap(row => row.diagnostic_code ? [row.diagnostic_code] : []))].sort();
  const activeCodes = telemetry?.diagnostic_code ? [telemetry.diagnostic_code] : [];
  let diagnosticFindings: DiagnosticFinding[] = [];
  if (input.diagnostics?.available) {
    if (!Array.isArray(input.diagnostics.findings) || input.diagnostics.findings.length > 16) throw new IntelligenceError('INVALID_CONTEXT');
    diagnosticFindings = input.diagnostics.findings.filter(f => {
      if (!f || typeof f.code !== 'string' || typeof f.description !== 'string' || f.description.length > 300 ||
          !['info', 'warning', 'critical'].includes(f.severity)) throw new IntelligenceError('INVALID_CONTEXT');
      return observedCodes.includes(f.code);
    }).map(f => ({ ...f }));
  }
  let efficiency = input.efficiency ? structuredClone(input.efficiency) : null;
  if (efficiency) {
    if (!['normal', 'concern', 'critical', 'unknown'].includes(efficiency.status) ||
        !Array.isArray(efficiency.metrics) || efficiency.metrics.length > 12 ||
        efficiency.metrics.some(m => !m || typeof m.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(m.id) || m.id === 'status' ||
          typeof m.label !== 'string' || m.label.length > 100 || !Number.isFinite(m.value) ||
          !['mpg', 'mph', 'mph/s', 'gallons', 'percent'].includes(m.unit)) ||
        new Set(efficiency.metrics.map(m => m.id)).size !== efficiency.metrics.length) throw new IntelligenceError('INVALID_CONTEXT');
    if (!efficiency.metrics.length || efficiency.status === 'unknown') efficiency = null;
  }
  const fuel = calculateFuelIntelligence({
    telemetry, vehicle: input.vehicle, route: input.route, stations: input.stations,
    requiredFuelType: input.requiredFuelType, config: input.fuelConfig,
  });
  const reachableStations = [fuel.recommendation.recommended, ...fuel.recommendation.alternatives]
    .filter((s): s is NonNullable<typeof s> => s !== null && s.reachability.status === 'REACHABLE');
  // Scope model actions to reviewed itineraries; M3's full calculation stays unchanged.
  const reviewed = input.journey ? (input.journey.progressMiles > 0 ? [input.journey.current, ...input.journey.alternatives.filter(p => p.proposal)]
    : [input.journey.current, ...input.journey.alternatives]).filter(p => p.feasible) : null;
  const eligibleStations = reviewed ? reachableStations.filter(s => reviewed.some(p => p.stationIds.includes(s.station.id))) : reachableStations;
  const facts: EvidenceFact[] = [];
  const add = (id: string, domain: EvidenceFact['domain'], text: string, value?: number, unit?: string) => {
    facts.push({ id, domain, text, ...(value === undefined ? {} : { value, unit }) });
  };
  const measurement = (id: string, domain: EvidenceFact['domain'], label: string, value: number | null, unit: string) => {
    if (value !== null && Number.isFinite(value)) add(id, domain, label + ': ' + value.toFixed(2) + ' ' + unit + '.', value, unit);
  };
  measurement('fuel.percent', 'fuel', 'Fuel remaining', telemetry?.fuel_percent ?? null, '%');
  measurement('fuel.gallons', 'fuel', 'Fuel remaining', fuel.fuel.remainingGallons, 'US gal');
  measurement('fuel.raw_range', 'fuel', 'Raw estimated range', fuel.fuel.estimatedRangeMiles, 'mi');
  measurement('fuel.usable_range', 'fuel', 'Usable planning range', fuel.fuel.usableRangeMiles, 'mi');
  measurement('fuel.reserve', 'fuel', 'Reserve of total tank capacity', fuel.fuel.reservePercent, '%');
  measurement('fuel.planning_mpg', 'fuel', 'Assumed planning economy', fuel.fuel.planningMpg, 'MPG');
  if (input.route.distanceSource !== 'unknown') measurement('route.remaining', 'route', 'Remaining modeled route', input.route.remainingRouteMiles, 'mi');
  add('fuel.status', 'fuel', 'Fuel status: ' + fuel.status.fuelStatus + '; route safety: ' + fuel.status.routeSafety + '.');
  if (!fuel.fuel.valid || fuel.status.level === 'UNKNOWN') add('data.unknown', 'capability', 'Required fuel or route data is missing or invalid.');
  for (const s of eligibleStations) {
    add('station.' + s.station.id, 'station', s.explanation);
  }
  for (const code of observedCodes) {
    const finding = diagnosticFindings.find(f => f.code === code);
    add('diagnostic.' + code, 'diagnostic', 'Observed code ' + code + (activeCodes.includes(code) ? ' is present in the current reading.' : ' occurred in recent history; it is not currently present.') +
      (finding ? ' Adapter description: ' + finding.description + '; supplied severity: ' + finding.severity + '.' : ' No diagnostic interpretation finding is available; cause and severity are not confirmed.'));
  }
  measurement('telemetry.rpm', 'telemetry', 'Observed engine speed', telemetry?.rpm ?? null, 'RPM');
  measurement('telemetry.speed', 'telemetry', 'Observed vehicle speed', telemetry?.speed_mph ?? null, 'MPH');
  measurement('coolant.temperature', 'coolant', 'Observed coolant temperature', telemetry?.coolant_temp_f ?? null, 'F');
  const coolantStatus = getCoolantStatus(telemetry?.coolant_temp_f ?? null);
  if (coolantStatus === 'elevated' || coolantStatus === 'critical') add('coolant.status', 'coolant', 'Coolant status: ' + coolantStatus + ' under demonstration thresholds (elevated 225 F, critical 240 F); not a manufacturer diagnosis.');
  if (efficiency) {
    add('efficiency.status', 'efficiency', 'Supplied efficiency status: ' + efficiency.status + '.');
    efficiency.metrics.forEach(m => measurement('efficiency.' + m.id, 'efficiency', m.label, m.value, m.unit));
  }
  const capabilities = { diagnostics: input.diagnostics?.available ? 'adapter' as const : 'observations-only' as const, efficiency: efficiency ? 'available' as const : 'unavailable' as const };
  const limitations = [
    'Decision support only; no vehicle control, confirmed mechanical diagnosis, or guaranteed arrival.',
    'Range uses configured/profile MPG and an explicit reserve; future economy can differ.',
    'Initial city routes are cached; station reroutes use public OSRM. Station prices are official-page snapshots, not a live feed.',
    ...(input.demoMode ? ['Dataset demo mode: telemetry is synthetic.'] : []),
    ...(input.stations.some(s => !s.isSynthetic) ? ['Official Love\'s station pages list diesel, truck parking and DEF lanes. Current pump status and fuel stock are not live-verified; the general driving route does not account for truck dimensions or restrictions.'] : []),
    ...(input.stations.some(s => s.isSynthetic || s.priceSource === 'sample') ? ['Stations or prices include fictional demonstration values.'] : []),
    ...(capabilities.diagnostics === 'observations-only' ? ['M4 diagnostic adapter is unavailable; raw code observations only.'] : []),
    ...(!efficiency ? ['M5 efficiency capability is unavailable; no efficiency findings are invented.'] : []),
  ];
  let diagnosticEpisode: string | null = null;
  if (telemetry?.diagnostic_code) {
    const rows = [...history.filter(r => r.timestamp !== telemetry.timestamp), telemetry]
      .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
    let i = rows.length - 1;
    while (i > 0 && rows[i - 1].diagnostic_code === telemetry.diagnostic_code) i--;
    // An onset outside the bounded history is unknown, not a new episode each tick.
    diagnosticEpisode = telemetry.diagnostic_code + ':' + (i > 0 ? rows[i].timestamp : 'continuing');
  }
  return {
    vehicle: { name: input.vehicle.name, tank_capacity_gallons: input.vehicle.tank_capacity_gallons, typical_mpg: input.vehicle.typical_mpg },
    ...(input.journey ? { journey: structuredClone(input.journey) } : {}),
    telemetry, history, fuel, eligibleStations, observedCodes, activeCodes, diagnosticFindings,
    diagnosticEpisode, coolantStatus, efficiency, facts, capabilities, limitations, demoMode: input.demoMode,
    recentInsightIds: (input.recentInsights ?? []).filter(i => typeof i.id === 'string').map(i => i.id.slice(0, 80)),
  };
}
