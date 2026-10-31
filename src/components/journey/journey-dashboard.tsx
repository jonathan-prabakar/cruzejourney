"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Activity, ArrowDown, ArrowUp, ArrowRight, ArrowUpDown, Check, Coffee, Fuel, MapPin, Pause, Play, Plus, RotateCcw, Route, Sparkles, TriangleAlert, Trash2, Utensils } from 'lucide-react';
import { useJourneySimulation } from '@/hooks/useJourneySimulation';
import { buildCuratedRoute, curatedRouteProvider, requestJourneyRoute, validateEndpoints } from '@/lib/journey/routes';
import { calculateJourneyPlan, DEFAULT_PREFERENCES, evaluateItinerary } from '@/lib/journey/planner';
import { JourneyIntelligenceCoordinator, deterministicJourneyInsight, makeJourneyIntelligenceContext } from '@/lib/journey/intelligence';
import { SIMULATION_TIME_FACTOR, rawDiagnosticAdapter } from '@/lib/journey/simulation';
import type { AmenityCategory, JourneyIntelligenceAdapter, JourneyPreferences, JourneyWaypoint, SimulationScenario, DiagnosticsAdapter } from '@/lib/journey/types';
import LocationField, { type LocationSelection } from './location-field';
import JourneyMap from './journey-map';

