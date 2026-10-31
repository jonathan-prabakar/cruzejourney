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
import { useIntegratedVehicle } from "@/hooks/useIntegratedVehicle";
import {
  demoDataset,
  demoStations,
  formatDemoTime,
  formatDuration,
} from "@/lib/integration/snapshot";
import type { FuelStation } from "@/lib/fuel/types";
import type { PlaybackSpeed } from "@/lib/telemetry/types";
type Inspection =
  | "health"
  | "efficiency"
  | "journey"
  | "stops"
  | "fuel"
  | "intelligence"
  | null;
const number = (value: number | null | undefined, digits = 1) =>
  value == null ? "—" : value.toFixed(digits);
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
  const app = useIntegratedVehicle();
  const { snapshot, playback, intelligence } = app;
  const {
    currentTelemetry: telemetry,
    fuel,
    health,
    route,
    vehicle,
  } = snapshot;
  const recommended = app.selectedStop;
  const recommendation = recommended?.station ?? null;
  const opener = useRef<HTMLElement | SVGElement | null>(null);
  const [station, setStation] = useState<FuelStation | null>(null);
  const [inspection, setInspection] = useState<Inspection>(null);
  const [details, setDetails] = useState(false);
  const progress = Math.round(snapshot.progress * 100);
  const fuelState = fuel.status.fuelStatus.toLowerCase();
  const selected = fuel.recommendation.assessments.find(
    (s) => s.station.id === station?.id,
  );
  const topInsight =
    intelligence.result.insights.find(
      (i) => i.id === intelligence.result.topPriority,
    ) ?? intelligence.result.insights[0];
  const close = () => {
    setStation(null);
    setInspection(null);
    requestAnimationFrame(() => {
      if (opener.current?.isConnected) opener.current.focus();
    });
  };
  const openInspection = (next: Inspection, trigger: HTMLElement) => {
    opener.current = trigger;
    setStation(null);
    setInspection(next);
  };
  const openStation = (
    next: FuelStation,
    trigger: HTMLElement | SVGElement,
  ) => {
    if (!trigger.closest("dialog")) opener.current = trigger;
    setInspection(null);
    setStation(next);
  };
  const healthTitle = health.activeCodes.length
    ? `${health.activeCodes.join(", ")} needs evaluation`
    : health.overallStatus === "HIGH"
      ? "Coolant needs attention"
      : health.overallStatus === "WARNING"
        ? "Review coolant warning"
        : health.overallStatus === "UNKNOWN"
          ? "Health data incomplete"
          : "No active code observed";
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
          aria-label={`${progress}% of the synthetic journey completed`}
        >
          <div>
            <span>San Antonio</span>
            <span className="track-distance">
              {number(route.currentDistanceAlongRouteMiles)} /{" "}
              {number(snapshot.totalMiles)} mi
            </span>
            <strong>
              Austin <Flag size={12} />
            </strong>
          </div>
          <div className="journey-progress">
            <span style={{ width: `${progress}%` }} />
            <i style={{ left: `${progress}%` }} />
          </div>
        </div>
        <div className="hud-session">
          <span className="demo-label">
            <i /> SYNTHETIC REPLAY
          </span>
          <button
            className="icon-button"
            onClick={(e) => openInspection("journey", e.currentTarget)}
            aria-label="Journey information and demo settings"
          >
            <Settings2 size={19} />
          </button>
        </div>
      </header>
      <main className="playfield" aria-label="Driving cockpit">
        <div className="route-scene">
          <RouteMap
            onStation={openStation}
            telemetry={telemetry}
            stations={demoStations}
            recommendedId={recommendation?.id ?? null}
          />
        </div>
        <div className="run-heading">
          <h1>
            The Austin run<span>.</span>
          </h1>
          <p>
            <Navigation size={13} /> I-35 North <span>·</span>{" "}
            {number(route.remainingRouteMiles)} modeled miles to go
          </p>
        </div>
        <div className="arrival-readout">
          <span>DEMO ARRIVAL</span>
          <strong>
            {formatDemoTime(demoDataset.records.at(-1)!.timestamp)}
          </strong>
          <p>{Math.ceil(snapshot.remainingMinutes)} min remaining</p>
        </div>
        <section className="checkpoint" aria-labelledby="checkpoint-title">
          <div className="checkpoint-title">
            <span className="checkpoint-symbol">
              <Fuel size={18} />
            </span>
            <h2 id="checkpoint-title">
              {recommendation ? "Next checkpoint" : "No reachable stop"}
            </h2>
            <span className="suggested">
              {intelligence.result.source === "gemma4"
                ? "GEMMA + M3"
                : "M3 · DEMO"}
            </span>
          </div>
          <h3>{recommendation?.name ?? "No confirmed reachable station"}</h3>
          <p className="checkpoint-area">
            {recommendation
              ? "Fictional diesel stop · modeled detour"
              : fuel.status.recommendedAction}
          </p>
          <div className="checkpoint-stats">
            <div>
              <strong>
                {number(recommended?.reachability.routeDistanceMiles)}
                <small> mi</small>
              </strong>
              <span>along route</span>
            </div>
            <div>
              <strong>
                +{number(recommendation?.detourMiles)}
                <small> mi</small>
              </strong>
              <span>full detour</span>
            </div>
            <div>
              <strong>
                {recommendation?.pricePerGallon == null
                  ? "—"
                  : `$${recommendation.pricePerGallon.toFixed(2)}`}
              </strong>
              <span>sample / gal</span>
            </div>
          </div>
          <p className="checkpoint-reason">
            <Check size={13} />
            {fuel.status.routeSafety === "INSUFFICIENT_RANGE"
              ? "Destination exceeds usable range"
              : fuel.status.title}
          </p>
          <button
            className="primary-button"
            onClick={(e) =>
              recommendation
                ? openStation(recommendation, e.currentTarget)
                : openInspection("fuel", e.currentTarget)
            }
          >
            {recommendation ? "Inspect fuel stop" : "Review fuel warning"}
            <ArrowUpRight size={16} />
          </button>
          <button
            className="other-stops"
            onClick={(e) => openInspection("stops", e.currentTarget)}
          >
            {fuel.recommendation.alternatives.length} eligible alternatives{" "}
            <ArrowRight size={13} />
          </button>
        </section>
        <div className="vehicle-comms">
          <button
            className={`comms-button ${health.overallStatus === "HIGH" || health.overallStatus === "WARNING" ? "caution-comms" : ""}`}
            onClick={(e) => openInspection("health", e.currentTarget)}
          >
            <span className="comms-icon">
              <Activity size={19} />
            </span>
            <span>
              <strong>{healthTitle}</strong>
              <small>
                {health.overallStatus} · {health.recentEvents.length} observed
                episodes
              </small>
            </span>
            <ChevronRight size={17} />
          </button>
          <button
            className="comms-button efficiency-comms"
            onClick={(e) => openInspection("intelligence", e.currentTarget)}
          >
            <span className="comms-icon">
              <Sparkles size={18} />
            </span>
            <span>
              <strong>Vehicle intelligence</strong>
              <small>
                {intelligence.result.source === "gemma4"
                  ? "Gemma 4 reasoning"
                  : intelligence.checking
                    ? "Fallback · checking AI availability"
                    : "Deterministic fallback"}{" "}
                · {topInsight?.priority ?? "unknown"}
              </small>
            </span>
            <ChevronRight size={17} />
          </button>
        </div>
        <div className="map-caption">
          <span className="route-key" /> Planned route{" "}
          <span className="vehicle-key" /> Synthetic GPS{" "}
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
          onClick={(e) => openInspection("fuel", e.currentTarget)}
          aria-label="Fuel intelligence details"
        >
          <div className="fuel-dial">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="42" className="dial-track" />
              <circle
                cx="50"
                cy="50"
                r="42"
                className="dial-level"
                strokeDasharray={`${telemetry.fuel_percent * 2.639} 264`}
              />
            </svg>
            <div>
              <strong>
                {number(telemetry.fuel_percent, 1)}
                <small>%</small>
              </strong>
              <Fuel size={12} />
            </div>
          </div>
          <div className="fuel-reading">
            <span>FUEL REMAINING</span>
            <strong>
              {number(fuel.fuel.remainingGallons)}{" "}
              <small>/ {vehicle.tank_capacity_gallons} gal</small>
            </strong>
            <p className="fuel-status-label">
              {fuel.status.fuelStatus} ·{" "}
              {fuel.status.routeSafety === "INSUFFICIENT_RANGE"
                ? "route shortfall"
                : "route " + fuel.status.routeSafety.toLowerCase()}
            </p>
            <small className="preview-cycle">
              <CircleHelp size={10} /> Fuel & reserve details
            </small>
          </div>
        </button>
        <div className="speed-instrument">
          <div className="speed-ticks" aria-hidden="true">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} />
            ))}
          </div>
          <strong>
            {number(telemetry.speed_mph, 0)}
            <span>MPH</span>
          </strong>
          <p>SYNTHETIC SPEED</p>
        </div>
        <div className="instrument">
          <span>
            <Activity size={13} /> ENGINE RPM
          </span>
          <strong>
            {telemetry.rpm.toLocaleString("en-US")}
            <small> rpm</small>
          </strong>
          <p>Observed sample</p>
        </div>
        <div className="instrument range-instrument">
          <span>
            <Navigation size={13} /> USABLE RANGE
          </span>
          <strong>
            {number(fuel.fuel.usableRangeMiles)}
            <small> mi</small>
          </strong>
          <p>
            Raw {number(fuel.fuel.estimatedRangeMiles)} mi ·{" "}
            {fuel.fuel.reservePercent}% reserve
          </p>
        </div>
        <div className="instrument">
          <span>
            <Gauge size={13} /> CURRENT ECONOMY
          </span>
          <strong>
            {number(telemetry.mpg)}
            <small> MPG</small>
          </strong>
          <p>Trip avg {number(snapshot.averageMpg)}</p>
        </div>
        <div className="instrument temperature-instrument">
          <span>
            <Thermometer size={13} /> COOLANT
          </span>
          <strong>
            {number(telemetry.coolant_temp_f, 0)}
            <small> °F</small>
          </strong>
          <p>{health.coolantStatus} · demo thresholds</p>
        </div>
      </section>
      <footer className="replay-bar">
        <div className="replay-label">
          <span className="replay-dot" />
          <strong>Dataset replay</strong>
          <span>
            {playback.status} · {playback.index + 1}/{playback.total}
          </span>
        </div>
        <div className="replay-controls">
          <button
            disabled={
              playback.status === "playing" || playback.status === "ended"
            }
            onClick={app.play}
            aria-label="Play telemetry"
          >
            <Play size={15} />
          </button>
          <button
            disabled={playback.status !== "playing"}
            onClick={app.pause}
            aria-label="Pause telemetry"
          >
            <Pause size={15} />
          </button>
          <button onClick={app.reset} aria-label="Reset telemetry">
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="replay-timeline">
          <input
            type="range"
            min="0"
            max={playback.total - 1}
            step="1"
            value={playback.index}
            onChange={(e) => app.seekTo(Number(e.target.value))}
            aria-label="Seek telemetry reading"
            aria-valuetext={`Reading ${playback.index + 1} of ${playback.total}, ${formatDemoTime(telemetry.timestamp)}`}
          />
          <span>
            {formatDuration(playback.elapsed_ms)}{" "}
            <small>/ {formatDuration(playback.duration_ms)}</small>
          </span>
        </div>
        <label className="replay-speed">
          <span>Replay speed</span>
          <select
            value={String(playback.speed)}
            onChange={(e) =>
              app.setPlaybackSpeed(Number(e.target.value) as PlaybackSpeed)
            }
            aria-label="Playback speed"
          >
            <option value="1">1×</option>
            <option value="2">2×</option>
            <option value="5">5×</option>
          </select>
        </label>
        <span className="replay-source">
          Synthetic M2 · {formatDemoTime(telemetry.timestamp)}
        </span>
        <button
          className="icon-button replay-help"
          aria-label="About this synthetic run"
          onClick={(e) => openInspection("journey", e.currentTarget)}
        >
          <CircleHelp size={17} />
        </button>
      </footer>
      {station && (
        <InspectionDialog title={station.name} onClose={close}>
          <span className="detail-tag">
            FICTIONAL DEMO STATION · {selected?.status ?? "UNKNOWN"}
          </span>
          <p>
            {selected?.explanation ??
              "Reachability is unavailable for this reading."}
          </p>
          <div className="station-detail-stats">
            <strong>
              {station.pricePerGallon == null
                ? "Unknown"
                : `$${station.pricePerGallon.toFixed(2)}`}
              <small>per gallon · fictional diesel price</small>
            </strong>
            <div>
              <b>{number(selected?.routeDistanceMiles)} mi</b>
              <span>along route</span>
            </div>
            <div>
              <b>+{number(station.detourMiles)} mi</b>
              <span>modeled full detour</span>
            </div>
          </div>
          <div className="explanation">
            <Sparkles size={18} />
            <p>
              {station.id === recommendation?.id
                ? recommended?.explanation
                : selected?.explanation}
            </p>
          </div>
          <p>
            Estimated arrival: {number(selected?.estimatedArrivalGallons)} gal (
            {number(selected?.estimatedArrivalFuelPercent)}%). Planning uses{" "}
            {fuel.fuel.planningMpg} MPG and a {fuel.fuel.reservePercent}%
            reserve of total tank capacity. Estimates do not guarantee arrival.
          </p>
          <button className="primary-button" onClick={close}>
            Back to the run <ArrowRight size={16} />
          </button>
        </InspectionDialog>
      )}
      {inspection === "fuel" && (
        <InspectionDialog title="Fuel intelligence" onClose={close}>
          <span className="detail-tag">
            {fuel.status.fuelStatus} · {fuel.status.routeSafety}
          </span>
          <p>{fuel.status.explanation}</p>
          <dl className="journey-facts">
            <div>
              <dt>Remaining gallons</dt>
              <dd>{number(fuel.fuel.remainingGallons)} gal</dd>
            </div>
            <div>
              <dt>Raw estimated range</dt>
              <dd>{number(fuel.fuel.estimatedRangeMiles)} mi</dd>
            </div>
            <div>
              <dt>Safety reserve</dt>
              <dd>
                {number(fuel.fuel.reserveGallons)} gal ·{" "}
                {fuel.fuel.reservePercent}% of tank
              </dd>
            </div>
            <div>
              <dt>Usable planning range</dt>
              <dd>{number(fuel.fuel.usableRangeMiles)} mi</dd>
            </div>
            <div>
              <dt>Destination distance</dt>
              <dd>{number(route.remainingRouteMiles)} modeled mi</dd>
            </div>
            <div>
              <dt>Planning economy</dt>
              <dd>{fuel.fuel.planningMpg} MPG · vehicle profile</dd>
            </div>
          </dl>
          <p>{fuel.status.recommendedAction}</p>
          <p>{fuel.recommendation.explanation}</p>
          {fuel.recommendation.warnings.map((w) => (
            <p key={w.code}>{w.explanation}</p>
          ))}
          <p className="fine-print">
            Synthetic readings; fictional station prices and modeled full
            detours. Road progress comes from the unchanged M2 speed/time model,
            never GPS straight-line distance.
          </p>
        </InspectionDialog>
      )}
      {inspection === "stops" && (
        <InspectionDialog title="Stops along your route" onClose={close}>
          <p>{fuel.recommendation.explanation}</p>
          <div className="stop-list">
            {fuel.recommendation.assessments.map((a) => (
              <button
                key={a.station.id}
                onClick={(e) => openStation(a.station, e.currentTarget)}
              >
                <Fuel size={18} />
                <span>
                  <strong>{a.station.name}</strong>
                  <small>
                    {a.status} · {number(a.routeDistanceMiles)} modeled mi ahead
                  </small>
                </span>
                <b>
                  {a.station.pricePerGallon == null
                    ? "—"
                    : `$${a.station.pricePerGallon.toFixed(2)}`}
                </b>
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
              <strong>{healthTitle}</strong>
              <p>{health.overallStatus} · educational interpretation</p>
            </div>
          </div>
          <p>{health.explanation}</p>
          <p>
            Coolant {number(telemetry.coolant_temp_f)}°F: {health.coolantStatus}
            . Demo thresholds: elevated {health.config.elevatedF}°F, critical{" "}
            {health.config.criticalF}°F. Manufacturer limits vary.
          </p>
          <button
            className="outline-button"
            disabled={!health.explanations.length}
            aria-expanded={details}
            aria-controls="diagnostic-details"
            onClick={() => setDetails(!details)}
          >
            {details ? "Hide" : "Read"} diagnostic explanation{" "}
            <ChevronRight size={15} />
          </button>
          {details && (
            <div id="diagnostic-details" className="diagnostic-details">
              {health.explanations.map((e) => (
                <div key={e.code}>
                  <h3>
                    {e.code} · {e.description} ({e.severity})
                  </h3>
                  <p>
                    System: {e.system}. A code alone does not confirm a
                    mechanical cause.
                  </p>
                  <h3>Possible causes</h3>
                  <p>
                    {e.possibleCauses.join(" ") ||
                      "Unknown; consult vehicle-specific service information."}
                  </p>
                  <h3>Suggested next steps</h3>
                  <p>
                    {e.nextSteps.join(" ")} {e.safetyGuidance}
                  </p>
                </div>
              ))}
            </div>
          )}
          <h3 className="detail-subheading">
            Observed episodes up to this reading
          </h3>
          <div className="diagnostic-events">
            {health.recentEvents.length ? (
              health.recentEvents.map((e) => (
                <div key={e.code + e.firstObserved}>
                  <i className="caution" />
                  <span>
                    {e.code} ·{" "}
                    {e.currentlyObserved ? "Currently" : "Previously"} observed
                    <br />
                    <small>
                      First {formatDemoTime(e.firstObserved)} · Last{" "}
                      {formatDemoTime(e.lastObserved)} · {e.readings} readings
                    </small>
                  </span>
                </div>
              ))
            ) : (
              <p>No diagnostic episodes observed in this playback prefix.</p>
            )}
          </div>
          <p className="fine-print">
            Synthetic dataset, simulated P0301, rule-based interpretation. No
            physical OBD-II device. A disappearing code is not proof of repair.
          </p>
        </InspectionDialog>
      )}
      {inspection === "intelligence" && (
        <InspectionDialog title="Vehicle intelligence" onClose={close}>
          <span className="detail-tag">
            {intelligence.result.source === "gemma4"
              ? "GEMMA 4 · LIVE REASONING"
              : "DETERMINISTIC FALLBACK"}{" "}
            · {intelligence.state}
          </span>
          <p>
            {intelligence.available
              ? "A server key and supported model are configured. Requests run on meaningful events; only validated responses are labeled Gemma reasoning."
              : intelligence.checking
                ? "Checking AI availability. Deterministic advice is active."
                : "Gemma is unavailable or not configured. No live AI response is claimed."}
          </p>
          <h3 className="detail-subheading">Overall assessment</h3>
          <p>{intelligence.result.overallAssessment}</p>
          {intelligence.result.insights.map((i) => (
            <div className="intelligence-insight" key={i.id}>
              <h3>
                {i.title} · {i.priority}
              </h3>
              <p>{i.explanation}</p>
              <p>
                <strong>Action:</strong> {i.recommendedAction}
              </p>
              <small>
                {i.source} ·{" "}
                {i.mandatory
                  ? "mandatory deterministic warning"
                  : "decision support"}
              </small>
            </div>
          ))}
          <p className="fine-print">
            Reading {playback.index + 1} · {formatDemoTime(telemetry.timestamp)}
            . Deterministic calculations and warnings remain authoritative. No
            M5 efficiency engine is included.
          </p>
          {intelligence.available && (
            <button className="outline-button" onClick={intelligence.refresh}>
              Request current assessment
            </button>
          )}
          <button
            className="outline-button"
            onClick={() => setInspection("efficiency")}
          >
            View M1 efficiency preview <ArrowRight size={15} />
          </button>
        </InspectionDialog>
      )}
      {inspection === "efficiency" && (
        <InspectionDialog title="Your driving rhythm" onClose={close}>
          <Efficiency
            history={snapshot.history}
            averageMpg={snapshot.averageMpg}
          />
        </InspectionDialog>
      )}
      {inspection === "journey" && (
        <InspectionDialog title="Run information" onClose={close}>
          <div className="vehicle-identity">
            <Truck size={25} />
            <div>
              <strong>{vehicle.name}</strong>
              <p>
                {vehicle.tank_capacity_gallons} gal tank · diesel · profile{" "}
                {vehicle.typical_mpg} MPG
              </p>
            </div>
          </div>
          <dl className="journey-facts">
            <div>
              <dt>Route progress</dt>
              <dd>
                {number(route.currentDistanceAlongRouteMiles)} /{" "}
                {number(snapshot.totalMiles)} modeled miles · {progress}%
              </dd>
            </div>
            <div>
              <dt>Trip</dt>
              <dd>San Antonio → Austin</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>
                {telemetry.latitude ?? "Unknown"},{" "}
                {telemetry.longitude ?? "Unknown"} · synthetic GPS
              </dd>
            </div>
            <div>
              <dt>Reading</dt>
              <dd>
                {playback.index + 1}/{playback.total} · {telemetry.timestamp}
              </dd>
            </div>
            <div>
              <dt>AI</dt>
              <dd>
                {intelligence.available
                  ? "Gemma configured"
                  : "Deterministic fallback"}
              </dd>
            </div>
          </dl>
          <p>
            Synthetic 241-reading M2 dataset. Fictional M3 station prices and
            modeled route/detours. Not live navigation or real vehicle
            telemetry.
          </p>
          <div className="scenario-controls">
            <button
              className="outline-button"
              onClick={() => {
                app.pause();
                app.seekTo(160);
                close();
              }}
            >
              Seek to simulated P0301
            </button>
            <button
              className="outline-button"
              onClick={() => {
                app.pause();
                app.seekTo(240);
                close();
              }}
            >
              Seek to critical-fuel ending
            </button>
          </div>
        </InspectionDialog>
      )}
    </div>
  );
}
