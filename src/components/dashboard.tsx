"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleHelp,
  Flag,
  Fuel,
  Gauge,
  Activity,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  Sparkles,
  Thermometer,
  TriangleAlert,
  Truck,
  X,
} from "lucide-react";
import RouteMap from "./route-map";
import Efficiency from "./efficiency";
import {
  vehicle,
  telemetry,
  fuelStates,
  rangeFor,
  stations,
  recommendation,
  diagnosticEvents,
  route,
  type FuelState,
  type Station,
} from "@/lib/mock-data";

type Inspection = "health" | "efficiency" | "journey" | "stops" | null;

function InspectionDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="inspection-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="inspection-title"
    >
      <div className="inspection-heading">
        <h2 id="inspection-title">{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close details"
          autoFocus
        >
          <X size={20} />
        </button>
      </div>
      <div className="inspection-content">{children}</div>
    </dialog>
  );
}

export default function Dashboard() {
  const opener = useRef<HTMLElement | null>(null);
  const [fuelState, setFuelState] = useState<FuelState>("normal");
  const [station, setStation] = useState<Station | null>(null);
  const [inspection, setInspection] = useState<Inspection>(null);
  const [details, setDetails] = useState(false);
  const [speed, setSpeed] = useState("1");
  const state = fuelStates[fuelState];
  const range = rangeFor(state.percent);
  const progress = Math.round((route.elapsedMiles / route.totalMiles) * 100);
  const close = () => {
    setStation(null);
    setInspection(null);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
    });
  };
  const openInspection = (next: Inspection, trigger: HTMLElement) => {
    opener.current = trigger;
    setInspection(next);
  };
  const openStation = (next: Station, trigger: HTMLElement) => {
    if (!trigger.closest("dialog")) opener.current = trigger;
    setInspection(null);
    setStation(next);
  };
  const cycleFuel = () =>
    setFuelState((current) =>
      current === "normal" ? "low" : current === "low" ? "critical" : "normal",
    );

  return (
    <div className={`cockpit fuel-${fuelState}`}>
      <a className="skip-link" href="#instruments">
        Skip to instruments
      </a>
      <header className="hud-header">
        <Image
          src="/brand/logo-horizontal-color.svg"
          width={720}
          height={200}
          alt="Cruze FuelSense"
          priority
          className="hud-brand"
        />
        <div
          className="journey-track"
          aria-label={`${progress}% of the demo journey completed`}
        >
          <div>
            <span>{route.origin}</span>
            <span className="track-distance">
              {route.elapsedMiles} / {route.totalMiles} mi
            </span>
            <strong>
              {route.destination} <Flag size={12} />
            </strong>
          </div>
          <div className="journey-progress">
            <span style={{ width: `${progress}%` }} />
            <i style={{ left: `${progress}%` }} />
          </div>
        </div>
        <div className="hud-session">
          <span className="demo-label">
            <i /> SIMULATED RUN
          </span>
          <button
            className="icon-button"
            onClick={(event) => openInspection("journey", event.currentTarget)}
            aria-label="Journey information and demo settings"
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>

      <main className="playfield" aria-label="Driving cockpit">
        <div className="route-scene">
          <RouteMap onStation={openStation} />
        </div>
        <div className="run-heading">
          <h1>
            The Austin run<span>.</span>
          </h1>
          <p>
            <Navigation size={13} /> I-35 North <span>·</span>{" "}
            {route.remainingMiles} miles to go
          </p>
        </div>
        <div className="arrival-readout">
          <span>DESTINATION ETA</span>
          <strong>{route.arrival}</strong>
          <p>{route.remainingMinutes} min remaining</p>
        </div>

        <section className="checkpoint" aria-labelledby="checkpoint-title">
          <div className="checkpoint-title">
            <span className="checkpoint-symbol">
              <Fuel size={18} />
            </span>
            <h2 id="checkpoint-title">Next checkpoint</h2>
            <span className="suggested">DEMO PICK</span>
          </div>
          <h3>{stations[0].name}</h3>
          <p className="checkpoint-area">{stations[0].area}</p>
          <div className="checkpoint-stats">
            <div>
              <strong>
                {stations[0].distance}
                <small> mi</small>
              </strong>
              <span>ahead</span>
            </div>
            <div>
              <strong>
                +{stations[0].detour}
                <small> min</small>
              </strong>
              <span>detour</span>
            </div>
            <div>
              <strong>${stations[0].price.toFixed(2)}</strong>
              <span>diesel / gal</span>
            </div>
          </div>
          <p className="checkpoint-reason">
            <Check size={13} /> Low sample price. Short detour.
          </p>
          <button
            className="primary-button"
            onClick={(event) => openStation(stations[0], event.currentTarget)}
          >
            Inspect fuel stop <ArrowUpRight size={16} />
          </button>
          <button
            className="other-stops"
            onClick={(event) => openInspection("stops", event.currentTarget)}
          >
            2 alternative stops <ArrowRight size={13} />
          </button>
        </section>

        <div className="vehicle-comms">
          <button
            className="comms-button caution-comms"
            onClick={(event) => openInspection("health", event.currentTarget)}
          >
            <span className="comms-icon">
              <Activity size={19} />
            </span>
            <span>
              <strong>Engine needs attention</strong>
              <small>P0301 · illustrative caution</small>
            </span>
            <ChevronRight size={17} />
          </button>
          <button
            className="comms-button efficiency-comms"
            onClick={(event) => openInspection("efficiency", event.currentTarget)}
          >
            <span className="comms-icon">
              <Sparkles size={18} />
            </span>
            <span>
              <strong>Find your driving rhythm</strong>
              <small>8.0 MPG · simulated insights</small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="map-caption">
          <span className="route-key" /> Planned route{" "}
          <span className="vehicle-key" /> Your truck{" "}
          <span className="schematic-label">
            SCHEMATIC · FICTIONAL STATIONS
          </span>
        </div>
      </main>

      <section
        className="instrument-deck"
        id="instruments"
        aria-label="Vehicle instruments"
        tabIndex={-1}
      >
        <button
          className="fuel-instrument"
          onClick={cycleFuel}
          aria-label={`Fuel preview: ${fuelState}. Switch to ${fuelState === "normal" ? "low" : fuelState === "low" ? "critical" : "normal"} fuel.`}
        >
          <div className="fuel-dial">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="42" className="dial-track" />
              <circle
                cx="50"
                cy="50"
                r="42"
                className="dial-level"
                strokeDasharray={`${state.percent * 2.639} 264`}
              />
            </svg>
            <div>
              <strong>
                {state.percent}
                <small>%</small>
              </strong>
              <Fuel size={12} />
            </div>
          </div>
          <div className="fuel-reading">
            <span>FUEL RESERVE</span>
            <strong>
              {((vehicle.tankGallons * state.percent) / 100).toFixed(1)}{" "}
              <small>/ 120 gal</small>
            </strong>
            <p className="fuel-status-label">{state.label}</p>
            <small className="preview-cycle">
              <RotateCcw size={10} /> Cycle demo state
            </small>
          </div>
        </button>
        <div className="speed-instrument">
          <div className="speed-ticks" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <strong>
            {telemetry.speed}
            <span>MPH</span>
          </strong>
          <p>SIMULATED SPEED</p>
        </div>
        <div className="instrument">
          <span>
            <Activity size={13} /> ENGINE RPM
          </span>
          <strong>
            {telemetry.rpm.toLocaleString("en-US")}
            <small> rpm</small>
          </strong>
          <p>Within demo band</p>
        </div>
        <div className="instrument range-instrument" aria-live="polite">
          <span>
            <Navigation size={13} /> RANGE ESTIMATE
          </span>
          <strong>
            {range.toFixed(1)}
            <small> mi</small>
          </strong>
          <p>No reserve included</p>
        </div>
        <div className="instrument">
          <span>
            <Gauge size={13} /> TRIP ECONOMY
          </span>
          <strong>
            {telemetry.mpg.toFixed(1)}
            <small> MPG</small>
          </strong>
          <p>Current & average</p>
        </div>
        <div className="instrument temperature-instrument">
          <span>
            <Thermometer size={13} /> COOLANT
          </span>
          <strong>
            {telemetry.temperature}
            <small> °F</small>
          </strong>
          <p>180–220°F demo band</p>
        </div>
      </section>

      <footer className="replay-bar">
        <div className="replay-label">
          <span className="replay-dot" />
          <strong>Dataset replay</strong>
          <span>Preview only</span>
        </div>
        <div className="replay-controls">
          <button disabled aria-label="Play preview unavailable">
            <Play size={15} />
          </button>
          <button disabled aria-label="Pause preview unavailable">
            <Pause size={15} />
          </button>
          <button disabled aria-label="Reset preview unavailable">
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="replay-timeline">
          <div>
            <span />
          </div>
          <span>
            00:24:36 <small>/ 01:22:00</small>
          </span>
        </div>
        <label className="replay-speed">
          <span>Preview speed</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            aria-label="Preview playback speed"
          >
            <option value="1">1×</option>
            <option value="2">2×</option>
            <option value="5">5×</option>
          </select>
        </label>
        <span className="replay-source">Mock fixture · no dataset loaded</span>
        <button
          className="icon-button replay-help"
          aria-label="About this simulated run"
          onClick={(event) => openInspection("journey", event.currentTarget)}
        >
          <CircleHelp size={17} />
        </button>
      </footer>

      {station && (
        <InspectionDialog title={station.name} onClose={close}>
          <span className="detail-tag">FICTIONAL DEMO STATION</span>
          <p>{station.area}</p>
          <div className="station-detail-stats">
            <strong>
              ${station.price.toFixed(2)}
              <small>per gallon · sample diesel price</small>
            </strong>
            <div>
              <b>{station.distance} mi</b>
              <span>ahead</span>
            </div>
            <div>
              <b>+{station.detour} min</b>
              <span>detour</span>
            </div>
          </div>
          <div className="explanation">
            <Sparkles size={18} />
            <p>
              {station.id === recommendation.stationId
                ? recommendation.reason
                : "Alternative fictional stop on the schematic route. Position and price are illustrative."}
            </p>
          </div>
          <p>
            At {state.percent}% fuel, the {range.toFixed(1)}-mile estimate{" "}
            {range >= station.distance ? "covers" : "does not cover"} this
            stop’s displayed distance. No reserve or real-world conditions are
            included.
          </p>
          <button className="primary-button" onClick={close}>
            Back to the run <ArrowRight size={16} />
          </button>
        </InspectionDialog>
      )}
      {inspection === "stops" && (
        <InspectionDialog title="Stops along your route" onClose={close}>
          <p>
            Fictional diesel stations. Static demo options; no ranking engine is
            running.
          </p>
          <div className="stop-list">
            {stations.map((s) => (
              <button
                key={s.id}
                onClick={(event) => openStation(s, event.currentTarget)}
              >
                <Fuel size={18} />
                <span>
                  <strong>{s.name}</strong>
                  <small>
                    {s.distance} mi ahead · +{s.detour} min detour
                  </small>
                </span>
                <b>${s.price.toFixed(2)}</b>
                <ChevronRight size={15} />
              </button>
            ))}
          </div>
        </InspectionDialog>
      )}
      {inspection === "health" && (
        <InspectionDialog title="Engine health briefing" onClose={close}>
          <div className="health-brief">
            <TriangleAlert size={22} />
            <div>
              <strong>P0301 · Cylinder 1 misfire signal</strong>
              <p>Illustrative caution · not a confirmed diagnosis</p>
            </div>
          </div>
          <p>
            Engine coolant: {telemetry.temperature}°F. The 180–220°F band is a
            demo assumption, not a universal vehicle limit.
          </p>
          <button
            className="outline-button"
            aria-expanded={details}
            aria-controls="diagnostic-details"
            onClick={() => setDetails(!details)}
          >
            {details ? "Hide" : "Read"} diagnostic explanation{" "}
            <ChevronRight size={15} />
          </button>
          {details && (
            <div id="diagnostic-details" className="diagnostic-details">
              <h3>What the code can mean</h3>
              <p>
                P0301 indicates an observed misfire associated with cylinder 1.
                A code alone cannot establish the underlying cause.
              </p>
              <h3>Possible causes</h3>
              <p>
                Fuel delivery, injector wiring, or compression issues.
                Spark-ignition vehicles may also have plug or coil faults.
              </p>
              <h3>Suggested next steps</h3>
              <p>
                Arrange professional inspection and consult vehicle-specific
                service information. If the engine runs roughly, loses power, or
                a warning light flashes, stop safely and seek assistance.
              </p>
            </div>
          )}
          <h3 className="detail-subheading">Recent demo events</h3>
          <div className="diagnostic-events">
            {diagnosticEvents.map((e) => (
              <div key={e.time}>
                <i className={e.severity} />
                <span>{e.title}</span>
                <time>{e.time} AM</time>
              </div>
            ))}
          </div>
          <p className="fine-print">
            Static reference content only. No diagnostic engine or physical
            OBD-II device is connected.
          </p>
        </InspectionDialog>
      )}
      {inspection === "efficiency" && (
        <InspectionDialog title="Your driving rhythm" onClose={close}>
          <Efficiency />
        </InspectionDialog>
      )}
      {inspection === "journey" && (
        <InspectionDialog title="Run information" onClose={close}>
          <div className="vehicle-identity">
            <Truck size={25} />
            <div>
              <strong>{vehicle.name}</strong>
              <p>
                {vehicle.id} · {vehicle.model}
              </p>
            </div>
          </div>
          <dl className="journey-facts">
            <div>
              <dt>Route progress</dt>
              <dd>
                {route.elapsedMiles} / {route.totalMiles} miles · {progress}%
              </dd>
            </div>
            <div>
              <dt>Trip</dt>
              <dd>
                {route.origin} → {route.destination}
              </dd>
            </div>
            <div>
              <dt>Display</dt>
              <dd>Dark · MPH · miles · US gallons</dd>
            </div>
            <div>
              <dt>Trip history</dt>
              <dd>Saved trips available after dataset integration.</dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>Mock fixture · {telemetry.timestamp} snapshot</dd>
            </div>
          </dl>
          <p>
            {state.description} Fuel and range are simulated; all stations and
            prices are fictional.
          </p>
          <p className="fine-print">
            The interface is a stationary demo, not live navigation. Replay
            controls remain disabled until dataset integration. Drive Smarter.
            Further.
          </p>
        </InspectionDialog>
      )}
    </div>
  );
}
