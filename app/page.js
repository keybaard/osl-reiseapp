"use client";

import { useEffect, useState } from "react";

function modeLabel(mode) {
  if (mode === "foot") return "🚶 Gå";
  if (mode === "bus") return "🚌 Buss";
  if (mode === "rail") return "🚆 Tog";
  if (mode === "tram") return "🚋 Trikk";
  if (mode === "metro") return "🚇 T-bane";
  return mode;
}

const HOME_ADDRESS = "Hans Nielsen Hauges gate 29D, 0481 Oslo";
const WORK_ADDRESS = "Malmøgata 11, Oslo";

export default function Home() {
  const [fromLocation, setFromLocation] = useState(HOME_ADDRESS);
  const [selectedPreset, setSelectedPreset] = useState("home");
  const [arrivalTime, setArrivalTime] = useState("");
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextFlight, setNextFlight] = useState(null);
  const [loadingNextFlight, setLoadingNextFlight] = useState(false);

  useEffect(() => {
    loadNextFlight();
  }, []);

  async function loadNextFlight() {
    setLoadingNextFlight(true);

    try {
      const response = await fetch("/api/next-flight");
      const data = await response.json();
      const next = data.nextFlight || null;

      setNextFlight(next);

      if (next?.detected?.recommendedAirportArrivalTime) {
        const airportArrival = new Date(
          next.detected.recommendedAirportArrivalTime,
        );

        const hh = String(airportArrival.getHours()).padStart(2, "0");
        const mm = String(airportArrival.getMinutes()).padStart(2, "0");
        const formattedTime = `${hh}:${mm}`;

        setArrivalTime(formattedTime);

        if (!fromLocation) {
          setFromLocation(HOME_ADDRESS);
          setSelectedPreset("home");
          await calculateTrips(HOME_ADDRESS, formattedTime);
        } else {
          await calculateTrips(fromLocation, formattedTime);
        }
      }
    } catch (err) {
      console.error("Klarte ikke å hente neste fly.");
    }

    setLoadingNextFlight(false);
  }

  function choosePreset(type) {
    if (type === "home") {
      setFromLocation(HOME_ADDRESS);
      setSelectedPreset("home");
    } else if (type === "work") {
      setFromLocation(WORK_ADDRESS);
      setSelectedPreset("work");
    }
  }

  async function calculateTrips(customFromLocation, customArrivalTime) {
    setError("");
    setTripData(null);

    const finalFromLocation = customFromLocation || fromLocation;
    const finalArrivalTime = customArrivalTime || arrivalTime;

    if (!finalFromLocation || !finalArrivalTime) {
      setError("Fyll inn både startsted og tidspunkt.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/trips", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fromLocation: finalFromLocation,
          arrivalTime: finalArrivalTime,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Noe gikk galt.");
      } else {
        setTripData(data);
      }
    } catch (err) {
      setError("Klarte ikke å hente reisealternativer.");
    }

    setLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await calculateTrips();
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "40px",
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f7f7f7",
        color: "#333",
      }}
    >
      <div
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          backgroundColor: "white",
          padding: "24px",
          borderRadius: "12px",
          boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
        }}
      >
        <h1 style={{ fontSize: "32px", marginBottom: "8px" }}>
          OSL Reisehjelper
        </h1>
        <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
          <a
            href="/api/auth/signin"
            style={{
              backgroundColor: "#0f172a",
              color: "white",
              padding: "10px 14px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
            }}
          >
            Logg inn med Google
          </a>

          <a
            href="/api/auth/signout"
            style={{
              backgroundColor: "#e5e7eb",
              color: "#111",
              padding: "10px 14px",
              borderRadius: "8px",
              textDecoration: "none",
              fontSize: "14px",
            }}
          >
            Logg ut
          </a>
        </div>
        <p style={{ color: "#555", marginBottom: "24px" }}>
          Skriv inn hvor du reiser fra og når du vil være på Oslo Lufthavn.
        </p>

        <div
          style={{
            marginBottom: "24px",
            padding: "16px",
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "10px",
          }}
        >
          <h2 style={{ margin: "0 0 12px 0", fontSize: "22px" }}>
            ✈️ Neste fly
          </h2>

          {loadingNextFlight ? (
            <p style={{ margin: 0 }}>Laster flyreise...</p>
          ) : nextFlight ? (
            <>
              <p style={{ margin: "4px 0" }}>
                <strong>Fly:</strong> {nextFlight.detected.title}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Avgang:</strong>{" "}
                {new Date(nextFlight.detected.departureTime).toLocaleString(
                  "no-NO",
                  {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Type:</strong>{" "}
                {nextFlight.detected.flightType === "domestic"
                  ? "Innenlands"
                  : nextFlight.detected.flightType === "international"
                    ? "Utenlands"
                    : "Ukjent"}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Bør være på OSL:</strong>{" "}
                {new Date(
                  nextFlight.detected.recommendedAirportArrivalTime,
                ).toLocaleString("no-NO", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>

              <button
                type="button"
                onClick={async () => {
                  const airportArrival = new Date(
                    nextFlight.detected.recommendedAirportArrivalTime,
                  );

                  const hh = String(airportArrival.getHours()).padStart(2, "0");
                  const mm = String(airportArrival.getMinutes()).padStart(
                    2,
                    "0",
                  );
                  const formattedTime = `${hh}:${mm}`;

                  setArrivalTime(formattedTime);
                  await calculateTrips(fromLocation, formattedTime);
                }}
                style={{
                  marginTop: "12px",
                  backgroundColor: "#0f172a",
                  color: "white",
                  padding: "10px 14px",
                  border: "none",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "15px",
                }}
              >
                Bruk dette tidspunktet for OSL
              </button>
            </>
          ) : (
            <p style={{ margin: 0 }}>Fant ingen kommende flyreiser.</p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "bold",
            }}
          >
            Hvor reiser du fra?
          </label>

          <div
            style={{
              display: "flex",
              gap: "12px",
              marginBottom: "12px",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => choosePreset("home")}
              style={{
                backgroundColor:
                  selectedPreset === "home" ? "#0f172a" : "#e8f5ff",
                color: selectedPreset === "home" ? "white" : "#111",
                padding: "10px 14px",
                border:
                  selectedPreset === "home"
                    ? "1px solid #0f172a"
                    : "1px solid #b6dfff",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: selectedPreset === "home" ? "bold" : "normal",
              }}
            >
              Hjem
            </button>

            <button
              type="button"
              onClick={() => choosePreset("work")}
              style={{
                backgroundColor:
                  selectedPreset === "work" ? "#0f172a" : "#f3f4f6",
                color: selectedPreset === "work" ? "white" : "#111",
                padding: "10px 14px",
                border:
                  selectedPreset === "work"
                    ? "1px solid #0f172a"
                    : "1px solid #d1d5db",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "15px",
                fontWeight: selectedPreset === "work" ? "bold" : "normal",
              }}
            >
              Jobb
            </button>
          </div>

          <input
            type="text"
            value={fromLocation}
            onChange={(e) => {
              setFromLocation(e.target.value);
              setSelectedPreset("");
            }}
            placeholder="For eksempel Majorstuen"
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "16px",
              marginBottom: "16px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              color: "#111",
              backgroundColor: "white",
            }}
          />

          <label
            style={{
              display: "block",
              marginBottom: "8px",
              fontWeight: "bold",
            }}
          >
            Når vil du være på Oslo Lufthavn?
          </label>

          <input
            type="time"
            value={arrivalTime}
            onChange={(e) => setArrivalTime(e.target.value)}
            style={{
              width: "100%",
              padding: "12px",
              fontSize: "16px",
              marginBottom: "16px",
              border: "1px solid #ccc",
              borderRadius: "8px",
              color: "#111",
              backgroundColor: "white",
            }}
          />

          <button
            type="submit"
            style={{
              backgroundColor: "black",
              color: "white",
              padding: "12px 18px",
              border: "none",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "16px",
            }}
          >
            {loading ? "Henter..." : "Finn reise"}
          </button>
        </form>

        {error && (
          <div
            style={{
              marginTop: "16px",
              padding: "12px",
              backgroundColor: "#ffeaea",
              border: "1px solid #ffb8b8",
              borderRadius: "8px",
              color: "#a10000",
            }}
          >
            {error}
          </div>
        )}

        {tripData?.recommendedOption && (
          <div style={{ marginTop: "24px" }}>
            <div
              style={{
                padding: "16px",
                marginBottom: "20px",
                backgroundColor: "#e8f5ff",
                border: "1px solid #cbd5e1",
                borderRadius: "10px",
              }}
            >
              <h2 style={{ margin: "0 0 10px 0", fontSize: "24px" }}>
                ⭐ Beste forslag
              </h2>
              <p style={{ margin: "4px 0" }}>
                <strong>Fra:</strong> {tripData.fromLocation}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Beste valg:</strong> {tripData.recommendedOption.title}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Dra hjemmefra:</strong> {tripData.recommendedLeaveTime}
              </p>
              <p style={{ margin: "4px 0" }}>
                <strong>Fremme på OSL:</strong>{" "}
                {tripData.recommendedOption.arriveAirport}
              </p>
            </div>

            <h3 style={{ fontSize: "22px", marginBottom: "12px" }}>
              Alle forslag
            </h3>

            {tripData.options.map((option) => (
              <div
                key={option.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "10px",
                  padding: "16px",
                  marginBottom: "16px",
                }}
              >
                <h2 style={{ margin: "0 0 8px 0", fontSize: "22px" }}>
                  {option.title}
                </h2>

                <p style={{ margin: "4px 0" }}>
                  <strong>Dra hjemmefra:</strong> {option.leaveHome}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Fremme på OSL:</strong> {option.arriveAirport}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Bytter:</strong> {option.changes}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Gange:</strong> {option.walkDistance} meter
                </p>

                <div style={{ marginTop: "12px" }}>
                  <strong>Etapper:</strong>
                  <ul style={{ marginTop: "8px" }}>
                    {option.legs.map((leg, i) => (
                      <li key={i} style={{ marginBottom: "8px" }}>
                        {leg.startTime}–{leg.endTime}: {modeLabel(leg.mode)} fra{" "}
                        {leg.from} til {leg.to}
                        {leg.lineName ? ` (${leg.lineName})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}

        {tripData && !tripData.recommendedOption && !error && (
          <div
            style={{
              marginTop: "24px",
              padding: "16px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              color: "#666",
            }}
          >
            Fant ingen reiser for dette tidspunktet.
          </div>
        )}

        {!tripData && !error && (
          <div
            style={{
              marginTop: "28px",
              padding: "16px",
              border: "1px solid #ddd",
              borderRadius: "8px",
              color: "#666",
            }}
          >
            Ingen forslag ennå. Fyll inn startsted og tidspunkt.
          </div>
        )}
      </div>
    </main>
  );
}
