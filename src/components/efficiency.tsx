"use client";
import { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import { TrendingUp, Sparkles } from "lucide-react";
import { comparison } from "@/lib/mock-data";
import { demoDataset, formatDemoTime } from "@/lib/integration/snapshot";
import type { VehicleTelemetry } from "@/lib/telemetry/types";
export default function Efficiency({
  history,
  averageMpg,
  initialFuelPercent = demoDataset.records[0].fuel_percent,
  tankCapacity = demoDataset.metadata.vehicle.tank_capacity_gallons,
}: {
  history: readonly VehicleTelemetry[];
  averageMpg: number;
  initialFuelPercent?: number;
  tankCapacity?: number;
}) {
  const start = initialFuelPercent;
  const efficiencyHistory = history
    .filter((_, i) => i % 4 === 0 || i === history.length - 1)
    .map((r) => ({
      time: formatDemoTime(r.timestamp),
      gallons:
        ((start - r.fuel_percent) / 100) *
        tankCapacity,
    }));
  const currentMpg = history.at(-1)?.mpg ?? null;
  const used = efficiencyHistory.at(-1)?.gallons ?? 0;
  const [view, setView] = useState<"trend" | "compare">("trend");
  return (
    <section id="efficiency" className="panel efficiency">
      <div className="panel-heading">
        <div>
          <h2>Efficiency insights</h2>
          <p>M2 telemetry · M1 illustrative comparison</p>
        </div>
        <span className="chip muted">SIMULATED</span>
      </div>
      <div className="efficiency-stats">
        <div>
          <span>Current economy</span>
          <strong>
            {currentMpg?.toFixed(1) ?? "—"} <small>MPG</small>
          </strong>
        </div>
        <div>
          <span>Trip average</span>
          <strong>
            {averageMpg.toFixed(1)} <small>MPG</small>
          </strong>
        </div>
        <div className="trend">
          <TrendingUp size={17} />
          <strong>{history.length}</strong>
          <span>prefix readings</span>
        </div>
      </div>
      <button
        className="outline-button comparison-switch"
        onClick={() => setView(view === "trend" ? "compare" : "trend")}
      >
        {view === "trend" ? "Compare driving styles" : "Show consumption trend"}{" "}
        <TrendingUp size={15} />
      </button>
      <div
        className="chart"
        role="img"
        aria-label={
          view === "trend"
            ? `Synthetic cumulative fuel use through the current reading: ${used.toFixed(2)} gallons`
            : "Simulated smooth driving gets 8 MPG; stop and go gets 6.4 MPG"
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          {view === "trend" ? (
            <AreaChart
              data={efficiencyHistory}
              margin={{ top: 16, right: 12, left: -22, bottom: 0 }}
            >
              <defs>
                <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#00d1a7" stopOpacity={0.22} />
                  <stop offset="1" stopColor="#00d1a7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                vertical={false}
                stroke="#2b3648"
                strokeDasharray="3 5"
              />
              <XAxis
                dataKey="time"
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                minTickGap={25}
              />
              <YAxis
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                unit="g"
              />
              <Tooltip
                contentStyle={{
                  background: "#1a2233",
                  border: "1px solid #2b3648",
                  borderRadius: 8,
                  color: "#f8fafc",
                }}
              />
              <Area
                dataKey="gallons"
                name="Fuel used (gal)"
                stroke="#00d1a7"
                fill="url(#area)"
                strokeWidth={2.5}
                isAnimationActive={false}
              />
            </AreaChart>
          ) : (
            <BarChart
              data={comparison}
              margin={{ top: 16, left: -22, right: 12, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#2b3648" />
              <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 12 }} />
              <YAxis unit=" MPG" tick={{ fill: "#94a3b8", fontSize: 10 }} />
              <Tooltip
                contentStyle={{
                  background: "#1a2233",
                  border: "1px solid #2b3648",
                }}
              />
              <Bar
                dataKey="mpg"
                radius={[5, 5, 0, 0]}
                maxBarSize={74}
                isAnimationActive={false}
              >
                {comparison.map((d, i) => (
                  <Cell key={d.name} fill={i ? "#00d1a7" : "#3b82f6"} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="insight">
        <Sparkles size={17} />
        <p>
          {view === "trend"
            ? `M2 fuel used since the first reading: ${used.toFixed(2)} gallons. Current-prefix trip average: ${averageMpg.toFixed(1)} MPG.`
            : "M1 preview only: fixed 80-mile scenarios at 8 and 6.4 MPG use 10 and 12.5 gallons. This is not the current trip, a real saving, or an M5 analysis."}
        </p>
      </div>
    </section>
  );
}
