"use client";
import { Navigation, LocateFixed, Fuel, ArrowUpRight } from "lucide-react";
import { stations, route, type Station } from "@/lib/mock-data";
export default function RouteMap({
  onStation,
}: {
  onStation: (s: Station) => void;
}) {
  return (
    <section className="panel map-panel" aria-labelledby="route-title">
      <div className="panel-heading">
        <div>
          <h2 id="route-title">Your journey</h2>
          <p>
            San Antonio <ArrowUpRight size={12} /> Austin, Texas
          </p>
        </div>
        <span className="chip blue">I-35 NORTH</span>
      </div>
      <div className="map-canvas">
        <svg
          viewBox="0 0 800 510"
          role="img"
          aria-label="Schematic route traveling northeast from San Antonio through New Braunfels and San Marcos to Austin. Fictional fuel stops are selectable below."
        >
          <defs>
            <pattern
              id="blocks"
              width="62"
              height="52"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-17)"
            >
              <path
                d="M 0 0 H 62 V 52 H 0 Z"
                fill="none"
                stroke="#243141"
                strokeWidth="1"
              />
            </pattern>
            <linearGradient id="route" x1="0" y1="1" x2="1" y2="0">
              <stop stopColor="#3B82F6" />
              <stop offset="1" stopColor="#68a4ff" />
            </linearGradient>
          </defs>
          <rect width="800" height="510" fill="#101b28" />
          <path
            d="M0 0H380L280 115 200 180 110 220 0 248Z M570 510L650 370 800 340V510Z"
            fill="#132b2c"
          />
          <path d="M0 0H800V510H0Z" fill="url(#blocks)" opacity=".4" />
          <g fill="none" stroke="#2b3a4b" strokeWidth="3">
            <path d="M0 330Q220 210 800 270" />
            <path d="M120 510Q150 260 360 0" />
            <path d="M0 140Q330 220 800 80" />
            <path d="M300 510L370 370 490 300 690 390 800 400" />
            <path d="M70 440L240 370 450 190 610 120 750 0" />
          </g>
          <path
            d="M0 286Q160 255 240 310T430 300 530 200 800 190"
            fill="none"
            stroke="#254e61"
            strokeWidth="9"
            opacity=".5"
          />
          <g fontSize="11" fill="#6f8197" fontFamily="sans-serif">
            <text x="80" y="85">
              HILL COUNTRY
            </text>
            <text x="90" y="103" fontSize="9">
              TEXAS
            </text>
            <text x="155" y="350">
              SAN ANTONIO
            </text>
            <text x="318" y="365">
              NEW BRAUNFELS
            </text>
            <text x="435" y="219">
              SAN MARCOS
            </text>
            <text x="623" y="135">
              KYLE
            </text>
            <text x="665" y="67">
              AUSTIN
            </text>
            <text x="56" y="254" fill="#487486">
              Canyon Lake
            </text>
            <text x="652" y="454">
              SCHEMATIC · NOT TO SCALE
            </text>
          </g>
          <path
            d="M235 416L286 393 338 382 390 350 428 319 456 287 503 259 536 221 576 197 600 169 637 143 661 114 678 88"
            fill="none"
            stroke="#101b28"
            strokeWidth="15"
          />
          <path
            d="M235 416L286 393 338 382 390 350 428 319 456 287 503 259 536 221 576 197 600 169 637 143 661 114 678 88"
            fill="none"
            stroke="url(#route)"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <path
            d="M235 416L286 393 338 382 372 361"
            fill="none"
            stroke="#63758b"
            strokeWidth="6"
            strokeDasharray="4 6"
          />
          <circle
            cx="235"
            cy="416"
            r="7"
            fill="#101b28"
            stroke="#94a3b8"
            strokeWidth="3"
          />
          <circle
            cx="678"
            cy="88"
            r="8"
            fill="#3b82f6"
            stroke="#dbeafe"
            strokeWidth="3"
          />
          <circle cx="378" cy="358" r="25" fill="#00d1a7" opacity=".1" />
          <circle
            cx="378"
            cy="358"
            r="15"
            fill="#00d1a7"
            stroke="#0a0f1c"
            strokeWidth="4"
          />
          <path d="M378 350L384 364 378 361 372 364Z" fill="#082d29" />
          <rect
            x="495"
            y="296"
            width="31"
            height="22"
            rx="5"
            fill="#23354d"
            stroke="#41668a"
          />
          <text
            x="510"
            y="311"
            textAnchor="middle"
            fill="#c9def6"
            fontSize="11"
          >
            35
          </text>
        </svg>
        <div className="map-compass">
          <Navigation size={16} />
          <span>N</span>
        </div>
        {stations.map((s, i) => (
          <button
            key={s.id}
            className={`station-pin pin-${i}`}
            onClick={() => onStation(s)}
            aria-label={`View fictional ${s.name}`}
          >
            <Fuel size={15} />
            {i === 0 && <span>Best stop · $3.49</span>}
          </button>
        ))}
        <div className="route-summary">
          <div className="route-icon">
            <Navigation size={20} />
          </div>
          <div>
            <strong>
              {route.remainingMinutes} min{" "}
              <span>· {route.remainingMiles} mi</span>
            </strong>
            <p>
              Arrive at {route.arrival} <span>· Via I-35 N</span>
            </p>
          </div>
          <span className="chip teal">ON ROUTE</span>
        </div>
      </div>
      <div className="map-footer">
        <span>
          <i className="legend-line" /> Planned route
        </span>
        <span>
          <i className="dot teal-dot" /> Your vehicle
        </span>
        <span>
          <Fuel size={12} /> Demo fuel stop
        </span>
        <button className="text-button" onClick={() => onStation(stations[0])}>
          <LocateFixed size={14} /> View next stop
        </button>
      </div>
      <p className="map-disclaimer">
        Schematic route visualization. All fuel stations are fictional demo
        data.
      </p>
    </section>
  );
}
