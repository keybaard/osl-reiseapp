const NORWEGIAN_AIRPORTS = [
  "OSL",
  "BGO",
  "TRD",
  "SVG",
  "TOS",
  "BOO",
  "AES",
  "KRS",
  "EVE",
  "HAU",
  "MOL",
  "ALF",
  "KKN",
  "LKL",
  "BJF",
  "BDU",
  "VDS",
  "FRO",
  "SOG",
  "HOV",
];

const PLACE_TO_AIRPORT_CODE = {
  oslo: "OSL",
  gardermoen: "OSL",
  bergen: "BGO",
  flesland: "BGO",
  trondheim: "TRD",
  værnes: "TRD",
  vaernes: "TRD",
  stavanger: "SVG",
  sola: "SVG",
  tromsø: "TOS",
  tromso: "TOS",
  bodø: "BOO",
  bodo: "BOO",
  ålesund: "AES",
  alesund: "AES",
  kristiansand: "KRS",
  haugesund: "HAU",
  molde: "MOL",
  harstad: "EVE",
  narvik: "EVE",
  "harstad-narvik": "EVE",
  evenes: "EVE",
};
const KNOWN_AIRPORT_CODES = [
  "OSL",
  "BGO",
  "TRD",
  "SVG",
  "TOS",
  "BOO",
  "AES",
  "KRS",
  "EVE",
  "HAU",
  "MOL",
  "ALF",
  "KKN",
  "LKL",
  "BJF",
  "BDU",
  "VDS",
  "FRO",
  "SOG",
  "HOV",
  "CPH",
  "ARN",
  "LHR",
  "LGW",
  "AMS",
  "CDG",
  "FRA",
  "MUC",
  "BER",
  "HAM",
  "DUS",
  "ZRH",
  "GVA",
  "VIE",
  "BRU",
  "MAD",
  "BCN",
  "LIS",
  "FCO",
  "MXP",
  "ATH",
  "IST",
  "HEL",
  "KEF",
  "DUB",
  "WAW",
  "PRG",
  "BUD",
  "OTP",
  "JFK",
  "EWR",
  "BKK",
  "DXB",
  "DOH",
];

function extractAirportCodes(text) {
  if (!text) return [];

  const matches = text.toUpperCase().match(/\b[A-Z]{3}\b/g) || [];

  const filtered = matches.filter((code) => KNOWN_AIRPORT_CODES.includes(code));

  return [...new Set(filtered)];
}

function extractAirportCodesFromPlaceNames(text) {
  if (!text) return [];

  const lower = text.toLowerCase();
  const foundCodes = [];

  for (const [placeName, code] of Object.entries(PLACE_TO_AIRPORT_CODE)) {
    if (lower.includes(placeName)) {
      foundCodes.push(code);
    }
  }

  return [...new Set(foundCodes)];
}

function extractFlightNumber(text) {
  if (!text) return null;
  const match = text.toUpperCase().match(/\b([A-Z]{2,3}\s?\d{1,4})\b/);
  return match ? match[1].replace(/\s+/g, "") : null;
}

function extractBookingReference(text) {
  if (!text) return null;

  const matches = text.toUpperCase().match(/\b[A-Z0-9]{6}\b/g) || [];

  const valid = matches.find((candidate) => {
    const hasLetter = /[A-Z]/.test(candidate);
    const hasNumber = /\d/.test(candidate);
    return hasLetter && hasNumber;
  });

  return valid || null;
}

function getAllAirportCodes(text) {
  const directCodes = extractAirportCodes(text);
  const placeCodes = extractAirportCodesFromPlaceNames(text);

  return [...new Set([...directCodes, ...placeCodes])];
}

function isLikelyFlightEvent(event) {
  const combinedText = [
    event.title || "",
    event.description || "",
    event.location || "",
  ].join(" ");

  const airportCodes = getAllAirportCodes(combinedText);
  const flightNumber = extractFlightNumber(combinedText);
  const bookingReference = extractBookingReference(combinedText);

  const hasFlightWords =
    /flight|fly|avreise|departure|boarding|gate|pnr|booking/i.test(
      combinedText,
    );

  return Boolean(
    flightNumber ||
    airportCodes.length >= 2 ||
    (airportCodes.length >= 1 && hasFlightWords) ||
    (bookingReference && hasFlightWords),
  );
}

function classifyFlightType(airportCodes) {
  if (!airportCodes || airportCodes.length < 2) {
    return {
      type: "unknown",
      airportBufferHours: 2,
    };
  }

  const first = airportCodes[0];
  const second = airportCodes[1];

  const bothNorwegian =
    NORWEGIAN_AIRPORTS.includes(first) && NORWEGIAN_AIRPORTS.includes(second);

  if (bothNorwegian) {
    return {
      type: "domestic",
      airportBufferHours: 1,
    };
  }

  return {
    type: "international",
    airportBufferHours: 2,
  };
}

function subtractHoursFromDateString(dateString, hours) {
  const date = new Date(dateString);
  date.setHours(date.getHours() - hours);
  return date.toISOString();
}

export function detectFlight(event) {
  const titleLower = (event.title || "").toLowerCase();

  if (
    titleLower.includes("uke ") ||
    titleLower.includes("week ") ||
    titleLower.includes("ferie") ||
    titleLower.includes("helligdag") ||
    titleLower.includes("birthday")
  ) {
    return { isFlight: false };
  }
  const combinedText = [
    event.title || "",
    event.description || "",
    event.location || "",
  ].join(" ");

  const airportCodes = getAllAirportCodes(combinedText);
  const flightNumber = extractFlightNumber(combinedText);
  const bookingReference = extractBookingReference(combinedText);
  const looksLikeFlight = isLikelyFlightEvent(event);

  if (!looksLikeFlight) {
    return { isFlight: false };
  }

  const classification = classifyFlightType(airportCodes);

  const departureTime = event.startTime || null;
  const recommendedAirportArrivalTime = departureTime
    ? subtractHoursFromDateString(
        departureTime,
        classification.airportBufferHours,
      )
    : null;

  return {
    isFlight: true,
    title: event.title || "",
    flightNumber,
    bookingReference,
    airportCodes,
    flightType: classification.type,
    airportBufferHours: classification.airportBufferHours,
    departureTime,
    recommendedAirportArrivalTime,
  };
}
