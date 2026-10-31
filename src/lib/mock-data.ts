export type FuelState = "normal" | "low" | "critical";
export interface Station {
  id: string;
  name: string;
  area: string;
  distance: number;
  detour: number;
  price: number;
  x: number;
  y: number;
}
export interface DiagnosticEvent {
  time: string;
  code: string;
  title: string;
  severity: "caution" | "normal";
}
export const vehicle = {
  name: "Demo Freight Truck",
  model: "Class 8 · Diesel",
  id: "CF–2048",
  tankGallons: 120,
};
export const telemetry = {
  speed: 58,
  rpm: 1500,
  mpg: 8,
  temperature: 198,
  timestamp: "10:24:36",
  fuelPercent: 32,
};
export const fuelStates: Record<
  FuelState,
  { percent: number; label: string; description: string }
> = {
  normal: {
    percent: 32,
    label: "Comfortable range",
    description: "Enough fuel to reach Austin with a generous buffer.",
  },
  low: {
    percent: 12,
    label: "Plan a fuel stop",
    description: "Refuel at the next stop. Your remaining range is limited.",
  },
  critical: {
    percent: 4,
    label: "Fuel stop required",
    description:
      "Two demo stops remain within range. Refuel as soon as safely possible.",
  },
};
export const route = {
  origin: "San Antonio",
  destination: "Austin",
  totalMiles: 80,
  remainingMiles: 56,
  elapsedMiles: 24,
  remainingMinutes: 58,
  arrival: "11:23 AM",
  departure: "10:00 AM",
};
export const stations: Station[] = [
  {
    id: "01",
    name: "Bluebonnet Travel Stop",
    area: "New Braunfels · I-35 North",
    distance: 12,
    detour: 3,
    price: 3.49,
    x: 438,
    y: 339,
  },
  {
    id: "02",
    name: "Lone Star Fuel",
    area: "San Marcos · I-35 North",
    distance: 27,
    detour: 5,
    price: 3.59,
    x: 545,
    y: 231,
  },
  {
    id: "03",
    name: "Hill Country Express",
    area: "Kyle · I-35 North",
    distance: 39,
    detour: 4,
    price: 3.55,
    x: 614,
    y: 169,
  },
];
export const recommendation = {
  stationId: "01",
  reason:
    "Lowest sample price on this route, with a short 3-minute detour. Selected demo recommendation; no ranking algorithm is running.",
};
export const diagnosticEvents: DiagnosticEvent[] = [
  {
    time: "10:22",
    code: "P0301",
    title: "Cylinder 1 misfire signal",
    severity: "caution",
  },
  {
    time: "10:00",
    code: "SYSTEM",
    title: "Pre-trip system check complete",
    severity: "normal",
  },
];
export const efficiencyHistory = [
  { time: "10:00", mpg: 7.1, gallons: 0 },
  { time: "10:05", mpg: 7.5, gallons: 0.5 },
  { time: "10:10", mpg: 7.3, gallons: 1.1 },
  { time: "10:15", mpg: 8.1, gallons: 1.7 },
  { time: "10:20", mpg: 8.5, gallons: 2.4 },
  { time: "10:25", mpg: 8, gallons: 3 },
];
export const comparison = [
  { name: "Stop & go", mpg: 6.4 },
  { name: "Smooth driving", mpg: 8 },
];
export function rangeFor(percent: number) {
  return ((vehicle.tankGallons * percent) / 100) * telemetry.mpg;
}
