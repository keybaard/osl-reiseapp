// Shared Google Calendar helpers used by the /api/calendars, /api/calendar-events,
// /api/next-flight and /api/home-assistant routes. Previously this logic was
// copy-pasted into each route and had started to drift (different maxResults,
// different filtering), so it now lives in one place.

import { detectFlight } from "./flightDetection";

const CALENDAR_LIST_URL =
  "https://www.googleapis.com/calendar/v3/users/me/calendarList";

// How far ahead we look for events, and the max events fetched per calendar.
const LOOKAHEAD_DAYS = 60;
const MAX_EVENTS_PER_CALENDAR = 100;

export async function fetchCalendarList(accessToken) {
  const response = await fetch(CALENDAR_LIST_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Klarte ikke å hente kalenderliste.");
  }

  return data.items || [];
}

export async function fetchEventsForCalendar(accessToken, calendarId) {
  const now = new Date();
  const until = new Date();
  until.setDate(until.getDate() + LOOKAHEAD_DAYS);

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?` +
    new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: until.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(MAX_EVENTS_PER_CALENDAR),
    }).toString();

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
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

// Fetch every calendar's events in parallel and flatten them into one list.
// A calendar that fails is logged and skipped so one bad calendar can't break
// the whole request. Set `requireTime` to drop all-day events (those without a
// real clock time), which flight detection needs.
export async function fetchAllEvents(accessToken, { requireTime = false } = {}) {
  const calendars = await fetchCalendarList(accessToken);

  const results = await Promise.allSettled(
    calendars.map((calendar) =>
      fetchEventsForCalendar(accessToken, calendar.id),
    ),
  );

  const allEvents = [];

  results.forEach((result, index) => {
    const calendar = calendars[index];

    if (result.status === "rejected") {
      console.error(
        `Feil ved henting fra kalender ${calendar.summary}:`,
        result.reason?.message || result.reason,
      );
      return;
    }

    const mapped = result.value
      .filter((event) => (requireTime ? Boolean(event.start?.dateTime) : true))
      .map((event) => ({
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
  });

  return { calendars, events: allEvents };
}

// Detect every flight that departs in the future, soonest first.
export async function getUpcomingFlights(accessToken) {
  const { calendars, events } = await fetchAllEvents(accessToken, {
    requireTime: true,
  });

  const now = Date.now();

  const detectedFlights = events
    .map((event) => ({ originalEvent: event, detected: detectFlight(event) }))
    .filter((item) => item.detected.isFlight)
    .filter((item) => item.detected.departureTime)
    .filter((item) => new Date(item.detected.departureTime).getTime() > now)
    .sort(
      (a, b) =>
        new Date(a.detected.departureTime).getTime() -
        new Date(b.detected.departureTime).getTime(),
    );

  return { calendars, detectedFlights };
}
