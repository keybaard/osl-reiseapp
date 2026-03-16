import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/authOptions";

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
      maxResults: "100",
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
      return Response.json(
        { error: "Ikke logget inn med Google." },
        { status: 401 },
      );
    }

    const calendars = await fetchCalendarList(session.accessToken);
    const allEvents = [];

    for (const calendar of calendars) {
      try {
        const items = await fetchEventsForCalendar(
          session.accessToken,
          calendar.id,
        );

        const mapped = items.map((event) => ({
          id: event.id,
          calendarId: calendar.id,
          calendarSummary: calendar.summary,
          title: event.summary || "",
          description: event.description || "",
          location: event.location || "",
          startTime: event.start?.dateTime || event.start?.date || null,
          endTime: event.end?.dateTime || event.end?.date || null,
        }));

        allEvents.push(...mapped);
      } catch (err) {
        console.error(
          `Feil ved henting fra kalender ${calendar.summary}:`,
          err.message,
        );
      }
    }

    allEvents.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aTime - bTime;
    });

    return Response.json({
      count: allEvents.length,
      events: allEvents,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Klarte ikke å hente kalender-events." },
      { status: 500 },
    );
  }
}
