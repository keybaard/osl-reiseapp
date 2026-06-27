// Shared Entur (Norwegian public-transport) helpers used by the /api/trips and
// /api/home-assistant routes. Keeping this in one place means the trip-planning
// logic (and its timezone handling) only ever has to be fixed once.

const ENTUR_CLIENT_NAME =
  process.env.ENTUR_CLIENT_NAME || "yourcompany-oslreiseapp";

const GEOCODER_URL = "https://api.entur.io/geocoder/v1/autocomplete";
const JOURNEY_URL = "https://api.entur.io/journey-planner/v3/graphql";

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

// Always format times in Oslo time. These functions run on the server, which on
// Vercel is UTC — without an explicit timeZone the times would be shown in UTC.
export function formatTime(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleTimeString("no-NO", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Oslo",
  });
}

export function formatDateLabel(dateTimeString) {
  if (!dateTimeString) return "";
  return new Date(dateTimeString).toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Oslo",
  });
}

export function formatDurationMinutes(seconds) {
  if (!seconds && seconds !== 0) return null;
  return Math.round(seconds / 60);
}

export function modeLabel(mode) {
  if (mode === "foot") return "Gå";
  if (mode === "bus") return "Buss";
  if (mode === "rail") return "Tog";
  if (mode === "tram") return "Trikk";
  if (mode === "metro") return "T-bane";
  return mode || "";
}

// ---------------------------------------------------------------------------
// Turning a desired arrival time into an absolute instant
// ---------------------------------------------------------------------------

// Convert a wall-clock date + time in Oslo into an absolute UTC instant.
//
// Why this is needed: `new Date(year, month, day, hour, min)` interprets the
// numbers in the *server's* timezone. On Vercel that server is UTC, so "08:15"
// would wrongly become 08:15 UTC instead of 08:15 Oslo time (an hour or two off,
// which is exactly the kind of error this app must not make). This helper works
// out Oslo's UTC offset for that specific date — so it stays correct across
// summer/winter time — and applies it.
function osloWallClockToUtcIso(year, month, day, hours, minutes) {
  // Start by pretending the wall-clock time is already in UTC.
  const utcGuess = Date.UTC(year, month - 1, day, hours, minutes);

  // Render that instant in Oslo, then read back the hour/minute it shows.
  const osloParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcGuess));

  const get = (type) => Number(osloParts.find((p) => p.type === type).value);
  const hour = get("hour") === 24 ? 0 : get("hour");

  const osloAsUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );

  // The difference is how far Oslo is ahead of UTC at that moment.
  const offsetMs = osloAsUtc - utcGuess;

  return new Date(utcGuess - offsetMs).toISOString();
}

// Build the target arrival instant from a date ("2026-03-20") and time ("08:15")
// that the user typed, interpreting them as Oslo wall-clock time.
export function buildRequestedDateTime(arrivalDate, arrivalTime) {
  const [year, month, day] = arrivalDate.split("-").map(Number);
  const [hours, minutes] = arrivalTime.split(":").map(Number);
  return osloWallClockToUtcIso(year, month, day, hours, minutes);
}

// Re-serialize an ISO string that already carries timezone information (e.g. a
// calendar event start time) into a plain UTC instant.
export function buildRequestedDateTimeFromIso(isoString) {
  return new Date(isoString).toISOString();
}

// ---------------------------------------------------------------------------
// Entur API calls
// ---------------------------------------------------------------------------

