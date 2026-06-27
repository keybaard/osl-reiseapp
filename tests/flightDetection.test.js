import { describe, it, expect } from "vitest";
import { detectFlight } from "../app/lib/flightDetection.js";

describe("detectFlight", () => {
  it("detects a domestic flight and uses a 1-hour airport buffer", () => {
    const result = detectFlight({
      title: "SK146 Oslo–Bergen",
      description: "Booking reference ABC123. Avreise OSL BGO",
      location: "Oslo Lufthavn",
      startTime: "2026-03-20T08:15:00+01:00",
    });

    expect(result.isFlight).toBe(true);
    expect(result.flightType).toBe("domestic");
    expect(result.airportBufferHours).toBe(1);
    expect(result.flightNumber).toBe("SK146");
    // 08:15 (+01:00) minus the 1-hour buffer.
    expect(result.recommendedAirportArrivalTime).toBe(
      "2026-03-20T06:15:00.000Z",
    );
  });

  it("detects an international flight and uses a 2-hour airport buffer", () => {
    const result = detectFlight({
      title: "LH863 Oslo–Frankfurt",
      description: "Flight LH863. Booking reference ZX9KLM. OSL FRA",
      location: "Oslo Lufthavn",
      startTime: "2026-03-22T14:30:00+01:00",
    });

    expect(result.isFlight).toBe(true);
    expect(result.flightType).toBe("international");
    expect(result.airportBufferHours).toBe(2);
    // 14:30 (+01:00) minus the 2-hour buffer.
    expect(result.recommendedAirportArrivalTime).toBe(
      "2026-03-22T11:30:00.000Z",
    );
  });

  it("does not treat an ordinary meeting as a flight", () => {
    const result = detectFlight({
      title: "Møte med kunde",
      description: "Gjennomgang av budsjett og fremdrift",
      location: "Malmøgata 11",
      startTime: "2026-03-19T10:00:00+01:00",
    });

    expect(result.isFlight).toBe(false);
  });

  it("ignores 'Uke NN' week markers even if they mention airports", () => {
    const result = detectFlight({
      title: "Uke 25 OSL BGO",
      startTime: "2026-06-15T09:00:00+02:00",
    });

    expect(result.isFlight).toBe(false);
  });

  it("ignores all-day vacation markers", () => {
    expect(detectFlight({ title: "Ferie i Spania" }).isFlight).toBe(false);
  });
});
