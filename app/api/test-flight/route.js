import { detectFlight } from "../../lib/flightDetection";

export async function GET() {
  const exampleEvents = [
    {
      title: "SK146 Oslo–Bergen",
      description: "Booking reference ABC123. Avreise OSL BGO",
      location: "Oslo Lufthavn",
      startTime: "2026-03-20T08:15:00+01:00",
    },
    {
      title: "LH863 Oslo–Frankfurt",
      description: "Flight LH863. Booking reference ZX9KLM. OSL FRA",
      location: "Oslo Lufthavn",
      startTime: "2026-03-22T14:30:00+01:00",
    },
    {
      title: "Møte med kunde",
      description: "Gjennomgang av budsjett og fremdrift",
      location: "Malmøgata 11",
      startTime: "2026-03-19T10:00:00+01:00",
    },
  ];

  const results = exampleEvents.map((event) => ({
    originalEvent: event,
    detected: detectFlight(event),
  }));

  return Response.json({ results });
}
