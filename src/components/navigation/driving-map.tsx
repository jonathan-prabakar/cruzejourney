"use client";
import { useState, useSyncExternalStore } from 'react';
import type { Coordinate, JourneyPlan, JourneyStation, SimulationFrame } from '@/lib/journey/types';

const subscribeViewport = (listener: () => void) => {
  const query = window.matchMedia('(max-width: 700px)');
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
export default function DrivingMap({ plan, stations, frame, recommendedId, reachableIds, selectedId, proposal, onStation }: {
  plan: JourneyPlan; stations: JourneyStation[]; frame: SimulationFrame; recommendedId: string | null;
  reachableIds: string[]; selectedId: string | null; proposal: JourneyPlan | null; onStation(id: string): void;
}) {
  const [zoom, setZoom] = useState(1);
  const narrow = useSyncExternalStore(subscribeViewport, () => window.matchMedia('(max-width: 700px)').matches, () => false);
  const vehicle: Coordinate = [frame.telemetry.longitude ?? plan.route.coordinates[0][0], frame.telemetry.latitude ?? plan.route.coordinates[0][1]];
  const points = [...plan.route.coordinates, vehicle, ...(proposal?.route.coordinates ?? [])];
  const centerLat = points.reduce((s,p) => s + p[1], 0) / points.length;
  const cos = Math.cos(centerLat * Math.PI / 180);
  const xs = points.map(p => p[0] * cos), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = Math.min(1120 / (maxX-minX || .001), 590 / (maxY-minY || .001));
  // Quantized display coordinates avoid Node/Chromium trigonometric rounding mismatches at hydration.
  const project = (p: Coordinate) => [Number((700 + (p[0]*cos - (minX+maxX)/2)*scale).toFixed(2)), Number((405 - (p[1]-(minY+maxY)/2)*scale).toFixed(2))];
  const line = (coordinates: Coordinate[]) => coordinates.map(p => project(p).map(n=>n.toFixed(1)).join(',')).join(' ');
  const truck = project(vehicle), destination = project(plan.route.coordinates.at(-1)!);
  const labels: { x:number;y:number }[] = [];
  const pins = stations.filter(s => s.fuelTypes.includes('diesel') && s.isAvailable &&
    s.distanceAlongRouteMiles! >= frame.baseRouteMiles - .01).map((station,i) => {
    const [x,y] = project(station.coordinate);
    const lx = Math.max(narrow?410:76,Math.min(narrow?990:1320,x+(i%2?90:-90)));
    const desired = Math.max(narrow?220:120,Math.min(715,y-4));
    let ly = desired;
    const offsets = [0,...Array.from({length:18},(_,n)=>(n%2?1:-1)*Math.ceil((n+1)/2)*48)];
    const available = offsets.map(o=>desired+o).find(candidate=>candidate>=(narrow?220:120)&&candidate<=730&&
      !labels.some(p=>Math.abs(p.x-lx)<114&&Math.abs(p.y-candidate)<47));
    if(available!==undefined)ly=available;
    labels.push({x:lx,y:ly});
    return {station,x,y,lx,ly};
  });
  return <div className="drive-map" data-testid="driving-map">
    <svg viewBox={narrow?'350 0 700 810':'0 0 1400 810'} preserveAspectRatio="xMidYMid meet" role="img" aria-label={'Driving route to ' + plan.baseRoute.destination.name}>
      <defs>
        <pattern id="drive-grid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#213141" strokeWidth=".5"/></pattern>
        <linearGradient id="drive-route" x1="0" y1="1" x2="1" y2="0"><stop stopColor="#079ce8"/><stop offset="1" stopColor="#36e0b9"/></linearGradient>
        <filter id="drive-glow"><feGaussianBlur stdDeviation="7"/></filter>
      </defs>
      <rect width="1400" height="810" fill="#0b1721"/><rect width="1400" height="810" fill="url(#drive-grid)" opacity=".6"/>
      <g transform={'translate('+(700-700*zoom)+','+(405-405*zoom)+') scale('+zoom+')'}>
        <polyline points={line(plan.route.coordinates)} stroke="#0cbcad" strokeWidth="24" opacity=".15" filter="url(#drive-glow)" fill="none"/>
        <polyline data-testid="active-route" points={line(plan.route.coordinates)} stroke="#243e4d" strokeWidth="12" fill="none" strokeLinejoin="round"/>
        <polyline points={line(plan.route.coordinates)} stroke="url(#drive-route)" strokeWidth="5" fill="none" strokeLinejoin="round"/>
        {proposal && <polyline data-testid="proposed-route" points={line(proposal.route.coordinates)} stroke="#e9c57c" strokeWidth="8" strokeDasharray="12 10" fill="none"/>}
        <circle cx={destination[0]} cy={destination[1]} r="9" fill="#49dfc6" stroke="#dffff8" strokeWidth="3"/>
        <text x={destination[0]+18} y={destination[1]-16} fill="#d3e6ee" fontSize="17" fontWeight="600">{plan.baseRoute.destination.name}</text>
        {pins.map(({station,x,y,lx,ly}) => {
          const recommended = station.id === recommendedId, reachable = reachableIds.includes(station.id);
          const selected = station.id === selectedId;
          return <g key={station.id} role="button" tabIndex={0}
            aria-label={'Diesel at ' + station.name + ', ' + (station.pricePerGallon === null ? 'price unavailable' : '$' + station.pricePerGallon.toFixed(2)) + (recommended ? ', recommended' : reachable ? ', reachable' : ', not confirmed reachable')}
            onClick={()=>onStation(station.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onStation(station.id);}}}
            className={'drive-station ' + (recommended?'recommended':reachable?'reachable':'unreachable')} data-testid={recommended?'recommended-station':undefined}>
            {recommended && <circle cx={x} cy={y} r="27" fill="#3ae0b5" opacity=".12"/>}
            <line x1={x} y1={y} x2={lx} y2={ly} stroke={recommended?'#42d9b4':'#526c7d'} strokeWidth="1" opacity=".8"/>
            <circle cx={x} cy={y} r={selected?10:6} fill={recommended?'#42dfb4':reachable?'#a2d9e7':'#657787'} stroke="#0a1520" strokeWidth="3"/>
            <rect x={lx-53} y={ly-18} width="106" height="36" rx="10" fill={recommended?'#103d35':'#122634'} stroke={recommended?'#3bd9b1':selected?'#dfece9':reachable?'#4b7586':'#2a414f'} strokeWidth={recommended||selected?2:1}/>
            <text x={lx-36} y={ly+5} fill={recommended?'#8cf3d8':reachable?'#d5e8ed':'#7d929d'} fontSize="12">D</text>
            <text x={lx+10} y={ly+6} textAnchor="middle" fill={recommended?'#b2ffe9':reachable?'#e8f4f8':'#91a3ab'} fontSize="18" fontWeight="600">{station.pricePerGallon === null ? '—' : '$'+station.pricePerGallon.toFixed(2)}</text>
            {recommended && <text x={lx} y={ly-27} textAnchor="middle" fontSize="10" fill="#57e0bb" letterSpacing="1.3">RECOMMENDED</text>}
          </g>;
        })}
        <g data-testid="vehicle-marker" transform={'translate('+truck[0].toFixed(2)+','+truck[1].toFixed(2)+')'}>
          <circle r="33" fill="#38e3c0" opacity=".13"/><circle r="18" fill="#44e2bf" stroke="#071a20" strokeWidth="4"/>
          <path d="M0 -11L8 8L0 4L-8 8Z" fill="#073b35" transform={plan.baseRoute.destination.coordinate[1] < plan.baseRoute.origin.coordinate[1]?'rotate(180)':undefined}/>
        </g>
      </g>
    </svg>
    <div className="drive-map-tools"><button aria-label="Zoom map in" onClick={()=>setZoom(z=>Math.min(1.5,z+.15))}>+</button><button aria-label="Fit map" onClick={()=>setZoom(1)}>Fit</button></div>
    <div className="drive-map-key"><span>━ Active route</span><span className="key-recommended">● Recommended stop</span><span>● Reachable diesel</span>{proposal&&<span className="key-proposed">┄ Proposed detour</span>}</div>
    <div className="drive-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a><span>Fictional stations, prices & access detours</span></div>
  </div>;
}
