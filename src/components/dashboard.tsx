"use client";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  LayoutDashboard,
  Fuel,
  Activity,
  ChartNoAxesCombined,
  History,
  Settings,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
  Check,
  TriangleAlert,
  Gauge,
  Navigation,
  Truck,
  Menu,
  X,
  Play,
  Pause,
  RotateCcw,
  Clock,
  Database,
  Info,
  ChevronRight,
  Thermometer,
  SlidersHorizontal,
  Sparkles,
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
  type FuelState,
  type Station,
} from "@/lib/mock-data";
const nav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "fuel", label: "Fuel intelligence", icon: Fuel },
  { id: "health", label: "Vehicle health", icon: Activity },
  { id: "efficiency", label: "Efficiency insights", icon: ChartNoAxesCombined },
  { id: "history", label: "Trip history", icon: History },
  { id: "settings", label: "Settings", icon: Settings },
];
function Logo() {
  return (
    <Image
      src="/brand/symbol-color.svg"
      width={350}
      height={265}
      alt=""
      aria-hidden="true"
      className="brand-symbol"
    />
  );
}
export default function Dashboard() {
  const stationOpener = useRef<HTMLElement | null>(null);
  function openStation(next: Station) {
    stationOpener.current = document.activeElement as HTMLElement | null;
    setStation(next);
  }
  const [active, setActive] = useState("dashboard");
  const [menu, setMenu] = useState(false);
  const [fuelState, setFuelState] = useState<FuelState>("normal");
  const [station, setStation] = useState<Station | null>(null);
  const [details, setDetails] = useState(false);
  const [speed, setSpeed] = useState("1");
  const state = fuelStates[fuelState];
  const range = rangeFor(state.percent);
  useEffect(() => {
    if (!station) return;
    return () => stationOpener.current?.focus();
  }, [station]);
  function closeMenu() {
    setMenu(false);
    document.getElementById("mobile-nav-toggle")?.focus();
  }
  function navigate(id: string) {
    setActive(id);
    setMenu(false);
    const target = document.getElementById(id);
    target?.setAttribute("tabindex", "-1");
    target?.focus({ preventScroll: true });
    target?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  }
  return (
    <div className="app-shell">
      <a href="#dashboard" className="skip-link">
        Skip to dashboard
      </a>
      <aside
        className={`sidebar ${menu ? "open" : ""}`}
        inert={station !== null}
        onKeyDown={(e) => {
          if (e.key === "Escape") closeMenu();
        }}
      >
        <a
          href="#dashboard"
          className="brand"
          onClick={() => navigate("dashboard")}
        >
          <Image
            src="/brand/logo-horizontal-color.svg"
            width={720}
            height={200}
            alt="Cruze FuelSense"
            className="brand-lockup"
            priority
          />
        </a>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={closeMenu}
        >
          <X />
        </button>
        <p className="sidebar-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {nav.map(({ id, label, icon: Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              aria-current={active === id ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                navigate(id);
              }}
            >
              <Icon size={18} />
              <span>{label}</span>
              {active === id && <i />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="vehicle-mini">
            <Truck size={20} />
            <div>
              <strong>{vehicle.id}</strong>
              <span>{vehicle.model}</span>
            </div>
            <i className="dot teal-dot" />
          </div>
          <p>Drive Smarter. Further.</p>
          <span>CRUZE MAPS · MILESTONE 01</span>
        </div>
      </aside>
      {menu && (
        <button
          className="menu-backdrop"
          onClick={closeMenu}
          aria-label="Close menu"
        />
      )}
      <div className="main-shell" inert={station !== null}>
        <header className="topbar">
          <div className="header-vehicle">
            <button
              id="mobile-nav-toggle"
              className="mobile-menu icon-button"
              aria-label="Open navigation"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <div className="truck-icon" aria-hidden="true">
              <Logo />
            </div>
            <div>
              <strong>{vehicle.name}</strong>
              <span>
                {vehicle.id} <i /> San Antonio → Austin
              </span>
            </div>
          </div>
          <div className="header-status">
            <span className="demo-indicator">
              <i className="dot teal-dot" /> Dataset demo mode
            </span>
            <span className="status">
              <i className="dot amber-dot" /> Caution
            </span>
            <button
              onClick={() => navigate("settings")}
              className="avatar"
              aria-label="View demo settings"
            >
              CF
            </button>
          </div>
        </header>
        <main id="dashboard">
          <div className="page-title">
            <div>
              <h1>A better sense of the road.</h1>
              <p>Your vehicle, your journey. Every mile connected.</p>
            </div>
            <span className="snapshot">
              <Clock size={14} /> Demo snapshot · 10:24:36 AM
            </span>
          </div>
          <div className="demo-note">
            <Info size={14} />
            <span>
              Interactive UI preview. Telemetry, stations, diagnostics, and
              insights are simulated.
            </span>
          </div>
          <section className="overview" aria-label="Vehicle overview">
            <div className="fuel-overview">
              <div className={`fuel-ring ${fuelState}`}>
                <svg viewBox="0 0 100 100" aria-hidden="true">
                  <circle cx="50" cy="50" r="42" className="ring-bg" />
                  <circle
                    cx="50"
                    cy="50"
                    r="42"
                    className="ring-value"
                    strokeDasharray={`${state.percent * 2.639} 264`}
                  />
                </svg>
                <div>
                  <strong>
                    {state.percent}
                    <small>%</small>
                  </strong>
                  <Fuel size={14} />
                </div>
              </div>
              <div>
                <span className="metric-label">Fuel level</span>
                <strong>
                  {((120 * state.percent) / 100).toFixed(1)} <small>gal</small>
                </strong>
                <p>of 120 gal capacity</p>
              </div>
            </div>
            <div className="metric">
              <span className="metric-label">
                <Gauge size={15} /> Vehicle speed
              </span>
              <strong>
                58 <small>MPH</small>
              </strong>
              <p>
                <i className="dot teal-dot" /> Cruising steadily
              </p>
            </div>
            <div className="metric">
              <span className="metric-label">
                <Activity size={15} /> Engine speed
              </span>
              <strong>
                1,500 <small>RPM</small>
              </strong>
              <p>Within operating band</p>
            </div>
            <div className="metric">
              <span className="metric-label">
                <Navigation size={15} /> Remaining range
              </span>
              <strong>
                {range.toFixed(1)} <small>mi</small>
              </strong>
              <p>Full fuel-based estimate</p>
            </div>
            <div className="metric">
              <span className="metric-label">
                <ChartNoAxesCombined size={15} /> Average economy
              </span>
              <strong>
                8.0 <small>MPG</small>
              </strong>
              <p>Trip average · simulated</p>
            </div>
            <div className="metric engine-metric">
              <span className="metric-label">
                <Activity size={15} /> Engine status
              </span>
              <strong className="caution">
                <TriangleAlert size={19} /> Caution
              </strong>
              <p>1 diagnostic to review</p>
              <button
                className="text-button"
                onClick={() => navigate("health")}
              >
                View health <ArrowUpRight size={13} />
              </button>
            </div>
          </section>
          <div className="journey-grid">
            <RouteMap onStation={openStation} />
            <section id="fuel" className={`panel fuel-panel ${fuelState}`}>
              <div className="panel-heading">
                <div>
                  <h2>Fuel intelligence</h2>
                  <p>A little foresight. A longer journey.</p>
                </div>
                <Fuel size={20} className="teal-text" />
              </div>
              <div className="preview-label">
                <span>PREVIEW FUEL STATE</span>
                <Info size={12} />
              </div>
              <div className="segmented">
                {(["normal", "low", "critical"] as FuelState[]).map((s) => (
                  <button
                    key={s}
                    aria-pressed={s === fuelState}
                    onClick={() => setFuelState(s)}
                  >
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
              <div className="fuel-status">
                <span className="status-symbol">
                  {fuelState === "normal" ? (
                    <Check size={17} />
                  ) : (
                    <TriangleAlert size={17} />
                  )}
                </span>
                <div>
                  <strong>{state.label}</strong>
                  <p>{state.description}</p>
                </div>
              </div>
              <div className="fuel-bar">
                <span style={{ width: `${state.percent}%` }} />
              </div>
              <div className="fuel-bar-label">
                <span>{state.percent}% remaining</span>
                <strong>{range.toFixed(1)} mi range</strong>
              </div>
              <div className="station-heading">
                <span>YOUR NEXT FUEL STOP</span>
                <span className="chip teal">RECOMMENDED</span>
              </div>
              <button
                className="recommended-station"
                onClick={() => openStation(stations[0])}
              >
                <div className="station-name">
                  <div>
                    <h3>Bluebonnet Travel Stop</h3>
                    <p>New Braunfels · I-35 North</p>
                  </div>
                  <ArrowUpRight size={18} />
                </div>
                <div className="station-numbers">
                  <div>
                    <strong>
                      12 <small>mi</small>
                    </strong>
                    <span>ahead</span>
                  </div>
                  <div>
                    <strong>
                      +3 <small>min</small>
                    </strong>
                    <span>detour</span>
                  </div>
                  <div>
                    <strong>$3.49</strong>
                    <span>per gallon · diesel</span>
                  </div>
                </div>
                <span className="station-reason">
                  <Sparkles size={13} /> Low sample price. Minimal detour.
                </span>
              </button>
              <p className="fictional">
                Fictional station · illustrative price
              </p>
              <div className="alternatives-title">
                Other stops on your route <span>2 options</span>
              </div>
              {stations.slice(1).map((s) => (
                <button
                  className="alternative"
                  key={s.id}
                  onClick={() => openStation(s)}
                >
                  <Fuel size={15} />
                  <div>
                    <strong>{s.name}</strong>
                    <span>
                      {s.distance} mi away · +{s.detour} min
                    </span>
                  </div>
                  <strong>${s.price.toFixed(2)}</strong>
                  <ChevronRight size={14} />
                </button>
              ))}
            </section>
          </div>
          <div className="lower-grid">
            <section id="health" className="panel health">
              <div className="panel-heading">
                <div>
                  <h2>Vehicle health</h2>
                  <p>Understand what your engine is telling you.</p>
                </div>
                <span className="chip amber">1 CAUTION</span>
              </div>
              <div className="health-summary">
                <div>
                  <Thermometer size={19} />
                  <span>Engine temperature</span>
                  <strong>{telemetry.temperature}°F</strong>
                  <small>Normal band: 180–220°F · demo</small>
                </div>
                <div>
                  <Activity size={19} />
                  <span>Overall status</span>
                  <strong className="caution">Needs attention</strong>
                  <small>Illustrative diagnostic event</small>
                </div>
              </div>
              <button
                className="diagnostic-toggle"
                aria-expanded={details}
                aria-controls="diagnostic-details"
                onClick={() => setDetails(!details)}
              >
                <div className="diagnostic-icon">
                  <TriangleAlert size={19} />
                </div>
                <div>
                  <span className="code">
                    P0301 <span>CAUTION</span>
                  </span>
                  <strong>Cylinder 1 misfire detected</strong>
                  <p>Demo signal · not a confirmed diagnosis</p>
                </div>
                <ChevronDown size={18} className={details ? "rotate" : ""} />
              </button>
              {details && (
                <div id="diagnostic-details" className="diagnostic-details">
                  <h3>What this code can mean</h3>
                  <p>
                    P0301 indicates an observed misfire in cylinder 1. A code
                    alone cannot establish a cause, especially across different
                    engine types.
                  </p>
                  <h3>Possible causes</h3>
                  <p>
                    Fuel delivery, injector wiring, or compression issues. Spark
                    ignition systems may also have plug or coil faults.
                  </p>
                  <h3>Suggested next steps</h3>
                  <p>
                    Review the vehicle service manual and have a qualified
                    technician inspect it. If the engine runs roughly or a
                    warning flashes, stop safely and seek assistance.
                  </p>
                  <small>Illustrative reference content only.</small>
                </div>
              )}
              <div className="events-title">
                RECENT EVENTS <span>THIS TRIP</span>
              </div>
              {diagnosticEvents.map((e) => (
                <div key={e.time} className="event">
                  <span
                    className={`dot ${e.severity === "caution" ? "amber-dot" : "teal-dot"}`}
                  />
                  <span>{e.title}</span>
                  <time>{e.time} AM</time>
                </div>
              ))}
            </section>
            <Efficiency />
          </div>
          <section
            className="panel playback"
            aria-label="Dataset playback preview"
          >
            <div className="playback-label">
              <Database size={19} />
              <div>
                <strong>Dataset playback</strong>
                <span>Preview · available in Milestone 2</span>
              </div>
            </div>
            <div className="playback-controls">
              <button disabled aria-label="Play preview unavailable">
                <Play size={17} />
              </button>
              <button disabled aria-label="Pause preview unavailable">
                <Pause size={17} />
              </button>
              <button disabled aria-label="Reset preview unavailable">
                <RotateCcw size={16} />
              </button>
            </div>
            <div className="timeline">
              <div>
                <span />
                <i />
              </div>
              <span>
                00:24:36 <small>/ 01:22:00 · static preview</small>
              </span>
            </div>
            <label className="speed-select">
              Preview speed
              <select
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                aria-label="Preview playback speed"
              >
                {["1", "2", "5"].map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </label>
            <span className="dataset-source">
              Source: mock fixture
              <br />
              <small>No dataset loaded</small>
            </span>
          </section>
          <div className="utility-grid">
            <section id="history" className="panel utility">
              <History size={18} />
              <div>
                <h2>Trip history</h2>
                <p>San Antonio → Austin · Current demo journey</p>
                <span>
                  Saved trips will be available after dataset integration.
                </span>
              </div>
              <span className="chip muted">PREVIEW</span>
            </section>
            <section id="settings" className="panel utility">
              <SlidersHorizontal size={18} />
              <div>
                <h2>Demo settings</h2>
                <p>Dark appearance · MPH · miles · US gallons</p>
                <span>Fixed display preferences for Milestone 1.</span>
              </div>
              <span className="chip muted">PREVIEW</span>
            </section>
          </div>
          <footer>
            <span>
              <Logo /> Cruze FuelSense <span>Drive Smarter. Further.</span>
            </span>
            <p>Milestone 01 · Frontend demonstration</p>
          </footer>
        </main>
      </div>
      {station && (
        <div className="drawer-backdrop" onClick={() => setStation(null)}>
          <section
            className="station-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="station-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setStation(null);
              if (e.key === "Tab") {
                const controls =
                  e.currentTarget.querySelectorAll<HTMLButtonElement>("button");
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first.focus();
                }
              }
            }}
          >
            <button
              autoFocus
              className="icon-button drawer-close"
              onClick={() => setStation(null)}
              aria-label="Close station details"
            >
              <X />
            </button>
            <div className="drawer-fuel">
              <Fuel size={30} />
            </div>
            <span className="chip blue">FICTIONAL DEMO STATION</span>
            <h2 id="station-title">{station.name}</h2>
            <p>{station.area}</p>
            <div className="drawer-price">
              ${station.price.toFixed(2)}
              <span>/ gallon · sample diesel price</span>
            </div>
            <div className="station-numbers">
              <div>
                <strong>{station.distance} mi</strong>
                <span>distance ahead</span>
              </div>
              <div>
                <strong>+{station.detour} min</strong>
                <span>estimated detour</span>
              </div>
            </div>
            <div className="insight">
              <Info size={18} />
              <p>
                {station.id === recommendation.stationId
                  ? recommendation.reason
                  : "Alternative demo stop along the schematic route. Position and price are illustrative."}
              </p>
            </div>
            <p>
              At the selected fuel level, {range.toFixed(1)} miles of estimated
              range {range >= station.distance ? "covers" : "does not cover"}{" "}
              the distance to this stop. No reserve or real-world conditions are
              included.
            </p>
            <button className="primary-button" onClick={() => setStation(null)}>
              Back to journey <ArrowRight size={17} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
