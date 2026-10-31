"use client";
import {
  destinationDefinitions,
  routeIds,
  type DemoRouteId,
} from "@/lib/integration/routes";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { formatDemoTime, formatDuration } from "@/lib/integration/snapshot";
import type { FuelStation } from "@/lib/fuel/types";
import type { RoutePlan } from "@/lib/integration/road-routes";
import type { RunDuration, PlaybackSpeed } from "@/lib/telemetry/types";
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
  const [routeId, setRouteId] = useState<DemoRouteId>("austin");
  const [plan, setPlan] = useState<RoutePlan | undefined>();
  const [duration, setDuration] = useState<RunDuration | null>(null);
  return (
    <DrivingSession
      key={plan?.id ?? routeId}
      routeId={routeId}
      plan={plan}
      initialDuration={duration}
      onRouteChange={(id) => {
        setPlan(undefined);
        setRouteId(id);
      }}
      onPlan={(next, seconds) => {
        setDuration(seconds);
        setPlan(next);
      }}
      onOriginal={() => setPlan(undefined)}
    />
  );
}
function DrivingSession({
  routeId,
  plan,
  initialDuration,
  onRouteChange,
  onPlan,
  onOriginal,
}: {
  routeId: DemoRouteId;
  plan?: RoutePlan;
  initialDuration: RunDuration | null;
  onRouteChange: (id: DemoRouteId) => void;
  onPlan: (plan: RoutePlan, duration: RunDuration | null) => void;
  onOriginal: () => void;
}) {
  const app = useIntegratedVehicle(routeId, true, plan, initialDuration);
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
  const [routing, setRouting] = useState(false);
  const [routingError, setRoutingError] = useState("");
  const [routeNotice, setRouteNotice] = useState("");
  const routeAbort = useRef<AbortController | null>(null);
  const routingLock = useRef(false);
  const routeOperations = useRef({
    pauseForRouting: app.pauseForRouting,
    duration: playback.run_duration_seconds,
  });
  useEffect(() => {
    routeOperations.current = {
      pauseForRouting: app.pauseForRouting,
      duration: playback.run_duration_seconds,
    };
  }, [app.pauseForRouting, playback.run_duration_seconds]);
  const autoRerouteAttempted = useRef<string | null>(null);
  useEffect(() => () => routeAbort.current?.abort(), []);
  const routeToStation = useCallback(async (target: FuelStation, automatic = false) => {
    if (routingLock.current) return;
    routingLock.current = true;
    if (automatic)
      setRouteNotice(`Fuel range is shorter than this trip. Rerouting to ${target.name}…`);
    const index = routeOperations.current.pauseForRouting();
    const abort = new AbortController();
    routeAbort.current?.abort();
    routeAbort.current = abort;
    setRouting(true);
    setRoutingError("");
    try {
      const response = await fetch("/api/route-to-station", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          routeId,
          index,
          stationId: target.id,
          ...(plan ? { planId: plan.id } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error ?? "Unable to route to this stop.");
      if (!abort.signal.aborted)
        onPlan(data as RoutePlan, routeOperations.current.duration ?? null);
    } catch (error) {
      if (!abort.signal.aborted) {
        const message = error instanceof Error ? error.message : "Routing failed. Try again.";
        setRoutingError(message);
        if (automatic) setRouteNotice(`Automatic fuel-stop reroute failed: ${message}`);
      }
    } finally {
      routingLock.current = false;
      if (!abort.signal.aborted) setRouting(false);
    }
  }, [onPlan, plan, routeId]);
  useEffect(() => {
    if (plan || fuel.status.routeSafety !== "INSUFFICIENT_RANGE") return;
    const key = `${routeId}:original-trip`;
    if (autoRerouteAttempted.current === key) return;
    autoRerouteAttempted.current = key;
    if (!recommendation || recommendation.truckAccess !== "yes") {
      routeOperations.current.pauseForRouting();
      return;
    }
    queueMicrotask(() => void routeToStation(recommendation, true));
  }, [plan, routeId, fuel.status.routeSafety, recommendation, routeToStation]);
  const visibleRouteNotice =
    routeNotice ||
    (!plan &&
    fuel.status.routeSafety === "INSUFFICIENT_RANGE" &&
    (!recommendation || recommendation.truckAccess !== "yes")
      ? "No confirmed truck stop is reachable within modeled fuel range. Replay paused; select a reachable stop or seek assistance."
      : "");
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
          : "Health status normal";
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
            <span>{plan ? "Fuel stop route" : "San Antonio"}</span>
            <span className="track-distance">
              {number(route.currentDistanceAlongRouteMiles)} /{" "}
              {number(snapshot.totalMiles)} mi
            </span>
            <strong>
              <select
                aria-label="Destination"
                className="destination-select"
                value={routeId}
                onChange={(event) =>
                  onRouteChange(event.target.value as DemoRouteId)
                }
              >
                {routeIds.map((id) => (
                  <option key={id} value={id}>
                    {destinationDefinitions[id].destination}
                  </option>
                ))}
              </select>{" "}
              <Flag size={12} />
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
            stations={snapshot.stations}
            routeId={routeId}
            recommendedId={recommendation?.id ?? null}
            trip={app.trip}
            getMotionProgress={app.getMotionProgress}
            playing={playback.status === "playing"}
            fastRun={Boolean(playback.run_duration_seconds)}
            onStations={(trigger) => openInspection("stops", trigger)}
          />
        </div>
        <div className="run-heading">
          <h1>
            {plan
              ? "The fuel stop run"
              : `The ${snapshot.definition.destination} run`}
            <span>.</span>
          </h1>
          <p>
            <Navigation size={13} /> {snapshot.definition.corridor}{" "}
            <span>·</span> {number(route.remainingRouteMiles)} road miles to go
          </p>
        </div>
        {plan && (
          <button className="return-to-trip" onClick={onOriginal}>
            Return to {destinationDefinitions[routeId].destination} trip
          </button>
        )}
        <div className="arrival-readout">
          <span>REPLAY ARRIVAL · CT</span>
          <strong>
            {formatDemoTime(snapshot.dataset.records.at(-1)!.timestamp)}
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
                : "FUEL MODEL"}
            </span>
          </div>
          <h3>{recommendation?.name ?? "No eligible mapped stop"}</h3>
          <p className="checkpoint-area">
            {recommendation
              ? "Official diesel · truck parking listed"
              : fuel.status.recommendedAction}
          </p>
          {visibleRouteNotice && (
            <p role="status" className="route-notice">
              {visibleRouteNotice}
            </p>
          )}
          {plan && (
            <p role="status" className="route-notice">
              Rerouted to {plan.trip.destination}. The replay ends at this stop;
              refueling is not simulated.
            </p>
          )}
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
              <span>access allowance</span>
            </div>
            <div>
              <strong>
                {recommendation?.pricePerGallon == null
                  ? "—"
                  : `$${recommendation.pricePerGallon.toFixed(2)}`}
              </strong>
              <span>
                {recommendation?.priceVerifiedAt
                  ? `official · ${recommendation.priceVerifiedAt}`
                  : "price unknown"}
              </span>
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
          {(health.activeCodes.length > 0 || health.overallStatus !== "INFO") && (
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
          )}
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
          <span className="vehicle-key" /> Simulated vehicle{" "}
          <span className="schematic-label">
            VERIFIED TRUCK STOPS · SIMULATED DRIVE
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
              routing ||
              playback.status === "playing" ||
              playback.status === "ended"
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
          <button
            disabled={routing}
            onClick={app.reset}
            aria-label="Reset telemetry"
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <div className="replay-timeline">
          <input
            disabled={routing}
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
          <span>Run length</span>
          <select
            disabled={routing}
            value={
              playback.run_duration_seconds
                ? `${playback.run_duration_seconds}s`
                : String(playback.speed)
            }
            onChange={(event) => {
              const value = event.target.value;
              if (value.endsWith("s")) {
                app.setRunDuration(Number(value.slice(0, -1)) as RunDuration);
                app.reset();
                app.play();
              } else app.setPlaybackSpeed(Number(value) as PlaybackSpeed);
            }}
            aria-label="Simulation duration or playback speed"
          >
            <option value="10s">10 seconds</option>
            <option value="15s">15 seconds</option>
            <option value="20s">20 seconds</option>
            <option value="1">1× real time</option>
            <option value="2">2× speed</option>
            <option value="5">5× speed</option>
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
            VERIFIED TRUCK STOP · {selected?.status ?? "UNKNOWN"}
          </span>
          <p className="fine-print">
            The official Love&apos;s page lists {station.truckParkingSpaces} truck
            parking spaces, {station.defLanes} DEF lanes and diesel. These
            facilities do not confirm current pump availability or truck-legal routing.
          </p>
          {station.address && <p>{station.address}</p>}
          <p>
            {selected?.explanation ??
              "Reachability is unavailable for this reading."}
          </p>
          <div className="station-detail-stats">
            <strong>
              {station.pricePerGallon == null
                ? "Unknown"
                : `$${station.pricePerGallon.toFixed(2)}`}
              <small>
                Auto Diesel per gallon · official price checked {station.priceVerifiedAt ?? "date unavailable"}
              </small>
            </strong>
            <div>
              <b>{number(selected?.routeDistanceMiles)} mi</b>
              <span>along route</span>
            </div>
            <div>
              <b>+{number(station.detourMiles)} mi</b>
              <span>routed access allowance</span>
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
          {routingError && (
            <p role="alert" className="routing-error">
              {routingError}
            </p>
          )}
          <button
            className="primary-button"
            disabled={
              routing ||
              station.truckAccess !== "yes" ||
              playback.status === "ended"
            }
            onClick={() => void routeToStation(station)}
          >
            <Navigation size={16} />{" "}
            {routing ? "Finding road route…" : "Route to this station"}
          </button>
          <p className="fine-print">
            Routes from the current replay position and ends at this stop. Does
            not simulate purchasing fuel. Road routing uses a general driving
            profile, not truck-specific dimensions or restrictions.
          </p>
          {station.sourceUrl && (
            <a
              className="outline-button"
              href={station.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              Official station details and current price
            </a>
          )}
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
              <dd>{number(route.remainingRouteMiles)} road mi</dd>
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
            Simulated vehicle readings on cached road routes. Stops are
            confirmed from official Love&apos;s pages that list truck parking,
            DEF lanes and diesel. Listed facilities do not confirm current pump
            availability. Prices were checked 2026-10-31 and are not live; the
            router uses a general driving profile, not truck-specific navigation.
          </p>
        </InspectionDialog>
      )}
      {inspection === "stops" && (
        <InspectionDialog
          title={`Verified truck stops (${snapshot.stations.length})`}
          onClose={close}
        >
          <p>
            Every stop on this map is listed by Love&apos;s with diesel,
            commercial-truck parking and DEF lanes. Prices are checked
            snapshots; operating status and pump availability are not live.
          </p>
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
                    {a.status} ·{" "}
                    {a.station.truckParkingSpaces} truck spaces ·{" "}
                    {a.station.defLanes} DEF lanes ·{" "}
                    {a.station.distanceAlongRouteMiles === null
                      ? "Route position unknown"
                      : `${number(Math.abs(a.station.distanceAlongRouteMiles - (route.currentDistanceAlongRouteMiles ?? 0)))} mi ${a.station.distanceAlongRouteMiles < (route.currentDistanceAlongRouteMiles ?? 0) ? "behind" : "along route"}`}
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
            history={snapshot.dataset.records.slice(0, playback.index + 1)}
            averageMpg={snapshot.averageMpg}
            initialFuelPercent={snapshot.dataset.records[0].fuel_percent}
            tankCapacity={vehicle.tank_capacity_gallons}
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
                {number(snapshot.totalMiles)} road miles · {progress}%
              </dd>
            </div>
            <div>
              <dt>Trip</dt>
              <dd>
                {plan ? "Current position" : "San Antonio"} →{" "}
                {snapshot.definition.destination}
              </dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>
                {telemetry.latitude ?? "Unknown"},{" "}
                {telemetry.longitude ?? "Unknown"} · simulated road position
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
            {playback.total} simulated vehicle readings on real road geometry,
            with cached OpenStreetMap fuel stations. Mileage is routing-engine
            derived; travel time and fuel consumption are estimates. No live
            navigation, traffic or vehicle connection. Opening status and truck
            suitability are unverified.
          </p>
          <div className="scenario-controls">
            <button
              className="outline-button"
              disabled={
                routing ||
                !snapshot.dataset.records.some(
                  (record) => record.diagnostic_code === "P0301",
                )
              }
              onClick={() => {
                app.pause();
                const diagnostic = snapshot.dataset.records.findIndex(
                  (record) => record.diagnostic_code === "P0301",
                );
                if (diagnostic >= 0) app.seekTo(diagnostic);
                close();
              }}
            >
              Seek to simulated P0301
            </button>
            <button
              className="outline-button"
              onClick={() => {
                app.pause();
                app.seekTo(playback.total - 1);
                close();
              }}
            >
              Seek to trip ending
            </button>
          </div>
        </InspectionDialog>
      )}
    </div>
  );
}
