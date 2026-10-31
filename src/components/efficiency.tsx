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
import { efficiencyHistory, comparison } from "@/lib/mock-data";
export default function Efficiency() {
  const [view, setView] = useState<"trend" | "compare">("trend");
  return (
    <section id="efficiency" className="panel efficiency">
      <div className="panel-heading">
        <div>
          <h2>Efficiency insights</h2>
          <p>Small changes. More miles.</p>
        </div>
        <span className="chip muted">SIMULATED</span>
      </div>
      <div className="efficiency-stats">
        <div>
          <span>Current economy</span>
          <strong>
            8.0 <small>MPG</small>
          </strong>
        </div>
        <div>
          <span>Trip average</span>
          <strong>
            8.0 <small>MPG</small>
          </strong>
        </div>
        <div className="trend">
          <TrendingUp size={17} />
          <strong>+12.7%</strong>
          <span>vs. first sample</span>
        </div>
      </div>
      <div className="tabs" aria-label="Efficiency chart">
        <button
          aria-pressed={view === "trend"}
          onClick={() => setView("trend")}
        >
          Consumption trend
        </button>
        <button
          aria-pressed={view === "compare"}
          onClick={() => setView("compare")}
        >
          Driving comparison
        </button>
      </div>
      <div
        className="chart"
        role="img"
        aria-label={
          view === "trend"
            ? "Simulated cumulative fuel use rises from zero to 3 gallons over 25 minutes"
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
            ? "The simulated trip uses 3.0 gallons over 24 miles, averaging 8 MPG. Steady speed supports efficient cruising."
            : "Over a modeled 80-mile trip, 8 MPG uses 10 gallons versus 12.5 at 6.4 MPG: 2.5 gallons less (20%). Illustrative only."}
        </p>
      </div>
    </section>
  );
}
