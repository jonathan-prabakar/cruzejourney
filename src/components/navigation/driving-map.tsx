"use client";
import { useCallback, useMemo, useRef } from 'react';
import RouteMap from '../route-map';
import { useConnectedVehicle } from '../connected-vehicle-provider';
import type { JourneyPlan, JourneyRoute, JourneyStation, SimulationFrame } from '@/lib/journey/types';

export default function DrivingMap({ plan, stations, frame, recommendedId, proposal, onStation }: {
  plan: JourneyPlan; stations: JourneyStation[]; frame: SimulationFrame; recommendedId: string | null;
  reachableIds: string[]; selectedId: string | null; proposal: JourneyRoute | null; onStation(id: string): void;
}) {
  const { session, playback } = useConnectedVehicle();
  const directory = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const display = plan.baseRoute.provenance === 'routed-road' ? plan.route : plan.baseRoute;
  const trip = useMemo(() => ({ destination: display.destination.name,
    road: { geometry: { type: 'LineString' as const, coordinates: display.coordinates.map(p => [p[0], p[1]]) } } }), [display]);
  const preview = useMemo(() => proposal?.coordinates.map(p => [p[0], p[1]]), [proposal]);
  const motion = useCallback(() => {
    const state = session.getSnapshot();
    if (state.frame.phase === 'ready') return undefined;
    return session.getMotionProgress?.() ?? state.frame.distanceMiles / state.planning.requested.totalDistanceMiles;
  }, [session]);
  const close = () => { directory.current?.close(); opener.current?.focus(); };
  return <div className="drive-map" data-testid="driving-map" data-route-id={plan.id} data-has-proposal={Boolean(proposal)} data-provider={display.provider}>
    <RouteMap key={plan.id} trip={trip} telemetry={frame.telemetry} stations={stations} recommendedId={recommendedId}
      getMotionProgress={motion} playing={playback.status === 'playing'} fastRun={playback.run_duration_seconds != null}
      proposalCoordinates={preview} onStation={station => onStation(station.id)}
      onStations={trigger => { opener.current = trigger; directory.current?.showModal(); }} />
    {display.provenance !== 'routed-road' && plan.fuelStops.length > 0 && <span className="drive-route-source">Fuel access will be road-validated before playback.</span>}
    <dialog ref={directory} className="drive-station-directory" onCancel={() => opener.current?.focus()}>
      <button type="button" onClick={close}>Close truck stops</button><h2>Verified truck stops</h2>
      {stations.map(station => <button type="button" key={station.id}
        aria-label={'Diesel at ' + station.name} onClick={() => { close(); onStation(station.id); }}>
        <strong>{station.name}</strong><span>{station.pricePerGallon === null ? 'Price unavailable' : '$' + station.pricePerGallon.toFixed(3) + '/gal'} · {station.priceVerifiedAt}</span>
      </button>)}
      {!stations.length && <p>No verified truck stops are included for this route segment.</p>}
    </dialog>
  </div>;
}
