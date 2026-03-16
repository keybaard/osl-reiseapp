import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/authOptions";
import { detectFlight } from "../../lib/flightDetection";

async function fetchCalendarList(accessToken) {
  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    },
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message || "Klarte ikke å hente kalenderliste.",
    );
  }

  return data.items || [];
}

async function fetchEventsForCalendar(accessToken, calendarId) {
  const now = new Date();
  const in60Days = new Date();
  in60Days.setDate(in60Days.getDate() + 60);

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
    new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: in60Days.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
    }).toString();

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.error?.message ||
        `Klarte ikke å hente events for kalender ${calendarId}.`,
    );
  }

  return data.items || [];
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return Response.json({ error: "Ikke logget inn." }, { status: 401 });
    }

    const calendars = await fetchCalendarList(session.accessToken);

    const allEvents = [];

    for (const calendar of calendars) {
      try {
        const items = await fetchEventsForCalendar(
          session.accessToken,
          calendar.id,
        );

        const mapped = items
          .filter((event) => event.start?.dateTime) // bare events med ekte klokkeslett
          .map((event) => ({
            id: event.id,
            calendarId: calendar.id,
            calendarSummary: calendar.summary,
            title: event.summary || "",
            description: event.description || "",
            location: event.location || "",
            startTime: event.start?.dateTime || null,
          }));

        allEvents.push(...mapped);
      } catch (err) {
        console.error(
          `Feil ved henting fra kalender ${calendar.summary}:`,
          err.message,
        );
      }
    }

    const now = Date.now();

    const detectedFlights = allEvents
      .map((event) => ({
        originalEvent: event,
        detected: detectFlight(event),
      }))
      .filter((item) => item.detected.isFlight)
      .filter((item) => item.detected.departureTime)
      .filter((item) => new Date(item.detected.departureTime).getTime() > now)
      .sort(
        (a, b) =>
          new Date(a.detected.departureTime).getTime() -
          new Date(b.detected.departureTime).getTime(),
      );

    const nextFlight = detectedFlights[0] || null;

    return Response.json({
      nextFlight,
      allFlights: detectedFlights,
      checkedCalendars: calendars.map((c) => ({
        id: c.id,
        summary: c.summary,
      })),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Noe gikk galt ved henting av fly." },
      { status: 500 },
    );
  }
}
