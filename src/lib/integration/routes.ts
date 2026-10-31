export const routeIds = ["austin", "dallas", "houston", "el-paso"] as const;
export type DemoRouteId = (typeof routeIds)[number];
export function isDemoRouteId(value: unknown): value is DemoRouteId {
  return routeIds.some((id) => id === value);
}
export const destinationDefinitions = {
  austin: {
    destination: "Austin",
    corridor: "I-35 North",
    miles: 79.3,
    fuel: 17,
    end: [30.2672, -97.7431],
  },
  dallas: {
    destination: "Dallas",
    corridor: "I-35 North",
    miles: 275,
    fuel: 39,
    end: [32.7767, -96.797],
  },
  houston: {
    destination: "Houston",
    corridor: "I-10 East",
    miles: 200,
    fuel: 31,
    end: [29.7604, -95.3698],
  },
  "el-paso": {
    destination: "El Paso",
    corridor: "I-10 West",
    miles: 550,
    fuel: 70,
    end: [31.7619, -106.485],
  },
};
