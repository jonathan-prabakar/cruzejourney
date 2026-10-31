"use client";
import { Navigation, Fuel } from "lucide-react";
import type { FuelStation } from "@/lib/fuel/types";
import type { VehicleTelemetry } from "@/lib/telemetry/types";
import { projectDemoLocation } from "@/lib/integration/snapshot";
export default function RouteMap({
  onStation,
  telemetry,
  stations,
  recommendedId,
}: {
  onStation: (station: FuelStation, trigger: HTMLElement | SVGElement) => void;
  telemetry: VehicleTelemetry;
  stations: readonly FuelStation[];
  recommendedId: string | null;
}) {
  const position = projectDemoLocation(telemetry.latitude, telemetry.longitude);
  return (
    <section className="route-map" aria-label="Schematic route to Austin">
      <div className="map-canvas">
        <svg
          viewBox="0 0 800 510"
          preserveAspectRatio="none"
          role="group"
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
          <g fontSize="11" fill="#8ca1b8" fontFamily="sans-serif">
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
          {stations.map((station) => {
            const point = projectDemoLocation(
              station.latitude,
              station.longitude,
            );
            if (!point) return null;
            return (
              <g
                key={station.id}
                transform={`translate(${point.x} ${point.y})`}
                className={`station-marker ${station.id === recommendedId ? "recommended-marker" : ""}`}
                role="button"
                tabIndex={0}
                aria-label={`View fictional ${station.name}`}
                onClick={(event) => onStation(station, event.currentTarget)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onStation(station, event.currentTarget);
                  }
                }}
              >
                <rect x="-12" y="-12" width="24" height="24" rx="4" />
                <Fuel x={-7} y={-7} width={14} height={14} />
              </g>
            );
          })}
          {position && (
            <g
              transform={`translate(${position.x} ${position.y})`}
              role="img"
              aria-label={`Vehicle synthetic GPS ${telemetry.latitude}, ${telemetry.longitude}`}
              className="vehicle-position"
            >
              <circle r="22" fill="#00d1a7" opacity=".1" />
              <circle r="13" fill="#00d1a7" stroke="#0a0f1c" strokeWidth="4" />
              <path d="M0 -7L6 7 0 4 -6 7Z" fill="#082d29" />
            </g>
          )}
        </svg>
        <div className="map-compass">
          <Navigation size={15} />
          <span>N</span>
        </div>
      </div>
    </section>
  );
}
