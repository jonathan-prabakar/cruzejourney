import { describe, it, expect } from "vitest";
import {
  diagnosticCodes,
  explainDiagnostic,
  detectDiagnosticEvents,
  assessCoolant,
  assessVehicleHealth,
} from "..";
import demo from "../../../data/demo-telemetry.json";
const row = (i: number, code: string | null) => ({
  ...demo.records[i],
  diagnostic_code: code,
});
describe("diagnostic reference and conservative health", () => {
  it.each(Object.keys(diagnosticCodes))(
    "has a typed reference for %s",
    (code) => {
      const d = explainDiagnostic(code)!;
      expect(d.code).toBe(code);
      expect(d.description.length).toBeGreaterThan(10);
      expect(d.nextSteps.length).toBeGreaterThan(0);
      expect(d.manufacturerInformationNeeded).toBe(true);
    },
  );
  it("interprets P0301 with conditional stopping guidance", () => {
    const d = explainDiagnostic(" p0301 ")!;
    expect(d.severity).toBe("HIGH");
    expect(d.description).toBe("Cylinder 1 misfire detected");
    expect(d.safetyGuidance).toContain("If the engine runs roughly");
    expect(d.safetyGuidance).toContain("stop safely");
  });
  it("provides P0420 without claiming catalyst replacement is certain", () => {
    expect(explainDiagnostic("P0420")?.description).toContain("Catalyst");
    expect(explainDiagnostic("P0420")?.possibleCauses.length).toBeGreaterThan(
      1,
    );
  });
  it("returns unknown guidance for unsupported codes", () =>
    expect(explainDiagnostic("P9999")?.severity).toBe("UNKNOWN"));
  it.each([null, undefined, "", "  "])("handles missing code %s", (code) =>
    expect(explainDiagnostic(code)).toBeNull(),
  );
  it.each([
    [190, "normal"],
    [225, "elevated"],
    [240, "critical"],
    [null, "unknown"],
    [NaN, "unknown"],
  ] as const)("assesses coolant %s as %s", (temp, status) =>
    expect(assessCoolant(temp)).toBe(status),
  );
  it("honors configurable thresholds", () =>
    expect(assessCoolant(210, { elevatedF: 205, criticalF: 230 })).toBe(
      "elevated",
    ));
  it("rejects invalid coolant bands", () =>
    expect(() =>
      assessCoolant(190, { elevatedF: 240, criticalF: 225 }),
    ).toThrow());
  it("does not infer a misfire from RPM or speed", () => {
    const h = assessVehicleHealth(
      { ...row(0, null), rpm: 6000, speed_mph: 80 },
      [],
    );
    expect(h.activeCodes).toEqual([]);
    expect(h.overallStatus).toBe("INFO");
    expect(h.explanation).toContain("does not establish");
  });
  it("marks incomplete measurements unknown", () =>
    expect(assessVehicleHealth({}, []).overallStatus).toBe("UNKNOWN"));
  it("marks missing current telemetry unknown", () =>
    expect(assessVehicleHealth(null, []).overallStatus).toBe("UNKNOWN"));
  it("does not call an unsupported code safe", () =>
    expect(assessVehicleHealth(row(0, "P9999")).overallStatus).toBe("UNKNOWN"));
});
describe("diagnostic episodes and seeking", () => {
  it("observes a current code when optional history is absent", () =>
    expect(assessVehicleHealth(row(0, "P0301")).recentEvents[0].readings).toBe(
      1,
    ));
  it("handles empty history", () =>
    expect(detectDiagnosticEvents([])).toEqual([]));
  it("groups consecutive codes and records first/last timestamps", () => {
    const e = detectDiagnosticEvents([row(0, "P0301"), row(1, "P0301")]);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({
      readings: 2,
      currentlyObserved: true,
      firstObserved: demo.records[0].timestamp,
      lastObserved: demo.records[1].timestamp,
    });
  });
  it("marks disappearance as previously observed, not repaired", () => {
    const e = detectDiagnosticEvents([row(0, "P0301"), row(1, null)]);
    expect(e[0].currentlyObserved).toBe(false);
    expect(e[0].lastObserved).toBe(demo.records[0].timestamp);
  });
  it("separates recurring episodes", () =>
    expect(
      detectDiagnosticEvents([row(0, "P0301"), row(1, null), row(2, "P0301")]),
    ).toHaveLength(2));
  it("separates different codes", () =>
    expect(
      detectDiagnosticEvents([row(0, "P0301"), row(1, "P0420")]),
    ).toHaveLength(2));
  it("sorts chronologically without mutating input", () => {
    const rows = [row(2, "P0301"), row(0, null), row(1, "P0301")];
    const copy = [...rows];
    const e = detectDiagnosticEvents(rows);
    expect(e[0].firstObserved).toBe(demo.records[1].timestamp);
    expect(rows).toEqual(copy);
  });
  it("uses the actual 16-reading P0301 sequence as one episode", () => {
    const e = detectDiagnosticEvents(demo.records);
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({
      code: "P0301",
      readings: 16,
      firstObserved: demo.records[160].timestamp,
      lastObserved: demo.records[175].timestamp,
      currentlyObserved: false,
    });
  });
  it("filters future events when given full history and an earlier current reading", () =>
    expect(
      assessVehicleHealth(demo.records[50], demo.records).recentEvents,
    ).toEqual([]));
  it("reports current and previous observations at the right prefixes", () => {
    expect(
      assessVehicleHealth(demo.records[160], demo.records).activeCodes,
    ).toEqual(["P0301"]);
    expect(
      assessVehicleHealth(demo.records[176], demo.records).activeCodes,
    ).toEqual([]);
    expect(
      assessVehicleHealth(demo.records[176], demo.records).recentEvents[0]
        .currentlyObserved,
    ).toBe(false);
  });
});
