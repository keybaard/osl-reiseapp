const ENTUR_CLIENT_NAME =
  process.env.ENTUR_CLIENT_NAME || "yourcompany-oslreiseapp";

const GEOCODER_URL = "https://api.entur.io/geocoder/v1/autocomplete";
const JOURNEY_URL = "https://api.entur.io/journey-planner/v3/graphql";

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

  // Prøv å finne ett stopp for tog og ett for buss/coach
  const railStop =
    mapped.find((x) => x.category === "railStation") ||
    mapped.find((x) => x.label.toLowerCase().includes("stasjon"));

  const busStop =
    mapped.find((x) => x.category === "coachStation") ||
    mapped.find((x) => x.category === "busStation") ||
    mapped.find((x) => x.category === "airport");

  return {
    railStop,
    busStop,
    raw: mapped,
  };
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

function buildRequestedDateTime(arrivalTime) {
  const now = new Date();
  const [hours, minutes] = arrivalTime.split(":").map(Number);

  const requestedDate = new Date(now);
  requestedDate.setHours(hours, minutes, 0, 0);

  if (requestedDate.getTime() < now.getTime()) {
    requestedDate.setDate(requestedDate.getDate() + 1);
  }

  return requestedDate.toISOString();
}

function formatTime(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);

  return date.toLocaleTimeString("no-NO", {
    hour: "2-digit",
    minute: "2-digit",
  });
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
    })) || [];

  const { cleanedLegs, adjustedArrivalTime } = cleanAirportLegs(rawLegs);

  const nonFootLegs = cleanedLegs.filter(
    (leg) => leg.mode?.toLowerCase() !== "foot",
  );

  const changes = Math.max(0, nonFootLegs.length - 1);

  return {
    id: `${destinationType}-${index}`,
    title: classifyTrip(pattern.legs, destinationType),
    destinationType,
    destinationLabel,
    leaveHome:
      cleanedLegs[0]?.startTime || formatTime(pattern.expectedStartTime),
    arriveAirport: adjustedArrivalTime || formatTime(pattern.expectedEndTime),
    durationSeconds: pattern.duration,
    walkDistance: Math.round(pattern.walkDistance || 0),
    changes,
    score: scoreTrip(pattern),
    legs: cleanedLegs,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { fromLocation, arrivalTime } = body;

    if (!fromLocation || !arrivalTime) {
      return Response.json(
        { error: "Mangler startsted eller ankomsttid." },
        { status: 400 },
      );
    }

    const fromFeatures = await geocodePlace(fromLocation, 1);
    const fromFeature = fromFeatures[0];

    if (!fromFeature) {
      return Response.json({ error: "Fant ikke startsted." }, { status: 400 });
    }

    const fromPlace = getCoordinatesFromFeature(fromFeature);
    const dateTime = buildRequestedDateTime(arrivalTime);

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
    const recommendedOption = options[0] || null;

    return Response.json({
      fromLocation: fromPlace.name,
      targetArrivalTime: arrivalTime,
      airportStops,
      recommendedLeaveTime: recommendedOption?.leaveHome || null,
      recommendedOption,
      options,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Noe gikk galt mot Entur." },
      { status: 500 },
    );
  }
}
