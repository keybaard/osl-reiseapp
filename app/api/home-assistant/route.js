import { detectFlight } from "../../lib/flightDetection";

const ENTUR_CLIENT_NAME =
  process.env.ENTUR_CLIENT_NAME || "yourcompany-oslreiseapp";

const GEOCODER_URL = "https://api.entur.io/geocoder/v1/autocomplete";
const JOURNEY_URL = "https://api.entur.io/journey-planner/v3/graphql";

function modeLabel(mode) {
  if (mode === "foot") return "Gå";
  if (mode === "bus") return "Buss";
  if (mode === "rail") return "Tog";
  if (mode === "tram") return "Trikk";
  if (mode === "metro") return "T-bane";
  return mode || "";
}

function formatTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("no-NO", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(dateTimeString) {
  if (!dateTimeString) return "";
  return new Date(dateTimeString).toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function formatDurationMinutes(seconds) {
  if (!seconds && seconds !== 0) return null;
  return Math.round(seconds / 60);
}

function buildRequestedDateTimeFromIso(isoString) {
  return new Date(isoString).toISOString();
}

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
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
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

async function geocodePlace(name, size = 1) {
  const url = `${GEOCODER_URL}?text=${encodeURIComponent(name)}&size=${size}&lang=no`;

  const response = await fetch(url, {
    headers: {
      "ET-Client-Name": ENTUR_CLIENT_NAME,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Klarte ikke å slå opp sted i Entur.");
  }

  const data = await response.json();
  return data?.features || [];
}

async function geocodeAirportStops() {
  const url =
    `${GEOCODER_URL}?text=${encodeURIComponent("Oslo lufthavn")}` +
    `&size=10&lang=no&multiModal=all`;

  const response = await fetch(url, {
    headers: {
      "ET-Client-Name": ENTUR_CLIENT_NAME,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Klarte ikke å slå opp Oslo lufthavn i Entur.");
  }

  const data = await response.json();
  const features = data?.features || [];

  const mapped = features.map((feature) => {
    const p = feature.properties || {};
    return {
      id: p.id || "",
      label: p.label || "",
      category: p.category || "",
      layer: p.layer || "",
    };
  });

  const railStop =
    mapped.find((x) => x.category === "railStation") ||
    mapped.find((x) => x.label.toLowerCase().includes("stasjon"));

  const busStop =
    mapped.find((x) => x.category === "coachStation") ||
    mapped.find((x) => x.category === "busStation") ||
    mapped.find((x) => x.category === "airport");

  return { railStop, busStop, raw: mapped };
}

function getCoordinatesFromFeature(feature) {
  const coordinates = feature?.geometry?.coordinates;
  if (!coordinates || coordinates.length < 2) {
    throw new Error("Fant ikke koordinater for startsted.");
  }

  return {
    name: feature?.properties?.label || "Ukjent sted",
    longitude: coordinates[0],
    latitude: coordinates[1],
  };
}

async function getJourneysToStop(fromPlace, stopPlaceId, label) {
  const query = `
    query Trip($fromLat: Float!, $fromLon: Float!, $toId: String!, $dateTime: DateTime!) {
      trip(
        from: { coordinates: { latitude: $fromLat, longitude: $fromLon } }
        to: { place: $toId }
        dateTime: $dateTime
        arriveBy: true
        numTripPatterns: 5
      ) {
        tripPatterns {
          duration
          expectedStartTime
          expectedEndTime
          walkDistance
          legs {
            mode
            expectedStartTime
            expectedEndTime
            fromPlace { name }
            toPlace { name }
            line {
              publicCode
              name
              transportMode
            }
            authority { name }
          }
        }
      }
    }
  `;

  const response = await fetch(JOURNEY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ET-Client-Name": ENTUR_CLIENT_NAME,
    },
    body: JSON.stringify({
      query,
      variables: {
        fromLat: fromPlace.latitude,
        fromLon: fromPlace.longitude,
        toId: stopPlaceId,
        dateTime: label.dateTime,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Klarte ikke å hente reiser til ${label.name}.`);
  }

  const data = await response.json();

  if (data.errors?.length) {
    throw new Error(data.errors[0].message || "Entur returnerte en feil.");
  }

  return data?.data?.trip?.tripPatterns || [];
}

function classifyTrip(legs, destinationType) {
  const text = JSON.stringify(legs).toLowerCase();

  if (text.includes("flytog")) return "Flytoget";
  if (text.includes("flybuss")) return "Flybussen";

  if (destinationType === "rail") return "Tog til Oslo lufthavn stasjon";
  if (destinationType === "bus") return "Buss til Oslo lufthavn";

  const goesViaOsloS = legs?.some(
    (leg) =>
      leg?.fromPlace?.name?.toLowerCase()?.includes("oslo s") ||
      leg?.toPlace?.name?.toLowerCase()?.includes("oslo s"),
  );

  if (goesViaOsloS) return "Via Oslo S";

  return "Annet forslag";
}

function scoreTrip(pattern) {
  const legs = pattern.legs || [];
  const changes = Math.max(0, legs.length - 1);
  const walkDistance = pattern.walkDistance || 0;
  const duration = pattern.duration || 0;

  return 1000 - changes * 40 - walkDistance / 20 - duration / 60;
}

function cleanAirportLegs(legs = []) {
  if (legs.length < 2) {
    return {
      cleanedLegs: legs,
      adjustedArrivalTime: legs[legs.length - 1]?.endTime || "",
    };
  }

  const lastLeg = legs[legs.length - 1];
  const secondLastLeg = legs[legs.length - 2];

  const lastTo = (lastLeg?.to || "").toLowerCase();
  const secondLastTo = (secondLastLeg?.to || "").toLowerCase();

  const isFinalWalk = lastLeg?.mode?.toLowerCase() === "foot";

  const looksLikeInternalAirportWalk =
    lastTo.includes("destination") ||
    lastTo.includes("oslo lufthavn") ||
    lastTo.includes("gardermoen");

  const previousLegArrivesAtAirport =
    secondLastTo.includes("oslo lufthavn") ||
    secondLastTo.includes("gardermoen");

  if (
    isFinalWalk &&
    looksLikeInternalAirportWalk &&
    previousLegArrivesAtAirport
  ) {
    const trimmedLegs = legs.slice(0, -1);

    return {
      cleanedLegs: trimmedLegs,
      adjustedArrivalTime: secondLastLeg?.endTime || lastLeg?.endTime || "",
    };
  }

  return {
    cleanedLegs: legs,
    adjustedArrivalTime: lastLeg?.endTime || "",
  };
}

function mapTripPattern(pattern, index, destinationType, destinationLabel) {
  const rawLegs =
    pattern.legs?.map((leg) => ({
      mode: leg.mode,
      from: leg?.fromPlace?.name || "",
      to: leg?.toPlace?.name || "",
      lineName: leg?.line?.name || leg?.line?.publicCode || "",
      authority: leg?.authority?.name || "",
      startTime: formatTime(leg.expectedStartTime),
      endTime: formatTime(leg.expectedEndTime),
      startTimeIso: leg.expectedStartTime || null,
      endTimeIso: leg.expectedEndTime || null,
    })) || [];

  const { cleanedLegs, adjustedArrivalTime } = cleanAirportLegs(rawLegs);

  const nonFootLegs = cleanedLegs.filter(
    (leg) => leg.mode?.toLowerCase() !== "foot",
  );

  const changes = Math.max(0, nonFootLegs.length - 1);

  const leaveHomeIso =
    cleanedLegs[0]?.startTimeIso || pattern.expectedStartTime || null;
  const arriveAirportIso =
    cleanedLegs[cleanedLegs.length - 1]?.endTimeIso ||
    pattern.expectedEndTime ||
    null;

  return {
    id: `${destinationType}-${index}`,
    title: classifyTrip(pattern.legs, destinationType),
    destinationType,
    destinationLabel,
    leaveHome:
      cleanedLegs[0]?.startTime || formatTime(pattern.expectedStartTime),
    leaveHomeIso,
    arriveAirport: adjustedArrivalTime || formatTime(pattern.expectedEndTime),
    arriveAirportIso,
    durationSeconds: pattern.duration,
    walkDistance: Math.round(pattern.walkDistance || 0),
    changes,
    score: scoreTrip(pattern),
    legs: cleanedLegs,
  };
}

function buildRouteSummary(option) {
  if (!option?.legs?.length) return "";
  return option.legs
    .map((leg) => {
      const label = modeLabel(leg.mode);
      return leg.lineName ? `${label} ${leg.lineName}` : label;
    })
    .join(" → ");
}

function buildRouteMarkdown(option) {
  if (!option) return "Ingen rute funnet.";

  const lines = [];
  lines.push(`**${option.title}**`);
  lines.push(`Dra hjemmefra: **${option.leaveHome}**`);
  lines.push(`Fremme på OSL: **${option.arriveAirport}**`);
  lines.push("");

  for (const leg of option.legs || []) {
    const label = modeLabel(leg.mode);
    const lineName = leg.lineName ? ` · ${leg.lineName}` : "";
    lines.push(`- ${leg.startTime}–${leg.endTime}: ${label}${lineName}`);
    lines.push(`  ${leg.from} → ${leg.to}`);
  }

  return lines.join("\n");
}

export async function GET(request) {
  try {
    const key = request.nextUrl.searchParams.get("key");

    if (
      !process.env.HOME_ASSISTANT_API_KEY ||
      key !== process.env.HOME_ASSISTANT_API_KEY
    ) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = await getGoogleAccessTokenFromRefreshToken();

    const fromLocation =
      request.nextUrl.searchParams.get("from") ||
      "Hans Nielsen Hauges gate 29D, 0481 Oslo";

    const calendars = await fetchCalendarList(accessToken);
    const allEvents = [];

    for (const calendar of calendars) {
      try {
        const items = await fetchEventsForCalendar(accessToken, calendar.id);

        const mapped = items
          .filter((event) => event.start?.dateTime)
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

    if (!nextFlight?.detected?.recommendedAirportArrivalTime) {
      return Response.json({
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
      });
    }

    const dateTime = buildRequestedDateTimeFromIso(
      nextFlight.detected.recommendedAirportArrivalTime,
    );

    const fromFeatures = await geocodePlace(fromLocation, 1);
    const fromFeature = fromFeatures[0];

    if (!fromFeature) {
      return Response.json({ error: "Fant ikke startsted." }, { status: 400 });
    }

    const fromPlace = getCoordinatesFromFeature(fromFeature);
    const airportStops = await geocodeAirportStops();

    const allOptions = [];

    if (airportStops.railStop?.id) {
      const railPatterns = await getJourneysToStop(
        fromPlace,
        airportStops.railStop.id,
        { name: airportStops.railStop.label, dateTime },
      );

      allOptions.push(
        ...railPatterns.map((pattern, index) =>
          mapTripPattern(pattern, index, "rail", airportStops.railStop.label),
        ),
      );
    }

    if (
      airportStops.busStop?.id &&
      airportStops.busStop.id !== airportStops.railStop?.id
    ) {
      const busPatterns = await getJourneysToStop(
        fromPlace,
        airportStops.busStop.id,
        { name: airportStops.busStop.label, dateTime },
      );

      allOptions.push(
        ...busPatterns.map((pattern, index) =>
          mapTripPattern(pattern, index, "bus", airportStops.busStop.label),
        ),
      );
    }

    const options = allOptions.sort((a, b) => b.score - a.score);

    const targetTime = new Date(dateTime).getTime();

    const validOptions = options.filter(
      (opt) =>
        opt.arriveAirportIso &&
        new Date(opt.arriveAirportIso).getTime() <= targetTime,
    );

    validOptions.sort((a, b) => {
      const diffA = targetTime - new Date(a.arriveAirportIso).getTime();
      const diffB = targetTime - new Date(b.arriveAirportIso).getTime();

      if (diffA !== diffB) return diffA - diffB;
      if (a.changes !== b.changes) return a.changes - b.changes;
      return a.walkDistance - b.walkDistance;
    });

    const recommendedOption = validOptions[0] || options[0] || null;

    return Response.json({
      date_label: formatDateLabel(dateTime),
      next_flight_title: nextFlight.detected.title,
      flight_type: nextFlight.detected.flightType,
      departure_time: nextFlight.detected.departureTime,
      airport_arrival_time: nextFlight.detected.recommendedAirportArrivalTime,
      leave_home_time: recommendedOption?.leaveHomeIso || null,
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
      { status: 500 },
    );
  }
}
