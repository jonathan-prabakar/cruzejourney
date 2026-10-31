"use client";
import { useState } from 'react';
import type { Coordinate, JourneyPlan, JourneyStation, SimulationFrame, Amenity } from '@/lib/journey/types';

export default function JourneyMap({ plan, stations, amenities, frame, selectedStationId, onStation }: {
  plan: JourneyPlan; stations: JourneyStation[]; amenities: Amenity[]; frame: SimulationFrame;
  selectedStationId: string | null; onStation(id: string): void;
}) {
  const [zoom, setZoom] = useState(1);
  const points = plan.route.coordinates;
  const minLon = Math.min(...points.map(p => p[0])), maxLon = Math.max(...points.map(p => p[0]));
  const minLat = Math.min(...points.map(p => p[1])), maxLat = Math.max(...points.map(p => p[1]));
  const lonSpan = maxLon - minLon || 0.001, latSpan = maxLat - minLat || 0.001;
  const project = (p: Coordinate) => [80 + (p[0] - minLon) / lonSpan * 640, 445 - (p[1] - minLat) / latSpan * 370];
  const path = points.map(p => project(p).map(n => n.toFixed(1)).join(',')).join(' ');
  const vehicle = project([frame.telemetry.longitude!, frame.telemetry.latitude!]);
  const from = project(points[0]), to = project(points.at(-1)!);
  return <div className="jp-map" data-testid="journey-map">
    <div className="jp-map-title"><span className="jp-eyebrow">YOUR ROUTE</span><h2>{plan.route.origin.name} <span>→</span> {plan.route.destination.name}</h2>
      <p>Cached road geometry · fictional stop access loops</p><p className="jp-map-distance">{frame.remainingDistanceMiles.toFixed(1)} mi remaining · {(frame.distanceMiles / plan.totalDistanceMiles * 100).toFixed(0)}% traveled</p></div>
    <div className="jp-map-tools"><button aria-label="Zoom in" onClick={() => setZoom(z => Math.min(1.6, z + 0.2))}>+</button>
      <button aria-label="Fit route bounds" onClick={() => setZoom(1)}>Fit</button></div>
    <svg viewBox="0 0 800 510" preserveAspectRatio="xMidYMid meet" role="img" aria-label={'Route from ' + plan.route.origin.name + ' to ' + plan.route.destination.name}>
      <defs><pattern id="jp-grid" width="42" height="42" patternUnits="userSpaceOnUse"><path d="M 42 0 L 0 0 0 42" fill="none" stroke="#1e3446" strokeWidth=".7"/></pattern>
        <linearGradient id="jp-route-color" x1="0" x2="1"><stop stopColor="#008fdd"/><stop offset="1" stopColor="#00d1a7"/></linearGradient>
        <filter id="jp-glow"><feGaussianBlur stdDeviation="4"/></filter></defs>
      <rect width="800" height="510" fill="#0e1a27"/><rect width="800" height="510" fill="url(#jp-grid)" opacity=".7"/>
      <g transform={'translate(' + (400 - 400 * zoom) + ',' + (255 - 255 * zoom) + ') scale(' + zoom + ')'}>
        <polyline data-testid="route-polyline" points={path} stroke="#008fdd" strokeWidth="16" opacity=".12" filter="url(#jp-glow)" fill="none"/>
        <polyline points={path} stroke="#1f3d54" strokeWidth="10" strokeLinejoin="round" fill="none"/>
        <polyline points={path} stroke="url(#jp-route-color)" strokeWidth="4" strokeLinejoin="round" fill="none"/>
        {stations.map(s => { const p = project(s.coordinate), selected = plan.waypoints.some(w => w.id === s.id);
          return <g key={s.id} role="button" tabIndex={0} aria-label={'Inspect fictional ' + s.name} onClick={() => onStation(s.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStation(s.id); } }} className="jp-map-pin">
            <circle cx={p[0]} cy={p[1]} r={selectedStationId === s.id ? 13 : 9} fill={selected ? '#00d1a7' : '#152d42'} stroke={selected ? '#8dffe6' : '#5d8bae'} strokeWidth="2"/>
            <text x={p[0]} y={p[1] + 3} textAnchor="middle" fontSize="9" fill={selected ? '#042f27' : '#bddaff'}>{selected ? 'F' : '·'}</text>
          </g>; })}
        {amenities.filter(a => plan.waypoints.some(w => w.id === a.id)).map(a => { const p = project(a.coordinate); return <g key={a.id}><circle cx={p[0] + 17} cy={p[1]} r="5" fill="#c5adff"/><title>{a.name} (fictional)</title></g>; })}
        <circle cx={from[0]} cy={from[1]} r="7" fill="#142331" stroke="#d2dfec" strokeWidth="3"/>
        <text x={from[0] + 15} y={from[1] - 15} fontSize="12" fill="#b8cbde">{plan.route.origin.name}</text>
        <circle cx={to[0]} cy={to[1]} r="8" fill="#009dbe" stroke="#c8f3ff" strokeWidth="3"/>
        <text x={to[0] - 10} y={to[1] - 17} textAnchor="end" fontSize="12" fill="#c8e9ed">{plan.route.destination.name}</text>
        <g data-testid="vehicle-marker" transform={'translate(' + vehicle[0].toFixed(2) + ',' + vehicle[1].toFixed(2) + ')'}>
          <circle r="23" fill="#00d1a7" opacity=".1"/><circle r="12" fill="#00d1a7" stroke="#0c1824" strokeWidth="3"/>
          <path d="M0 -7 L6 6 L0 3 L-6 6 Z" fill="#053d34" transform={plan.route.destination.coordinate[1] < plan.route.origin.coordinate[1] ? 'rotate(180)' : undefined}/>
        </g>
      </g>
    </svg>
    <div className="jp-map-legend"><span>━ Selected route</span><span className="jp-teal">● Your truck</span><span>F Planned fuel</span><span className="jp-purple">● Amenity</span></div>
    <div className="jp-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a><span>OSRM driving profile · not truck-validated</span></div>
  </div>;
}
