import { describe, expect, it } from "vitest";
import {
  bearingAtProgress,
  geometryDistances,
  nearestRoutePosition,
} from "../road-geometry";

describe("road position and heading", () => {
  it.each([
    { name: "north", coordinates: [[-98, 29], [-98, 30]], bearing: 0 },
    { name: "east", coordinates: [[-98, 29], [-97, 29]], bearing: 90 },
    { name: "south", coordinates: [[-98, 30], [-98, 29]], bearing: 180 },
    { name: "west", coordinates: [[-97, 29], [-98, 29]], bearing: 270 },
  ])("points the vehicle toward $name", ({ coordinates, bearing }) => {
    const cumulative = geometryDistances(coordinates);
    expect(bearingAtProgress(coordinates, cumulative, 0.5)).toBeCloseTo(bearing, 5);
  });

  it("turns with the outgoing road segment and remains oriented at the route end", () => {
    const coordinates = [[0, 0], [1, 0], [1, 1]];
    const cumulative = geometryDistances(coordinates);
    expect(bearingAtProgress(coordinates, cumulative, 0.25)).toBeCloseTo(90, 5);
    expect(bearingAtProgress(coordinates, cumulative, 0.5)).toBeCloseTo(0, 5);
    expect(bearingAtProgress(coordinates, cumulative, 1)).toBeCloseTo(0, 5);
  });

  it("projects fuel-stop coordinates onto the real road line", () => {
    const coordinates = [[-98, 29], [-97, 29]];
    const cumulative = geometryDistances(coordinates);
    const position = nearestRoutePosition(coordinates, cumulative, [-97.5, 29.1]);
    expect(position.distanceAlongMeters).toBeCloseTo(cumulative.at(-1)! / 2, -1);
    expect(position.distanceFromRouteMeters).toBeGreaterThan(10_000);
    expect(Number.isFinite(position.distanceFromRouteMeters)).toBe(true);
  });
});
