import { timingSafeEqual } from "crypto";
import { getUpcomingFlights } from "../../lib/googleCalendar";
import {
  buildRequestedDateTimeFromIso,
  buildRouteMarkdown,
  buildRouteSummary,
  formatDateLabel,
  formatDurationMinutes,
  formatTime,
  modeLabel,
  planTripsToAirport,
} from "../../lib/entur";

const DEFAULT_FROM_LOCATION = "Hans Nielsen Hauges gate 29D, 0481 Oslo";

// Constant-time comparison so the API key can't be guessed via timing.
function keyMatches(provided, expected) {
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// This route is called by Home Assistant (no interactive Google login), so it
// uses a long-lived refresh token stored in the environment to read the calendar.
async function getGoogleAccessTokenFromRefreshToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Mangler GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET eller GOOGLE_REFRESH_TOKEN.",
    );
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        "Klarte ikke å hente Google access token.",
    );
  }

  return data.access_token;
}

function emptyResponse(fromLocation) {
  return {
    date_label: null,
    next_flight_title: null,
    flight_type: null,
    departure_time: null,
    airport_arrival_time: null,
    leave_home_time: null,
    from_location: fromLocation,
    recommended_title: null,
    recommended_arrive_airport: null,
    recommended_duration_minutes: null,
    recommended_changes: null,
    recommended_walk_distance: null,
    route_summary: null,
    route_markdown: "Ingen kommende flyreiser funnet.",
    legs: [],
  };
}

export async function GET(request) {
  try {
    // Accept the key from a header (preferred) or the legacy query parameter.
    const key =
      request.headers.get("x-api-key") ||
      request.nextUrl.searchParams.get("key");

    if (!keyMatches(key, process.env.HOME_ASSISTANT_API_KEY)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = await getGoogleAccessTokenFromRefreshToken();

    const fromLocation =
      request.nextUrl.searchParams.get("from") || DEFAULT_FROM_LOCATION;

    const { detectedFlights } = await getUpcomingFlights(accessToken);
    const nextFlight = detectedFlights[0] || null;

    if (!nextFlight?.detected?.recommendedAirportArrivalTime) {
      return Response.json(emptyResponse(fromLocation));
    }

    const dateTime = buildRequestedDateTimeFromIso(
      nextFlight.detected.recommendedAirportArrivalTime,
    );

    const { fromPlace, recommendedOption } = await planTripsToAirport(
      fromLocation,
      dateTime,
    );

    return Response.json({
      date_label: formatDateLabel(dateTime),
      next_flight_title: nextFlight.detected.title,
      flight_type: nextFlight.detected.flightType,

      departure_time: nextFlight.detected.departureTime,
      departure_time_text: formatTime(nextFlight.detected.departureTime),

      airport_arrival_time: nextFlight.detected.recommendedAirportArrivalTime,
      airport_arrival_time_text: recommendedOption?.arriveAirport || null,

      leave_home_time: recommendedOption?.leaveHomeIso || null,
      leave_home_time_text: recommendedOption?.leaveHome || null,

      from_location: fromPlace.name,
      recommended_title: recommendedOption?.title || null,
      recommended_arrive_airport: recommendedOption?.arriveAirport || null,
      recommended_duration_minutes: formatDurationMinutes(
        recommendedOption?.durationSeconds,
      ),
      recommended_changes: recommendedOption?.changes ?? null,
      recommended_walk_distance: recommendedOption?.walkDistance ?? null,
      route_summary: buildRouteSummary(recommendedOption),
      route_markdown: buildRouteMarkdown(recommendedOption),
      legs:
        recommendedOption?.legs?.map((leg) => ({
          mode: leg.mode,
          mode_label: modeLabel(leg.mode),
          line_name: leg.lineName || "",
          from: leg.from,
          to: leg.to,
          start_time: leg.startTime,
          end_time: leg.endTime,
        })) || [],
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Noe gikk galt i Home Assistant-endpointet." },
      { status: error.status || 500 },
    );
  }
}
