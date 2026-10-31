"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Activity, ArrowRight, ArrowUpDown, Fuel, Pause, Play, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react';
import { useConnectedVehicle } from '@/components/connected-vehicle-provider';
import { useJourneyGemma } from '@/hooks/useJourneyGemma';
import { JourneyIntelligenceCoordinator, deterministicJourneyInsight, makeJourneyIntelligenceContext } from '@/lib/journey/intelligence';
import { vehicleDiagnosticsAdapter } from '@/lib/journey/diagnostics-adapter';
import { milesBetween } from '@/lib/journey/geometry';
import { validateEndpoints } from '@/lib/journey/routes';
import LocationField, { type LocationSelection } from './location-field';
import JourneyMap from './journey-map';

const money = (value: number | null) => value === null ? 'Unavailable' : '$' + value.toFixed(2);
export default function JourneyDashboard({ demoPlayback = true }: { demoPlayback?: boolean }) {
  const vehicle = useConnectedVehicle();
  const { session, planning, frame, playback, departure } = vehicle;
  const plan = planning.requested;
  const [origin, setOrigin] = useState<LocationSelection>({ id: plan.baseRoute.origin.id, text: plan.baseRoute.origin.name });
  const [destination, setDestination] = useState<LocationSelection>({ id: plan.baseRoute.destination.id, text: plan.baseRoute.destination.name });
  const [error, setError] = useState('');
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const demo = session.demoControls;
  const gemma = useJourneyGemma(session.source === 'synthetic-demo');
  const activeAdapter = session.source === 'synthetic-demo' ? gemma.adapter : session.intelligenceAdapter ?? null;
  const context = useMemo(() => ({
    ...makeJourneyIntelligenceContext(planning, frame, vehicleDiagnosticsAdapter),
    connectedJourneys: session.getJourneySelectors(), efficiency: session.getEfficiency(),
  }), [planning, frame, session]);
  const coordinator = useMemo(() => new JourneyIntelligenceCoordinator(activeAdapter), [activeAdapter]);
  const generated = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot, () => null);
  const ai = useSyncExternalStore(coordinator.subscribe, coordinator.getState, coordinator.getState);
  const insight = generated ?? deterministicJourneyInsight(context);
  useEffect(() => { coordinator.update(context, vehicle.revision); }, [coordinator, context, vehicle.revision]);
  useEffect(() => () => coordinator.invalidate(), [coordinator]);
  const playing = playback.status === 'playing';
  const future = departure.latitude !== null && departure.longitude !== null &&
    milesBetween([departure.longitude, departure.latitude], plan.baseRoute.coordinates[0]) > 0.5;
  const efficiency = context.efficiency;
  const selected = planning.stations.find(s => s.id === selectedStationId);
  const planJourney = () => {
    const invalid = validateEndpoints(origin.id, destination.id);
    if (invalid) { setError(invalid); return; }
    try {
      coordinator.invalidate();
      session.planJourney(origin.id!, destination.id!);
      setSelectedStationId(null); setError('');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'This route is unavailable. Current vehicle readings are preserved.'); }
  };
  const seek = (index: number) => { coordinator.invalidate(); demo?.seekTo(index); };
  const reset = () => { coordinator.invalidate(); demo?.reset(); };
  const status = frame.phase === 'fuel-stop' ? 'Modeled refueling · engine off'
    : frame.phase === 'amenity-stop' ? 'Modeled stop · engine off'
    : playback.status === 'paused' ? 'Demo paused · last sensor reading retained'
    : frame.phase === 'arrived' ? 'Arrived · vehicle stationary'
    : frame.phase === 'ready' ? 'Demo ready · initial feed snapshot retained; playback has not advanced'
    : frame.phase === 'blocked' ? 'Journey blocked · do not exceed modeled range' : 'Demo vehicle traveling';
  const remainingSeconds = Math.max(0, (demo?.frames.at(-1)?.elapsedSeconds ?? plan.durationSeconds) - frame.elapsedSeconds);
  const eventText = status + (frame.phase === 'fuel-stop' ? ' · +' + frame.fuelAddedGallons.toFixed(1) + ' gal added this trip. Fuel rises only during this pump event.' : '');
  return <div className="jp-shell" data-playback-ready="true">
    <a href="#journey-content" className="skip-link">Skip to journey planner</a>
    <header className="jp-header">
      <Link href="/" aria-label="Cruze FuelSense connected vehicle"><Image src="/brand/logo-horizontal-color.svg" width={720} height={200} alt="Cruze FuelSense" className="hud-brand" priority/></Link>
      <nav aria-label="Dashboard views"><Link href="/">Vehicle</Link><Link href="/journey" aria-current="page">Journey planner</Link></nav>
      <span className="jp-demo"><i/> {session.source === 'synthetic-demo' ? 'DEMO VEHICLE FEED · NO PHYSICAL OBD DEVICE' : 'CONNECTED VEHICLE TELEMETRY'}</span>
    </header>
    <main id="journey-content" className="jp-workspace">
      <aside className="jp-planner" aria-label="Journey planning controls">
        <div className="jp-planner-fields">
          <div className="jp-panel-heading"><span className="jp-eyebrow">YOUR VEHICLE. YOUR NEXT MILE.</span><h1>Where next<span>?</span></h1><p>You choose the journey. Vehicle data does the rest.</p></div>
          <div className="jp-endpoints">
            <LocationField label="Point A · Origin" value={origin} onChange={setOrigin}/>
            <button className="jp-swap" aria-label="Swap origin and destination" onClick={() => { setOrigin(destination); setDestination(origin); }}><ArrowUpDown size={15}/></button>
            <LocationField label="Point B · Destination" value={destination} onChange={setDestination}/>
          </div>
          <p className="jp-note">Five supported Texas cities · cached road routes only</p>
          {error && <p role="alert" className="jp-error">{error}</p>}
          <div className="jp-divider"/>
          <span className="jp-eyebrow">ACTIVE VEHICLE · READ ONLY</span>
          <h3>{session.profile.name}</h3><p className="jp-note">Synthetic telemetry stands in for OBD-II/ELD. No hardware is connected.</p>
          <div className="jp-connection-fuel"><Fuel size={18}/><strong data-testid="connected-fuel">{frame.telemetry.fuel_percent.toFixed(1)}%</strong><span>current fuel</span></div>
          <p className="jp-note">{session.profile.tank_capacity_gallons} US gal tank · {session.profile.typical_mpg} MPG profile · conservative {session.planningMpg} MPG planning · {session.reservePercent}% reserve</p>
          <p className="jp-note">Location: {frame.telemetry.latitude?.toFixed(4) ?? 'unavailable'}, {frame.telemetry.longitude?.toFixed(4) ?? 'unavailable'}</p>
          <p className="jp-note">Telemetry time: {new Date(frame.telemetry.timestamp).toLocaleTimeString('en-US', { timeZone: 'America/Chicago' })} · simulated</p>
          <div className="jp-divider"/>
          <p className="jp-note">Fuel, engine state and diagnostics come from the active feed. Destination changes cannot refill the tank or clear an observed code.</p>
        </div>
        <div className="jp-plan-action"><button className="jp-primary" onClick={planJourney}>Plan Journey <ArrowRight size={17}/></button></div>
      </aside>
      <section className="jp-route-review" aria-label="Route and journey review">
        <JourneyMap plan={plan} stations={planning.stations} amenities={[]} frame={frame} selectedStationId={selectedStationId} onStation={setSelectedStationId}/>
        <div className="jp-review">
          {future && <p className="jp-future" role="status"><TriangleAlert size={15}/> Future journey: {plan.baseRoute.origin.name} differs from the vehicle location at planning time. No connecting road is modeled. Starting Demo Playback explicitly simulates departure there.</p>}
          <div className="jp-review-heading"><div><span className="jp-eyebrow">AUTOMATIC VEHICLE-AWARE PLAN</span><h2>{plan.feasible ? 'Ready for the road ahead.' : 'A safe plan needs attention.'}</h2></div><span className={'jp-status ' + (plan.feasible ? '' : 'unsafe')}>{plan.feasible ? 'Modeled feasible' : 'Not confirmed feasible'}</span></div>
          <div className="jp-trip-metrics">
            <div><strong>{plan.totalDistanceMiles.toFixed(1)}<small> mi</small></strong><span>Planned road + access</span></div>
            <div><strong>{Math.ceil(remainingSeconds / 60)}<small> min</small></strong><span>Estimated remaining · ETA {new Date(Date.parse(frame.telemetry.timestamp) + remainingSeconds * 1000).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })}</span></div>
            <div><strong data-testid="departure-fuel">{departure.fuel_percent.toFixed(1)}<small>%</small></strong><span>Fuel at departure</span></div>
            <div><strong data-testid="arrival-fuel">{plan.arrivalFuelPercent?.toFixed(1) ?? '—'}<small>%</small></strong><span>Estimated arrival fuel</span></div>
          </div>
          <p className="jp-planning-reason" data-testid="automatic-fuel-plan">{!plan.feasible ? 'No confirmed feasible fuel plan. Arrange assistance; do not travel beyond modeled usable range.'
            : !plan.fuelStops.length ? 'Destination is reachable with the modeled reserve. No fuel purchase is needed.'
            : 'Fuel is required en route. Reachable stops are selected automatically; purchases cover the remaining route, reserve and a 1-gallon buffer.'}</p>
          {plan.warnings.map((warning, index) => <p key={index} className="jp-error" role="alert">{warning.replace('Increase starting fuel', 'Arrange refueling or assistance')}</p>)}
          <div className="jp-cost-row"><span>Estimated trip fuel purchase <b>{money(plan.purchaseCost)}</b></span><span>{plan.fuelAddedGallons.toFixed(1)} estimated gal · {plan.fuelStops.length} planned fuel stop(s)</span></div>
          <div className="jp-itinerary" aria-label="Journey itinerary">
            <div className="jp-endpoint-row"><span className="jp-stop-dot"/><strong>{plan.baseRoute.origin.name}</strong><small>Departure · {departure.fuel_percent.toFixed(1)}%</small></div>
            {plan.fuelStops.map(stop => <div className="jp-stop-row" key={stop.station.id}><Fuel size={18}/><div><strong>{stop.station.name}</strong><p>Fictional modeled stop · {stop.leg.cumulativeTravelMiles.toFixed(1)} mi along trip</p><small>{frame.phase === 'fuel-stop' && frame.stopId === stop.station.id ? 'Refueling now' : stop.leg.cumulativeTravelMiles < frame.distanceMiles ? 'Completed in this playback' : 'Planned'} · estimated +{stop.leg.fuelAddedGallons.toFixed(1)} gal · target {stop.refillTargetPercent.toFixed(1)}%</small></div></div>)}
            <div className="jp-endpoint-row"><span className="jp-stop-dot destination"/><strong>{plan.baseRoute.destination.name}</strong><small>Arrival estimate · {plan.arrivalFuelPercent?.toFixed(1) ?? 'unknown'}%</small></div>
          </div>
          {(!demoPlayback || !demo) && <p className="jp-event" role="status" data-testid="vehicle-event">{eventText}</p>}
          <p className="jp-note">Arrival, duration and purchases are estimates. Prices and station availability are fictional; road routes are not truck-clearance verified.</p>
        </div>
        {demoPlayback && demo && session.source === 'synthetic-demo' && <section aria-label="Demo Playback" className="jp-demo-playback">
          <span className="jp-eyebrow">DEMO PLAYBACK · NOT VEHICLE CONTROLS</span>
          <p className="jp-demo-state" role="status" data-testid="vehicle-event">{eventText}</p>
          <div className="jp-playback">
            <button className="jp-play" aria-label={playing ? 'Pause simulation' : playback.status === 'paused' ? 'Resume simulation' : 'Start simulation'} disabled={!plan.feasible || playback.status === 'ended'} onClick={() => playing ? demo.pause() : demo.play()}>{playing ? <Pause size={16}/> : <Play size={16}/>}</button>
            <button aria-label="Reset simulation" onClick={reset}><RotateCcw size={16}/></button>
            <div className="jp-seek"><label htmlFor="journey-seek"><span>{frame.phase.replace('-', ' ')} · {Math.floor(frame.elapsedSeconds / 60)} simulated min</span><span>{Math.round(playback.progress * 100)}%</span></label>
              <input id="journey-seek" aria-label="Seek journey simulation" type="range" min="0" max={Math.max(0, demo.frames.length - 1)} value={playback.index} disabled={!plan.feasible} onChange={e => seek(Number(e.target.value))}/></div>
            <label className="jp-speed"><span>Playback</span><select aria-label="Simulation playback speed" value={playback.speed} onChange={e => demo.setPlaybackSpeed(Number(e.target.value) as 1 | 2 | 5)}><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option></select></label>
          </div><p className="jp-clock-note">60 simulated seconds per real second at 1×. Reset/seek replay historical demo readings; they do not command a vehicle.</p>
        </section>}
      </section>
      <aside className="jp-intelligence" aria-label="Vehicle and journey intelligence">
        <div className="jp-panel-heading"><span className="jp-eyebrow"><Sparkles size={13}/> VEHICLE INTELLIGENCE</span><h2>Ahead of the curve.</h2><p>One vehicle feed. A clearer next step.</p></div>
        <div className={'jp-ai-card ' + insight.priority}><div className="jp-card-label"><Sparkles size={16}/><span>{ai.status === 'analyzing' || ai.status === 'pending' ? 'ANALYZING' : insight.source === 'gemma4' ? 'GEMMA 4 ACTIVE' : ai.error?.code === 'UNKNOWN_MODEL' ? 'MODEL UNAVAILABLE' : ai.error ? 'ERROR · RETRY' : 'DETERMINISTIC FALLBACK'}</span></div>
          <h3>{insight.title}</h3><p>{insight.explanation}</p><small>Priority: {insight.priority}</small><div className="jp-next-action"><span>NEXT ACTION</span><p>{insight.action}</p></div>
          <button className="jp-text-button" onClick={() => coordinator.update(context, vehicle.revision, true)}>Reassess journey <ArrowRight size={13}/></button>
          <small role="status">{ai.error?.message ?? (gemma.checking ? 'Checking server configuration.' : !activeAdapter ? 'Gemma is not configured. Deterministic fallback is active.' : 'Server-side decision support; no autonomous vehicle actions.')}</small>
          {insight.telemetryTimestamp && <small>Assessment snapshot: {new Date(insight.telemetryTimestamp).toLocaleTimeString('en-US', { timeZone: 'America/Chicago' })} simulated · {insight.model}</small>}
          {insight.evidence?.length ? <details><summary>Decision evidence</summary><ul>{insight.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul></details> : null}
        </div>
        <div className="jp-signal"><Fuel size={17}/><div><strong>{context.fuel.status.title}</strong><p>{context.fuel.status.explanation}</p><small>{context.fuel.fuel.usableRangeMiles?.toFixed(1) ?? '—'} usable mi · 10% reserve</small></div></div>
        <div className={'jp-signal ' + (context.diagnostics.length ? 'warning' : '')}><Activity size={17}/><div><strong>{context.diagnostics.length ? context.diagnostics[0].code + ' observed in simulation' : 'No simulated diagnostic code'}</strong><p>{context.diagnostics[0]?.description ?? 'M4 monitors the current telemetry automatically. No active code does not establish vehicle safety.'}</p></div></div>
        <div className="jp-signal"><Activity size={17}/><div><strong>Driving efficiency</strong><p>{efficiency ? efficiency.status : 'M5B analytics is not integrated. Instantaneous MPG is shown below; no trend or savings is invented.'}</p></div></div>
        {selected && <section className="jp-stop-inspection"><h3>{selected.name}</h3><p>Fictional demo station · {money(selected.pricePerGallon)} / US gal sample price · {selected.detourMiles?.toFixed(1) ?? 'unknown'} modeled access mi</p></section>}
      </aside>
    </main>
    <footer className="jp-telemetry" aria-label="Active vehicle telemetry">
      <div><span>SIMULATED SPEED</span><strong data-testid="vehicle-speed">{frame.telemetry.speed_mph.toFixed(0)}<small> MPH</small></strong></div>
      <div><span>ENGINE RPM</span><strong>{frame.telemetry.rpm.toLocaleString('en-US')}<small> rpm</small></strong></div>
      <div><span>INSTANT ECONOMY</span><strong>{frame.telemetry.mpg.toFixed(1)}<small> MPG</small></strong></div>
      <div><span>CURRENT FUEL</span><strong data-testid="vehicle-fuel">{frame.telemetry.fuel_percent.toFixed(1)}<small>%</small></strong></div>
      <div><span>USABLE RANGE</span><strong>{context.fuel.fuel.usableRangeMiles?.toFixed(1) ?? '—'}<small> mi</small></strong></div>
      <div><span>TRIP DISTANCE</span><strong data-testid="vehicle-distance">{frame.distanceMiles.toFixed(1)}<small> / {plan.totalDistanceMiles.toFixed(1)} mi</small></strong></div>
      <div><span>SESSION FUEL PURCHASES</span><strong>{money(vehicle.totalCost)}</strong><small>{vehicle.totalAdded.toFixed(1)} modeled gal added</small></div>
    </footer>
  </div>;
}