export async function geocodePlace(name, size = 1) {
  const url = `${GEOCODER_URL}?text=${encodeURIComponent(name)}&size=${size}&lang=no`;

  const response = await fetch(url, {
    headers: { "ET-Client-Name": ENTUR_CLIENT_NAME },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Klarte ikke å slå opp sted i Entur.");
  }

  const data = await response.json();
  return data?.features || [];
}

export async function geocodeAirportStops() {
  const url =
    `${GEOCODER_URL}?text=${encodeURIComponent("Oslo lufthavn")}` +
    `&size=10&lang=no&multiModal=all`;

  const response = await fetch(url, {
    headers: { "ET-Client-Name": ENTUR_CLIENT_NAME },
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

  // Try to find one stop for trains and one for bus/coach.
  const railStop =
    mapped.find((x) => x.category === "railStation") ||
    mapped.find((x) => x.label.toLowerCase().includes("stasjon"));

  const busStop =
    mapped.find((x) => x.category === "coachStation") ||
    mapped.find((x) => x.category === "busStation") ||
    mapped.find((x) => x.category === "airport");

  return { railStop, busStop, raw: mapped };
}

export function getCoordinatesFromFeature(feature) {
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

export async function getJourneysToStop(fromPlace, stopPlaceId, label) {
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

// ---------------------------------------------------------------------------
// Turning raw trip patterns into clean options
// ---------------------------------------------------------------------------

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

// The journey planner often ends with a short internal "walk" from the airport
// station to the terminal. We trim that so the displayed arrival time is when
// you actually reach the airport, not the gate.
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

  if (isFinalWalk && looksLikeInternalAirportWalk && previousLegArrivesAtAirport) {
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

export function mapTripPattern(pattern, index, destinationType, destinationLabel) {
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
    leaveHome: cleanedLegs[0]?.startTime || formatTime(pattern.expectedStartTime),
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

export function buildRouteSummary(option) {
  if (!option?.legs?.length) return "";
  return option.legs
    .map((leg) => {
      const label = modeLabel(leg.mode);
      return leg.lineName ? `${label} ${leg.lineName}` : label;
    })
    .join(" → ");
}

export function buildRouteMarkdown(option) {
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

// ---------------------------------------------------------------------------
// High-level planner shared by both routes
// ---------------------------------------------------------------------------

// Geocode the starting location, look up the airport stops, fetch rail and bus
// journeys in parallel, and pick the option that arrives closest to (but not
// after) the requested time. `dateTime` must be an absolute ISO instant.
export async function planTripsToAirport(fromLocation, dateTime) {
  const fromFeatures = await geocodePlace(fromLocation, 1);
  const fromFeature = fromFeatures[0];

  if (!fromFeature) {
    const error = new Error("Fant ikke startsted.");
    error.status = 400;
    throw error;
  }

  const fromPlace = getCoordinatesFromFeature(fromFeature);
  const airportStops = await geocodeAirportStops();

  const hasRail = Boolean(airportStops.railStop?.id);
  const hasBus = Boolean(
    airportStops.busStop?.id &&
      airportStops.busStop.id !== airportStops.railStop?.id,
  );

  const [railOptions, busOptions] = await Promise.all([
    hasRail
      ? getJourneysToStop(fromPlace, airportStops.railStop.id, {
          name: airportStops.railStop.label,
          dateTime,
        }).then((patterns) =>
          patterns.map((pattern, index) =>
            mapTripPattern(pattern, index, "rail", airportStops.railStop.label),
          ),
        )
      : Promise.resolve([]),
    hasBus
      ? getJourneysToStop(fromPlace, airportStops.busStop.id, {
          name: airportStops.busStop.label,
          dateTime,
        }).then((patterns) =>
          patterns.map((pattern, index) =>
            mapTripPattern(pattern, index, "bus", airportStops.busStop.label),
          ),
        )
      : Promise.resolve([]),
  ]);

  const options = [...railOptions, ...busOptions].sort((a, b) => b.score - a.score);
  const recommendedOption = chooseRecommendedOption(options, dateTime);

  return { fromPlace, airportStops, options, recommendedOption };
}

// Pick the best option for arriving by `dateTime`. Kept as a separate pure
// function so the ranking can be unit-tested without calling the live APIs.
export function chooseRecommendedOption(options, dateTime) {
  const targetTime = new Date(dateTime).getTime();

  const validOptions = options.filter(
    (opt) =>
      opt.arriveAirportIso &&
      new Date(opt.arriveAirportIso).getTime() <= targetTime,
  );

  // Among the options that arrive in time, recommend the one that lets you
  // leave home as late as possible — that's the real question this app answers
  // ("when do I need to leave?"). Two routes can arrive within a minute of each
  // other while one forces you out the door much earlier (e.g. a 64-min train
  // vs a 55-min bus); we should prefer the later departure. Then break ties by
  // fewer changes, a shorter trip, and finally less walking.
  validOptions.sort((a, b) => {
    const leaveA = a.leaveHomeIso ? new Date(a.leaveHomeIso).getTime() : 0;
    const leaveB = b.leaveHomeIso ? new Date(b.leaveHomeIso).getTime() : 0;
    if (leaveA !== leaveB) return leaveB - leaveA; // later departure first

    if (a.changes !== b.changes) return a.changes - b.changes;
    if (a.durationSeconds !== b.durationSeconds) {
      return a.durationSeconds - b.durationSeconds;
    }
    return a.walkDistance - b.walkDistance;
  });

  // If nothing arrives in time, fall back to the best-scored option.
  return validOptions[0] || options[0] || null;
}