const initialRoute = buildCuratedRoute('san-antonio', 'austin');
const minutes = (seconds: number) => Math.ceil(seconds / 60);
const money = (value: number | null) => value === null ? 'Unknown' : '$' + value.toFixed(2);
const categories: { id: AmenityCategory; label: string }[] = [
  { id: 'restaurant', label: 'Restaurants' }, { id: 'restroom', label: 'Restrooms' },
  { id: 'coffee', label: 'Coffee' }, { id: 'convenience', label: 'Convenience stores' },
];
const scenarios: { id: SimulationScenario; label: string }[] = [
  { id: 'normal', label: 'Normal journey' }, { id: 'low-fuel', label: 'Low fuel' },
  { id: 'engine-warning', label: 'Engine warning' }, { id: 'combined', label: 'Combined conditions' },
];
export default function JourneyDashboard({ intelligenceAdapter = null, diagnosticsAdapter = rawDiagnosticAdapter }: {
  intelligenceAdapter?: JourneyIntelligenceAdapter | null; diagnosticsAdapter?: DiagnosticsAdapter;
}) {
  const [origin, setOrigin] = useState<LocationSelection>({ id: 'san-antonio', text: 'San Antonio' });
  const [destination, setDestination] = useState<LocationSelection>({ id: 'austin', text: 'Austin' });
  const [draft, setDraft] = useState<JourneyPreferences>(DEFAULT_PREFERENCES);
  const [applied, setApplied] = useState({ route: initialRoute, preferences: DEFAULT_PREFERENCES });
  const [manual, setManual] = useState<JourneyWaypoint[] | undefined>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [epoch, setEpoch] = useState(0);
  const [tab, setTab] = useState<'itinerary' | 'alternatives'>('itinerary');
  const request = useRef<AbortController | null>(null);
  const planning = useMemo(() => calculateJourneyPlan({ ...applied, waypoints: manual }), [applied, manual]);
  const plan = planning.requested;
  const simulation = useJourneySimulation(plan);
  const { frame, playback, controls, frames } = simulation;
  const context = useMemo(() => makeJourneyIntelligenceContext(planning, frame, diagnosticsAdapter), [planning, frame, diagnosticsAdapter]);
  const coordinator = useMemo(() => new JourneyIntelligenceCoordinator(intelligenceAdapter), [intelligenceAdapter]);
  const generated = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, () => null);
  const insight = generated ?? deterministicJourneyInsight(context);
  useEffect(() => { coordinator.update(context, epoch); }, [coordinator, context, epoch]);
  useEffect(() => () => { coordinator.invalidate(); }, [coordinator]);
  useEffect(() => () => request.current?.abort(), []);
  const playing = playback.status === 'playing';
  const dirty = origin.id !== applied.route.origin.id || destination.id !== applied.route.destination.id || JSON.stringify(draft) !== JSON.stringify(applied.preferences);
  const selectedStation = planning.stations.find(s => s.id === selectedStationId) ?? plan.fuelStops[0]?.station ?? planning.stations[0];
  const shownAmenities = context.amenities.filter(a => a.stationId === selectedStation?.id && applied.preferences.amenities.includes(a.category));
  const position = (w: JourneyWaypoint) => (w.kind === 'fuel' ? planning.stations.find(s => s.id === w.id)?.distanceAlongRouteMiles : planning.amenities.find(a => a.id === w.id)?.distanceAlongRouteMiles) ?? Infinity;
  const edit = (next: JourneyWaypoint[], sort = false) => {
    controls.pause(); coordinator.invalidate(); setEpoch(e => e + 1);
    setManual(sort ? [...next].sort((a, b) => position(a) - position(b) || (a.kind === 'fuel' ? -1 : 1)) : next);
  };
  const planJourney = async () => {
    const invalid = validateEndpoints(origin.id, destination.id);
    if (invalid) { setError(invalid); return; }
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    setLoading(true); setError(''); controls.pause();
    try {
      const route = await requestJourneyRoute(curatedRouteProvider, origin.id, destination.id, abort.signal);
      if (abort.signal.aborted) return;
      coordinator.invalidate(); setApplied({ route, preferences: structuredClone(draft) }); setManual(undefined);
      setSelectedStationId(null); setEpoch(e => e + 1); setTab('itinerary');
    } catch { if (!abort.signal.aborted) setError('This route could not be loaded. Choose a supported corridor pair and try again.'); }
    finally { if (!abort.signal.aborted) setLoading(false); }
  };
  const chooseScenario = (scenario: SimulationScenario) => {
    const low = scenario === 'low-fuel' || scenario === 'combined';
    const percent = low ? Math.max(10.5, Math.min(17, 10 + applied.route.distanceMiles / (120 * 7.5) * 100 * 0.45)) : 60;
    setDraft(p => ({ ...p, scenario, startingFuelPercent: Math.round(percent * 2) / 2 }));
  };
  const waypointName = (w: JourneyWaypoint) => planning.stations.find(s => s.id === w.id)?.name ?? planning.amenities.find(a => a.id === w.id)?.name ?? 'Unknown waypoint';
  const showRecommended = planning.recommended && planning.recommended.id !== plan.id;
  const reset = () => { coordinator.invalidate(); setEpoch(e => e + 1); controls.reset(); };
  const seek = (index: number) => { coordinator.invalidate(); setEpoch(e => e + 1); controls.seekTo(index); };
  return <div className="jp-shell" data-playback-ready={simulation.connected}>
    <a href="#journey-content" className="skip-link">Skip to journey planner</a>
    <header className="jp-header">
      <Link href="/" aria-label="Cruze FuelSense cockpit"><Image src="/brand/logo-horizontal-color.svg" width={720} height={200} alt="Cruze FuelSense" className="hud-brand" priority/></Link>
      <nav aria-label="Dashboard views"><Link href="/">Cockpit</Link><Link href="/journey" aria-current="page">Journey planner</Link></nav>
      <span className="jp-demo"><i/> DATASET DEMO MODE</span>
    </header>
    <main id="journey-content" className="jp-workspace">
      <aside className="jp-planner" aria-label="Journey planning controls">
        <div className="jp-planner-fields">
        <div className="jp-panel-heading"><span className="jp-eyebrow">MAKE THE NEXT MILE COUNT</span><h1>Your journey<span>.</span></h1><p>A thoughtful route. A confident fuel plan.</p></div>
        <div className="jp-endpoints">
          <LocationField label="Point A · Starting location" value={origin} onChange={setOrigin}/>
          <button className="jp-swap" aria-label="Swap origin and destination" onClick={() => { setOrigin(destination); setDestination(origin); }}><ArrowUpDown size={15}/></button>
          <LocationField label="Point B · Destination" value={destination} onChange={setDestination}/>
        </div>
        <p className="jp-note"><MapPin size={12}/> Five curated Texas cities · no arbitrary-address geocoding</p>
        <div className="jp-divider"/>
        <label className="jp-field-heading" htmlFor="starting-fuel"><span><Fuel size={15}/> Starting fuel</span><strong>{draft.startingFuelPercent}%</strong></label>
        <input id="starting-fuel" aria-label="Starting fuel percentage" type="range" min="5" max="100" step=".5" value={draft.startingFuelPercent}
          onChange={e => setDraft(p => ({ ...p, startingFuelPercent: Number(e.target.value) }))}/>
        <div className="jp-range-labels"><span>5%</span><span>120 US gal tank · 10% reserve</span><span>100%</span></div>
        <label className="jp-field">Fuel-stop preference<select value={draft.fuelStops} onChange={e => setDraft(p => ({ ...p, fuelStops: e.target.value as JourneyPreferences['fuelStops'] }))}>
          <option value="automatic">Automatic · fewest feasible stops</option><option value="none">Prefer no stops</option><option value="one">Prefer one stop</option><option value="two">Prefer two stops</option><option value="three">Prefer three stops</option>
        </select></label>
        <label className="jp-field">Route priority<select value={draft.optimization} onChange={e => setDraft(p => ({ ...p, optimization: e.target.value as JourneyPreferences['optimization'] }))}>
          <option value="balanced">Balanced</option><option value="fastest">Fastest</option><option value="fuel-cost">Lowest modeled purchase cost</option><option value="fewer-stops">Fewer stops</option>
        </select><small>Modeled stop comparison, not global route optimization</small></label>
        <fieldset className="jp-amenity-preferences"><legend>Make room for a break</legend>
          {categories.map(c => <label key={c.id}><input type="checkbox" checked={draft.amenities.includes(c.id)}
            onChange={e => setDraft(p => ({ ...p, amenities: e.target.checked ? [...p.amenities, c.id] : p.amenities.filter(a => a !== c.id) }))}/>{c.label}</label>)}
        </fieldset>
        <label className="jp-field">Simulation scenario<select value={draft.scenario} onChange={e => chooseScenario(e.target.value as SimulationScenario)}>
          {scenarios.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select><small>Scenario applies a fuel preset; your slider value takes precedence.</small></label>
        </div><div className="jp-planner-actions">
        <button className="jp-primary" onClick={planJourney} disabled={loading || playing}>{loading ? 'Planning…' : 'Plan journey'}<ArrowRight size={17}/></button>
        {dirty && <p className="jp-dirty">Settings changed. Plan journey to apply them.</p>}
        {error && <p role="alert" className="jp-error">{error}</p>}
        <div className="jp-vehicle"><span className="jp-vehicle-icon"><Route size={19}/></span><div><strong>Demo Freight Truck</strong><p>8 MPG typical · 7.5 MPG planning</p></div></div>
        </div>
      </aside>

      <section className="jp-center" aria-label="Journey preview and simulation">
        <JourneyMap key={plan.id} plan={plan} stations={planning.stations} amenities={planning.amenities} frame={frame} selectedStationId={selectedStation?.id ?? null} onStation={setSelectedStationId}/>
        <div className="jp-review">
          <div className="jp-review-heading"><div><span className="jp-eyebrow">REVIEW YOUR JOURNEY</span><h2>{plan.feasible ? 'Ready for the road ahead' : 'This itinerary needs a change'}</h2></div>
            <span className={'jp-status ' + (plan.feasible ? 'safe' : 'unsafe')}>{plan.feasible ? <Check size={13}/> : <TriangleAlert size={13}/>} {plan.feasible ? 'Modeled feasible' : 'Not feasible'}</span></div>
          <div className="jp-trip-metrics">
            <div><strong data-testid="trip-distance">{plan.totalDistanceMiles.toFixed(1)}<small> mi</small></strong><span>Total route + access</span></div>
            <div><strong>{minutes(plan.durationSeconds)}<small> min</small></strong><span>Cached drive + modeled stops</span></div>
            <div><strong>{plan.estimatedConsumptionGallons?.toFixed(1) ?? '—'}<small> gal</small></strong><span>Estimated consumption</span></div>
            <div><strong data-testid="arrival-fuel">{plan.arrivalFuelPercent?.toFixed(1) ?? '—'}<small>%</small></strong><span>Estimated arrival fuel</span></div>
          </div>
          <div className="jp-cost-row"><span>Modeled fuel purchases <b>{money(plan.purchaseCost)}</b></span><span>{plan.fuelStops.length} refill stop(s) · {plan.fuelAddedGallons.toFixed(1)} gal added</span></div>
          <p className="jp-note">Purchases exclude fuel already in the tank. Dated official diesel prices, modeled full refill to 100%; arrival is not guaranteed.</p>
          <p className="jp-planning-reason">{planning.preferenceExplanation}</p>
          {plan.warnings.map((warning, i) => <p role="alert" className="jp-error" key={i}><TriangleAlert size={14}/>{warning}</p>)}
          {showRecommended && <div className="jp-comparison"><p><strong>Recommended feasible alternative</strong><br/>
            {planning.recommended!.fuelStops.length} refill stop(s) · {planning.recommended!.totalDistanceMiles.toFixed(1)} mi · {planning.recommended!.arrivalFuelPercent!.toFixed(1)}% estimated arrival · {money(planning.recommended!.purchaseCost)} modeled purchases</p>
            <button className="jp-primary" disabled={playing} onClick={() => edit(planning.recommended!.waypoints)}>{plan.feasible ? 'Review recommended plan' : 'Use recommended feasible plan'}<ArrowRight size={16}/></button></div>}
          <div className="jp-tabs" role="tablist" aria-label="Journey review views">
            <button role="tab" aria-selected={tab === 'itinerary'} onClick={() => setTab('itinerary')}>Your itinerary <span>{plan.waypoints.length}</span></button>
            <button role="tab" aria-selected={tab === 'alternatives'} onClick={() => setTab('alternatives')}>Compare fuel options</button>
          </div>
          {tab === 'itinerary' ? <div className="jp-itinerary" role="tabpanel" aria-label="Your itinerary">
            <div className="jp-endpoint-row"><span className="jp-stop-dot"/><strong>{plan.route.origin.name}</strong><small>Start · {plan.preferences.startingFuelPercent}% fuel</small></div>
            {plan.waypoints.map((w, i) => <div className="jp-stop-row" key={w.id}>
              <span className={'jp-stop-icon ' + w.kind}>{w.kind === 'fuel' ? <Fuel size={16}/> : <Utensils size={16}/>}</span>
              <div><button className="jp-stop-name" onClick={() => setSelectedStationId(w.kind === 'fuel' ? w.id : planning.amenities.find(a => a.id === w.id)?.stationId ?? null)}>{waypointName(w)}</button>
                <p>{w.kind === 'fuel' ? 'Verified truck stop · modeled full refill' : 'Amenity waypoint'} · modeled access</p>
                {w.kind === 'fuel' && <label className="jp-replace">Change stop<select aria-label={'Replace fuel stop ' + (i + 1)} value={w.id} disabled={playing}
                  onChange={e => edit(plan.waypoints.map((p, index) => index === i ? { ...p, id: e.target.value } : p), true)}>
                  {planning.stations.filter(s => s.fuelTypes.includes('diesel') && s.isAvailable && s.detourMiles !== null).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>}
              </div>
              <div className="jp-stop-actions"><button disabled={playing || i === 0} aria-label={'Move stop ' + (i + 1) + ' earlier'} onClick={() => { const next = [...plan.waypoints]; [next[i - 1], next[i]] = [next[i], next[i - 1]]; edit(next); }}><ArrowUp size={14}/></button>
                <button disabled={playing || i === plan.waypoints.length - 1} aria-label={'Move stop ' + (i + 1) + ' later'} onClick={() => { const next = [...plan.waypoints]; [next[i], next[i + 1]] = [next[i + 1], next[i]]; edit(next); }}><ArrowDown size={14}/></button>
                <button disabled={playing} aria-label={'Remove ' + waypointName(w)} onClick={() => edit(plan.waypoints.filter(p => p.id !== w.id))}><Trash2 size={14}/></button></div>
            </div>)}
            <div className="jp-endpoint-row"><span className="jp-stop-dot destination"/><strong>{plan.route.destination.name}</strong><small>Destination · {plan.arrivalFuelPercent?.toFixed(1) ?? 'unknown'}% estimated fuel</small></div>
            <p className="jp-note">Pause to edit. Editing restarts the simulation. A backward stop order is flagged, never silently rerouted.</p>
          </div> : <div className="jp-alternatives" role="tabpanel" aria-label="Fuel alternatives">
            {planning.alternatives.filter(p => p.id !== plan.id).map(alternative => <button key={alternative.id} disabled={playing} onClick={() => edit(alternative.waypoints)}>
              <Fuel size={17}/><span><strong>{alternative.fuelStops.map(s => s.station.name).join(' → ') || 'No fuel stops required'}</strong>
                <small>{alternative.totalDistanceMiles.toFixed(1)} mi · {minutes(alternative.durationSeconds)} min · {alternative.arrivalFuelPercent!.toFixed(1)}% arrival</small></span><b>{money(alternative.purchaseCost)}</b>
            </button>)}
            {!planning.alternatives.length && <p>No additional feasible plans under these assumptions.</p>}
          </div>}
        </div>
        <div className="jp-playback" aria-label="Journey simulation controls">
          <button className="jp-play" aria-label={playing ? 'Pause simulation' : playback.status === 'paused' ? 'Resume simulation' : 'Start simulation'} disabled={!plan.feasible || !simulation.connected || playback.status === 'ended'}
            onClick={() => { if (playing) controls.pause(); else { setEpoch(e => e + 1); controls.play(); } }}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
          <button aria-label="Reset simulation" disabled={!plan.feasible} onClick={reset}><RotateCcw size={16}/></button>
          <div className="jp-seek"><label htmlFor="journey-seek"><span>{playback.status === 'paused' ? 'Paused · ' : ''}{frame.phase.replace('-', ' ')} · {Math.floor(frame.elapsedSeconds / 60)} simulated min</span><span>{Math.round(playback.progress * 100)}%</span></label>
            <input id="journey-seek" aria-label="Seek journey simulation" type="range" min="0" max={Math.max(0, frames.length - 1)} value={Math.max(0, playback.index)} disabled={!plan.feasible} onChange={e => seek(Number(e.target.value))}/></div>
          <label className="jp-speed"><span>Playback</span><select aria-label="Simulation playback speed" value={playback.speed} onChange={e => controls.setPlaybackSpeed(Number(e.target.value) as 1 | 2 | 5)}>
            <option value="1">1×</option><option value="2">2×</option><option value="5">5×</option></select></label>
        </div>
        <p className="jp-clock-note">Simulation clock: {SIMULATION_TIME_FACTOR} simulated seconds per real second at 1×. No live vehicle is connected.</p>
      </section>

      <aside className="jp-intelligence" aria-label="Vehicle and journey intelligence">
        <div className="jp-panel-heading"><span className="jp-eyebrow"><Sparkles size={13}/> VEHICLE INTELLIGENCE</span><h2>Ahead of the curve.</h2><p>Important signals. One clear next step.</p></div>
        <div className={'jp-ai-card ' + insight.priority}><div className="jp-card-label"><Sparkles size={16}/><span>{insight.source === 'gemma4' ? 'GEMMA ACTIVE' : 'DETERMINISTIC FALLBACK'}</span></div>
          <h3>{insight.title}</h3><p>{insight.explanation}</p><div className="jp-next-action"><span>NEXT ACTION</span><p>{insight.action}</p></div>
          <button className="jp-text-button" onClick={() => coordinator.update(context, epoch, true)}>Reassess journey <ArrowRight size={13}/></button>
          {!intelligenceAdapter && <small>Gemma is not connected. This planner uses deterministic fallback and sends no AI requests.</small>}
        </div>
        <div className={'jp-signal ' + (context.fuel.status.severity === 'critical' ? 'critical' : '')}><Fuel size={17}/><div><strong>{context.fuel.status.title}</strong><p>{context.fuel.status.explanation}</p><small>{context.fuel.fuel.usableRangeMiles?.toFixed(1) ?? '—'} usable mi · 10% reserve</small></div></div>
        <div className={'jp-signal ' + (context.diagnostics.length ? 'warning' : '')}><Activity size={17}/><div><strong>{context.diagnostics.length ? 'P0301 observed in simulation' : 'No simulated diagnostic code'}</strong>
          <p>{context.diagnostics[0]?.description ?? 'Engine-warning mode introduces a mid-trip code; combined mode introduces it before the first refill.'}</p></div></div>
        <section className="jp-stop-inspection" aria-label="Stop and amenities">
          <div className="jp-card-label"><Coffee size={15}/><span>A STOP WORTH MAKING</span></div>
          {selectedStation ? <><h3>{selectedStation.name}</h3><p>Verified truck stop · {selectedStation.distanceAlongRouteMiles!.toFixed(1)} base-route mi</p>
            <div className="jp-inspection-values"><span><strong>{money(selectedStation.pricePerGallon)}</strong><small>Auto Diesel / US gal · {selectedStation.priceVerifiedAt}</small></span><span><strong>{selectedStation.detourMiles?.toFixed(1) ?? '—'} mi</strong><small>estimated access loop</small></span></div>
            {selectedStation.sourceUrl && <a className="jp-text-button" href={selectedStation.sourceUrl} target="_blank" rel="noreferrer">Official truck-stop details and current prices</a>}
            {(() => {
              const exists = plan.waypoints.some(w => w.id === selectedStation.id);
              const next = [...plan.waypoints, { id: selectedStation.id, kind: 'fuel' as const }].sort((a, b) => position(a) - position(b));
              const allowed = !exists && evaluateItinerary(applied, next).feasible;
              return <button className="jp-outline" disabled={playing || !allowed} onClick={() => edit(next)}>
                {exists ? <Check size={14}/> : <Plus size={14}/>} {exists ? 'Included in your itinerary' : allowed ? 'Add feasible fuel stop' : 'Not a feasible additional fuel stop'}
              </button>;
            })()}
            <p className="jp-note">Only compatible, available stops with known modeled access can be added.</p>
            <div className="jp-amenity-list">{shownAmenities.map(a => {
              const exists = plan.waypoints.some(w => w.id === a.id);
              return <div key={a.id}><span>{a.category === 'restaurant' ? <Utensils size={15}/> : <Coffee size={15}/>}</span><div><strong>{a.name}</strong><p>Fictional {a.category} · +{a.extraDistanceMiles.toFixed(2)} modeled mi</p><small>Hours, ratings and walking time unavailable</small></div>
                <button aria-label={(exists ? 'Remove ' : 'Add ') + a.name} disabled={playing} onClick={() => edit(exists ? plan.waypoints.filter(w => w.id !== a.id) : [...plan.waypoints, { id: a.id, kind: 'amenity' }], true)}>{exists ? <Check size={15}/> : <Plus size={15}/>}</button></div>;
            })}{!shownAmenities.length && <p>No verified amenity data is available at this stop.</p>}</div>
          </> : <p>No station in this corridor segment. Increase starting fuel if the destination is not reachable.</p>}
        </section>
      </aside>
    </main>
    <footer className="jp-telemetry" aria-label="Live simulation telemetry">
      <div className="jp-speed-reading"><span>SIMULATED SPEED</span><strong data-testid="vehicle-speed">{frame.telemetry.speed_mph.toFixed(0)}<small> MPH</small></strong></div>
      <div><span>ENGINE RPM</span><strong>{frame.telemetry.rpm.toLocaleString('en-US')}<small> rpm</small></strong></div>
      <div><span>ECONOMY</span><strong>{frame.telemetry.mpg.toFixed(1)}<small> MPG</small></strong></div>
      <div><span>FUEL REMAINING</span><strong data-testid="vehicle-fuel">{frame.telemetry.fuel_percent.toFixed(1)}<small>%</small></strong></div>
      <div><span>USABLE RANGE</span><strong>{context.fuel.fuel.usableRangeMiles?.toFixed(1) ?? '—'}<small> mi</small></strong></div>
      <div><span>DISTANCE TRAVELED</span><strong data-testid="vehicle-distance">{frame.distanceMiles.toFixed(1)}<small> / {plan.totalDistanceMiles.toFixed(1)} mi</small></strong></div>
      <div><span>SIMULATED PURCHASES</span><strong>{money(frame.purchaseCost)}</strong><small>{frame.fuelAddedGallons.toFixed(1)} gal added</small></div>
    </footer>
  </div>;
}
