import { describe, it, expect } from "vitest";
import {
  buildRequestedDateTime,
  chooseRecommendedOption,
} from "../app/lib/entur.js";

describe("buildRequestedDateTime (Oslo wall-clock -> UTC instant)", () => {
  // These must hold no matter what timezone the test (or server) runs in —
  // that was the original bug: times were correct locally but wrong on UTC.
  it("converts a winter time (Oslo = UTC+1)", () => {
    expect(buildRequestedDateTime("2026-03-20", "08:15")).toBe(
      "2026-03-20T07:15:00.000Z",
    );
  });

  it("converts a summer time across DST (Oslo = UTC+2)", () => {
    expect(buildRequestedDateTime("2026-07-20", "08:15")).toBe(
      "2026-07-20T06:15:00.000Z",
    );
  });

  it("handles a late-evening time without rolling the date", () => {
    expect(buildRequestedDateTime("2026-12-24", "23:30")).toBe(
      "2026-12-24T22:30:00.000Z",
    );
  });
});

describe("chooseRecommendedOption (which route to recommend)", () => {
  const target = "2026-06-28T13:00:00+02:00";

  const train = {
    title: "Tog til Oslo lufthavn stasjon",
    leaveHomeIso: "2026-06-28T11:53:00+02:00",
    arriveAirportIso: "2026-06-28T12:57:00+02:00",
    durationSeconds: 64 * 60,
    changes: 1,
    walkDistance: 300,
  };

  const bus = {
    title: "Buss til Oslo lufthavn",
    leaveHomeIso: "2026-06-28T12:00:00+02:00",
    arriveAirportIso: "2026-06-28T12:55:00+02:00",
    durationSeconds: 55 * 60,
    changes: 0,
    walkDistance: 150,
  };

  it("prefers the route you can leave home latest (bus, not train)", () => {
    // The bus leaves later AND arrives earlier — it should always win, even
    // though the train arrives slightly closer to the deadline.
    const recommended = chooseRecommendedOption([train, bus], target);
    expect(recommended.title).toBe(bus.title);
  });

  it("ignores options that arrive after the target time", () => {
    // Deadline before either arrival -> nothing is valid -> falls back to the
    // first (best-scored) option that was passed in.
    const tooEarly = "2026-06-28T12:30:00+02:00";
    const recommended = chooseRecommendedOption([train, bus], tooEarly);
    expect(recommended).toBe(train);
  });

  it("breaks a tie on departure time by choosing fewer changes", () => {
    const fewerChanges = {
      title: "Direkte",
      leaveHomeIso: "2026-06-28T12:00:00+02:00",
      arriveAirportIso: "2026-06-28T12:55:00+02:00",
      durationSeconds: 55 * 60,
      changes: 0,
      walkDistance: 500,
    };
    const moreChanges = {
      title: "Med bytte",
      leaveHomeIso: "2026-06-28T12:00:00+02:00",
      arriveAirportIso: "2026-06-28T12:50:00+02:00",
      durationSeconds: 50 * 60,
      changes: 2,
      walkDistance: 100,
    };

    const recommended = chooseRecommendedOption(
      [moreChanges, fewerChanges],
      target,
    );
    expect(recommended.title).toBe("Direkte");
  });

  it("returns null when there are no options at all", () => {
    expect(chooseRecommendedOption([], target)).toBe(null);
  });
});
