"use client";
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { ArrowRight, ArrowUpDown, Fuel, MapPin, Pause, Play, RotateCcw, Settings2, ShieldCheck, TriangleAlert, X } from 'lucide-react';
import { useConnectedVehicle } from './connected-vehicle-provider';
import { useJourneyGemma } from '@/hooks/useJourneyGemma';
import { JourneyIntelligenceCoordinator, deterministicJourneyInsight, makeJourneyIntelligenceContext } from '@/lib/journey/intelligence';
import { vehicleDiagnosticsAdapter } from '@/lib/journey/diagnostics-adapter';
import { fuelOptions } from '@/lib/vehicle/fuel-options';
import { navigationDecision } from '@/lib/vehicle/navigation-decision';
import { DEMO_LOCATIONS, validateEndpoints } from '@/lib/journey/routes';
import { milesBetween } from '@/lib/journey/geometry';
import LocationField, { type LocationSelection } from './journey/location-field';
import DrivingMap from './navigation/driving-map';
import './navigation/driving-dashboard.css';

const money = (n:number|null) => n === null ? 'Unavailable' : '$'+n.toFixed(2);
export default function DrivingDashboard() {
  const vehicle = useConnectedVehicle();
  const {session,planning,frame,playback,departure} = vehicle;
  const plan = planning.requested, demo = session.demoControls;
  const city = (id:string) => DEMO_LOCATIONS.find(p=>p.id===id)!;
  const [origin,setOrigin] = useState<LocationSelection>({id:plan.baseRoute.origin.id,text:city(plan.baseRoute.origin.id).name});
  const [destination,setDestination] = useState<LocationSelection>({id:plan.baseRoute.destination.id,text:plan.baseRoute.destination.name});
  const [selectedId,setSelectedId] = useState<string|null>(null);
  const [proposalId,setProposalId] = useState<string|null>(null);
  const [notice,setNotice] = useState('');
  const [developer,setDeveloper] = useState(false);
  const gemma = useJourneyGemma(session.source==='synthetic-demo');
  const adapter = session.source==='synthetic-demo'?gemma.adapter:session.intelligenceAdapter??null;
  const comparison = useMemo(()=>fuelOptions(planning,frame),[planning,frame]);
  const context = useMemo(()=>({...makeJourneyIntelligenceContext(planning,frame,vehicleDiagnosticsAdapter),
    connectedJourneys:session.getJourneySelectors(),efficiency:session.getEfficiency()}),[planning,frame,session]);
  const coordinator = useMemo(()=>new JourneyIntelligenceCoordinator(adapter),[adapter]);
  const generated = useSyncExternalStore(coordinator.subscribe,coordinator.getSnapshot,()=>null);
  const ai = useSyncExternalStore(coordinator.subscribe,coordinator.getState,coordinator.getState);
  const insight = generated??deterministicJourneyInsight(context);
  const decision = navigationDecision(context,comparison,insight);
  useEffect(()=>{coordinator.update(context,vehicle.revision);},[coordinator,context,vehicle.revision]);
  useEffect(()=>()=>coordinator.invalidate(),[coordinator]);
  const recommended = comparison.options.find(o=>o.station.id===decision.stationId)??comparison.recommended;
  const selected = planning.stations.find(s=>s.id===selectedId);
  const selectedOption = comparison.options.find(o=>o.station.id===selectedId);
  const proposed = comparison.options.find(o=>o.station.id===proposalId);
  const playing = playback.status==='playing';
  const remainingSeconds = Math.max(0,(demo?.frames.at(-1)?.elapsedSeconds??plan.durationSeconds)-frame.elapsedSeconds);
  const eta = new Date(Date.parse(frame.telemetry.timestamp)+remainingSeconds*1000).toLocaleTimeString('en-US',{timeZone:'America/Chicago',hour:'numeric',minute:'2-digit'});
  const future = departure.latitude!==null && departure.longitude!==null && milesBetween([departure.longitude,departure.latitude],plan.baseRoute.coordinates[0])>.5;
  const startDrive = () => {
    if(validateEndpoints(origin.id,destination.id)){setNotice('Choose two different supported cities.');return;}
    try{coordinator.invalidate();session.planJourney(origin.id,destination.id);demo?.play();setSelectedId(null);setProposalId(null);setNotice('');}
    catch{setNotice('This drive is unavailable. Your vehicle readings are preserved.');}
  };
  const accept = () => {
    if(!proposalId)return;
    try{coordinator.invalidate();session.acceptStation?.(proposalId);setProposalId(null);setSelectedId(null);setNotice('Fuel stop added. Resume when safe.');}
    catch{setNotice('That stop is no longer reachable. Review the updated options.');setProposalId(null);}
  };
  const event = frame.phase==='fuel-stop'?'Refueling · engine off · +'+frame.fuelAddedGallons.toFixed(1)+' gal'
    :frame.phase==='arrived'?'Arrived':playing?'Driving':playback.index?'Paused · last reading retained':'Ready to drive';
  return <div className="drive-shell" data-playback-ready="true">
    <header className="drive-header"><Image src="/brand/logo-horizontal-color.svg" width={720} height={200} alt="Cruze Journey" priority/><span className="drive-product">JOURNEY <span>/</span> INTELLIGENT DRIVE</span><span className="drive-demo"><i/> Demo Mode</span><button aria-label="Developer diagnostics" onClick={()=>setDeveloper(v=>!v)}><Settings2 size={17}/></button></header>
    <main className="drive-main">
      <form className="drive-destination" aria-label="Drive destination" onSubmit={e=>{e.preventDefault();startDrive();}}>
        <LocationField label="Point A" value={origin} onChange={setOrigin}/>
        <button type="button" className="drive-swap" aria-label="Swap locations" onClick={()=>{setOrigin(destination);setDestination(origin);}}><ArrowUpDown size={17}/></button>
        <LocationField label="Point B" value={destination} onChange={setDestination}/>
        <button type="submit" className="drive-start">Start Drive <ArrowRight size={17}/></button>
      </form>
      <section className="drive-navigation" aria-label="Driving navigation">
        <DrivingMap plan={plan} stations={planning.stations} frame={frame} recommendedId={recommended?.station.id??null}
          reachableIds={comparison.options.map(o=>o.station.id)} selectedId={selectedId} proposal={proposed?.plan??null} onStation={id=>{setSelectedId(id);setProposalId(null);}}/>
        <div className="drive-route-heading"><span className="drive-eyebrow">YOUR NEXT MILE</span><h1>{city(plan.baseRoute.origin.id).name} <span>→</span> {plan.baseRoute.destination.name}</h1><p>{Math.ceil(remainingSeconds/60)} min <span>·</span> {frame.remainingDistanceMiles.toFixed(1)} mi remaining <span>·</span> ETA {eta}</p></div>
        <div className={'drive-assist '+decision.kind} role={decision.kind==='vehicle-warning'||decision.kind==='stop-safely'?'alert':'status'} data-testid="navigation-alert">
          <span className="drive-assist-icon">{decision.kind==='vehicle-warning'||decision.kind==='stop-safely'?<TriangleAlert size={20}/>:<ShieldCheck size={20}/>}</span>
          <div><strong>{decision.title}</strong><p>{decision.detail}</p></div>
          {recommended&&<button aria-label="Inspect recommended stop" onClick={()=>setSelectedId(recommended.station.id)}><ArrowRight size={19}/></button>}
        </div>
        {!selected&&recommended&&<button className="drive-recommendation" onClick={()=>setSelectedId(recommended.station.id)} data-testid="fuel-recommendation">
          <span className="drive-eyebrow"><Fuel size={13}/> RECOMMENDED FUEL STOP</span><strong>{recommended.station.name}</strong>
          <span>{recommended.distanceMiles.toFixed(1)} mi ahead <i>·</i> {money(recommended.station.pricePerGallon)}/gal <i>·</i> {money(recommended.purchaseCost)} estimated</span><small>Compare stop <ArrowRight size={13}/></small>
        </button>}
        {selected&&<aside className="drive-station-panel" aria-label="Station comparison">
          <button className="drive-close" aria-label="Close station comparison" onClick={()=>{setSelectedId(null);setProposalId(null);}}><X size={17}/></button>
          <span className="drive-eyebrow">DIESEL STOP · FICTIONAL</span><h2>{selected.name}</h2>
          <div className="drive-cost-grid"><div><strong>{money(selected.pricePerGallon)}</strong><span>per gallon</span></div><div><strong>{selectedOption?money(selectedOption.purchaseCost):'—'}</strong><span>estimated purchase</span></div></div>
          <div className="drive-comparison-line"><span>{selectedOption?.distanceMiles.toFixed(1)??'—'} mi ahead</span><span>+{selected.detourMiles?.toFixed(1)??'—'} mi detour</span><span>{selectedOption?.gallons.toFixed(1)??'—'} gal needed</span></div>
          <p className="drive-amenities">{selected.amenities.join(' · ')}</p>
          {comparison.needed&&selectedOption&&session.acceptStation?proposed?<div className="drive-acceptance" aria-label="Proposed detour"><p>Use this fuel stop?<br/><small>Preview shown on the map. No change until accepted.</small></p><div><button onClick={accept}>Accept detour</button><button onClick={()=>setProposalId(null)}>Decline</button></div></div>
            :<button className="drive-review-stop" onClick={()=>setProposalId(selected.id)}>Review detour <ArrowRight size={15}/></button>
            :<p className="drive-station-note">{!comparison.needed?'No purchase needed for this drive.':'Not currently a confirmed reachable stop ahead.'}</p>}
          <div className="drive-alternatives"><h3>Compare nearby stops</h3>{comparison.options.filter(o=>o.station.id!==selected.id).slice(0,3).map(o=><button key={o.station.id} onClick={()=>{setSelectedId(o.station.id);setProposalId(null);}}><span>{o.station.name}<small>{money(o.station.pricePerGallon)}/gal · +{o.detourMiles.toFixed(1)} mi</small></span><strong>{money(o.purchaseCost)}</strong></button>)}</div>
        </aside>}
        {notice&&<div className="drive-notice" role="status">{notice}<button aria-label="Dismiss notice" onClick={()=>setNotice('')}><X size={13}/></button></div>}
        {future&&frame.phase==='ready'&&<div className="drive-future"><MapPin size={14}/> Future departure: the demo will begin at your chosen origin.</div>}

      </section>
      <footer className="drive-instruments" aria-label="Vehicle telemetry">
        <div className="drive-speed"><strong data-testid="vehicle-speed">{frame.telemetry.speed_mph.toFixed(0)}</strong><span>MPH</span></div>
        <div><span>FUEL</span><strong data-testid="vehicle-fuel">{frame.telemetry.fuel_percent.toFixed(1)}<small>%</small></strong></div>
        <div><span>USABLE RANGE</span><strong data-testid="vehicle-range">{comparison.fuel.fuel.usableRangeMiles?.toFixed(0)??'—'}<small> mi</small></strong></div>
        <div className="drive-secondary-metric"><span>RPM</span><strong>{frame.telemetry.rpm.toLocaleString('en-US')}</strong></div>
        <div className="drive-secondary-metric"><span>MPG</span><strong>{frame.telemetry.mpg.toFixed(1)}</strong></div>
        <div className="drive-secondary-metric"><span>TRIP DISTANCE</span><strong data-testid="vehicle-distance">{vehicle.tripDistanceMiles.toFixed(1)}<small> mi</small></strong></div>
      </footer>
      {demo&&<section className="drive-playback" aria-label="Demo Playback"><span>DEMO PLAYBACK</span>
        <button aria-label={playing?'Pause simulation':'Play simulation'} disabled={!plan.feasible||playback.status==='ended'} onClick={()=>playing?demo.pause():demo.play()}>{playing?<Pause size={15}/>:<Play size={15}/>}</button>
        <button aria-label="Reset simulation" onClick={()=>{coordinator.invalidate();demo.reset();setProposalId(null);setSelectedId(null);}}><RotateCcw size={15}/></button>
        <input aria-label="Seek drive simulation" type="range" min="0" max={Math.max(0,demo.frames.length-1)} value={playback.index} onChange={e=>{coordinator.invalidate();demo.seekTo(Number(e.target.value));setProposalId(null);}}/>
        <select aria-label="Playback speed" value={playback.speed} onChange={e=>demo.setPlaybackSpeed(Number(e.target.value) as 1|2|5)}><option value="1">1×</option><option value="2">2×</option><option value="5">5×</option></select>
        <span className="drive-event" data-testid="vehicle-event">{event}</span>
      </section>}
    </main>
    {developer&&<aside className="drive-developer" aria-label="Developer diagnostics"><button aria-label="Close diagnostics" onClick={()=>setDeveloper(false)}><X size={18}/></button><h2>Developer diagnostics</h2>
      <p>Synthetic OBD/ELD stand-in. No physical device. Cached OSM road routes; truck clearance is not verified. Stations, prices, truck access and detours are fictional.</p>
      <dl><dt>Intelligence</dt><dd>{insight.source==='gemma4'?'Gemma 4 active':'Deterministic fallback'} · {ai.status}</dd><dt>Model</dt><dd>{insight.model??'Not active'}</dd><dt>API</dt><dd>{ai.error?.message??'No current error'}</dd><dt>Telemetry timestamp</dt><dd>{frame.telemetry.timestamp}</dd><dt>GPS</dt><dd>{frame.telemetry.latitude}, {frame.telemetry.longitude}</dd><dt>Diagnostic codes</dt><dd>{frame.telemetry.diagnostic_code??'None observed'}</dd><dt>Efficiency</dt><dd>{context.efficiency?.status??'M5B not integrated; adapter unavailable'}</dd><dt>Session purchases</dt><dd>{money(vehicle.totalCost)} · {vehicle.totalAdded.toFixed(2)} gal</dd><dt>Departure fuel</dt><dd>{departure.fuel_percent.toFixed(2)}%</dd><dt>Source assumptions</dt><dd>10% reserve; conservative {comparison.planningMpg.toFixed(1)} MPG; 1 gal refill buffer. Cost includes the fuel used by each modeled detour, not a wage/time valuation.</dd></dl>
      <h3>Validated assessment</h3><p>{insight.explanation}</p>{insight.evidence?.map((e,i)=><p key={i}>{e}</p>)}
      <button onClick={()=>coordinator.update(context,vehicle.revision,true)}>Request reassessment</button>
    </aside>}
  </div>;
}
