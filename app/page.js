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
function formatDateLabel(dateTimeString) {
  const date = new Date(dateTimeString);

  return date.toLocaleDateString("nb-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "";

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} min`;
  }

  return `${hours} t ${minutes} min`;
}

const HOME_ADDRESS = "Hans Nielsen Hauges gate 29D, 0481 Oslo";
const WORK_ADDRESS = "Malmøgata 11, Oslo";

export default function Home() {
  const [fromLocation, setFromLocation] = useState(HOME_ADDRESS);
  const [selectedPreset, setSelectedPreset] = useState("home");
  const [arrivalTime, setArrivalTime] = useState("");
  const [arrivalDate, setArrivalDate] = useState("");
  const [tripData, setTripData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextFlight, setNextFlight] = useState(null);
  const [loadingNextFlight, setLoadingNextFlight] = useState(false);
  const [showRecommendedLegs, setShowRecommendedLegs] = useState(false);

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 768);
    }

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

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

        const yyyy = airportArrival.getFullYear();
        const mmDate = String(airportArrival.getMonth() + 1).padStart(2, "0");
        const dd = String(airportArrival.getDate()).padStart(2, "0");
        const formattedDate = `${yyyy}-${mmDate}-${dd}`;

        setArrivalDate(formattedDate);
        setArrivalTime(formattedTime);

        if (!fromLocation) {
          setFromLocation(HOME_ADDRESS);
          setSelectedPreset("home");
          await calculateTrips(HOME_ADDRESS, formattedDate, formattedTime);
        } else {
          await calculateTrips(fromLocation, formattedDate, formattedTime);
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

  async function calculateTrips(
    customFromLocation,
    customArrivalDate,
    customArrivalTime,
  ) {
    setError("");
    setTripData(null);

    const finalFromLocation = customFromLocation || fromLocation;
    const finalArrivalDate = customArrivalDate || arrivalDate;
    const finalArrivalTime = customArrivalTime || arrivalTime;

    if (!finalFromLocation || !finalArrivalDate || !finalArrivalTime) {
      setError("Fyll inn startsted, dato og tidspunkt.");
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
          arrivalDate: finalArrivalDate,
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
        padding: isMobile ? "16px" : "40px",
        backgroundColor: "#f2f2f7",
        color: "#333",
      }}
    >
      <div
        style={{
          maxWidth: "1180px",
          margin: "0 auto",
          backgroundColor: "white",
          padding: isMobile ? "20px" : "32px",
          borderRadius: isMobile ? "14px" : "16px",
          boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        }}
      >
        <h1
          style={{
            fontSize: "34px",
            fontWeight: "700",
            letterSpacing: "-0.03em",
            marginBottom: "6px",
          }}
        >
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
        <p
          style={{
            color: "#4b5563",
            marginBottom: "24px",
            fontSize: "16px",
            lineHeight: 1.5,
          }}
        >
          Skriv inn hvor du reiser fra og når du vil være på Oslo Lufthavn.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile
              ? "1fr"
              : "repeat(auto-fit, minmax(360px, 1fr))",
            gap: isMobile ? "18px" : "24px",
            alignItems: "start",
          }}
        >
          <div>
            <div
              style={{
                marginBottom: "24px",
                padding: isMobile ? "16px" : "20px",
                backgroundColor: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: isMobile ? "12px" : "14px",
              }}
            >
              <h2
                style={{
                  margin: "0 0 12px 0",
                  fontSize: isMobile ? "20px" : "22px",
                }}
              >
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

                      const hh = String(airportArrival.getHours()).padStart(
                        2,
                        "0",
                      );
                      const mm = String(airportArrival.getMinutes()).padStart(
                        2,
                        "0",
                      );
                      const formattedTime = `${hh}:${mm}`;

                      const yyyy = airportArrival.getFullYear();
                      const mmDate = String(
                        airportArrival.getMonth() + 1,
                      ).padStart(2, "0");
                      const dd = String(airportArrival.getDate()).padStart(
                        2,
                        "0",
                      );
                      const formattedDate = `${yyyy}-${mmDate}-${dd}`;

                      const finalFromLocation = fromLocation || HOME_ADDRESS;

                      if (!fromLocation) {
                        setFromLocation(HOME_ADDRESS);
                        setSelectedPreset("home");
                      }

                      setArrivalDate(formattedDate);
                      setArrivalTime(formattedTime);

                      await calculateTrips(
                        finalFromLocation,
                        formattedDate,
                        formattedTime,
                      );
                    }}
                    style={{
                      marginTop: "12px",
                      backgroundColor: "#0f172a",
                      color: "white",
                      padding: isMobile ? "10px 12px" : "10px 14px",
                      border: "none",
                      borderRadius: "8px",
                      cursor: "pointer",
                      fontSize: isMobile ? "14px" : "15px",
                      width: isMobile ? "100%" : "auto",
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
                Hvilken dag vil du være på Oslo Lufthavn?
              </label>

              <input
                type="date"
                value={arrivalDate}
                onChange={(e) => setArrivalDate(e.target.value)}
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
          </div>

          <div>
            {tripData?.recommendedOption ? (
              <div
                style={{
                  padding: "22px",
                  backgroundColor: "#f5f7fb",
                  border: "1px solid #e5e7eb",
                  borderRadius: "16px",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.04)",
                }}
              >
                <h2
                  style={{
                    margin: "0 0 14px 0",
                    fontSize: "26px",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Anbefalt reise
                </h2>

                <p style={{ margin: "4px 0" }}>
                  <strong>Fra:</strong> {tripData.fromLocation}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Dato:</strong>{" "}
                  {formatDateLabel(tripData.targetDateTime)}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Beste valg:</strong>{" "}
                  {tripData.recommendedOption.title}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Dra hjemmefra:</strong>{" "}
                  {tripData.recommendedLeaveTime}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Fremme på OSL:</strong>{" "}
                  {tripData.recommendedOption.arriveAirport}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Varighet:</strong>{" "}
                  {formatDuration(tripData.recommendedOption.durationSeconds)}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Bytter:</strong> {tripData.recommendedOption.changes}
                </p>

                <button
                  type="button"
                  onClick={() => setShowRecommendedLegs(!showRecommendedLegs)}
                  style={{
                    marginTop: "14px",
                    backgroundColor: "#e5e7eb",
                    color: "#111827",
                    border: "none",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  {showRecommendedLegs ? "Skjul rute" : "Vis rute"}
                </button>

                {showRecommendedLegs && tripData.recommendedOption?.legs && (
                  <div style={{ marginTop: "18px" }}>
                    <strong style={{ display: "block", marginBottom: "12px" }}>
                      Rute
                    </strong>

                    <ul
                      style={{
                        marginTop: "0",
                        paddingLeft: "0",
                        marginBottom: "0",
                      }}
                    >
                      {tripData.recommendedOption.legs.map((leg, i) => (
                        <li
                          key={i}
                          style={{
                            listStyle: "none",
                            display: "flex",
                            gap: "12px",
                            marginBottom: "14px",
                            alignItems: "flex-start",
                          }}
                        >
                          <div
                            style={{
                              minWidth: "52px",
                              fontWeight: "600",
                              fontSize: "14px",
                              color: "#111827",
                              paddingTop: "2px",
                            }}
                          >
                            {leg.startTime}
                          </div>

                          <div
                            style={{
                              width: "10px",
                              display: "flex",
                              justifyContent: "center",
                              position: "relative",
                              flexShrink: 0,
                            }}
                          >
                            <div
                              style={{
                                width: "10px",
                                height: "10px",
                                borderRadius: "999px",
                                backgroundColor: "#9ca3af",
                                marginTop: "6px",
                              }}
                            />
                          </div>

                          <div
                            style={{
                              flex: 1,
                              paddingBottom: "8px",
                              borderBottom: "1px solid #eceff3",
                            }}
                          >
                            <div
                              style={{ fontWeight: "600", marginBottom: "3px" }}
                            >
                              {modeLabel(leg.mode)}
                              {leg.lineName ? ` · ${leg.lineName}` : ""}
                            </div>
                            <div style={{ color: "#4b5563", fontSize: "15px" }}>
                              {leg.from} → {leg.to}
                            </div>
                            <div
                              style={{
                                color: "#6b7280",
                                fontSize: "13px",
                                marginTop: "3px",
                              }}
                            >
                              {leg.startTime}–{leg.endTime}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>

                    <div
                      style={{
                        display: "flex",
                        gap: "12px",
                        marginTop: "8px",
                        alignItems: "center",
                      }}
                    >
                      <div
                        style={{
                          minWidth: "52px",
                          fontWeight: "600",
                          fontSize: "14px",
                        }}
                      >
                        {tripData.recommendedOption.arriveAirport}
                      </div>

                      <div
                        style={{
                          width: "10px",
                          display: "flex",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <div
                          style={{
                            width: "10px",
                            height: "10px",
                            borderRadius: "999px",
                            backgroundColor: "#111827",
                          }}
                        />
                      </div>

                      <div style={{ fontWeight: "600" }}>Fremme på OSL</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: "22px",
                  backgroundColor: "#fafafa",
                  border: "1px solid #ececec",
                  borderRadius: "16px",
                  color: "#6b7280",
                }}
              >
                Ingen anbefalt reise ennå.
              </div>
            )}
          </div>
        </div>

        {tripData?.recommendedOption && (
          <div style={{ marginTop: "32px" }}>
            <h3 style={{ fontSize: "22px", marginBottom: "12px" }}>
              Alle forslag
            </h3>

            {tripData.options.map((option) => (
              <div
                key={option.id}
                style={{
                  border: "1px solid #e5e5ea",
                  borderRadius: "14px",
                  padding: "20px",
                  marginBottom: "18px",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
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
                  <strong>Varighet:</strong>{" "}
                  {formatDuration(option.durationSeconds)}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Bytter:</strong> {option.changes}
                </p>
                <p style={{ margin: "4px 0" }}>
                  <strong>Gange:</strong> {option.walkDistance} meter
                </p>

                <div style={{ marginTop: "14px" }}>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                    }}
                  >
                    {option.legs.map((leg, i) => {
                      const isFoot = leg.mode?.toLowerCase() === "foot";

                      if (isFoot) {
                        return (
                          <div
                            key={i}
                            style={{
                              padding: "8px 10px",
                              borderRadius: "10px",
                              backgroundColor: "#fafafa",
                              border: "1px solid #f0f0f0",
                              color: "#6b7280",
                              fontSize: "13px",
                            }}
                          >
                            {modeLabel(leg.mode)} {leg.from} → {leg.to} ·{" "}
                            {leg.startTime}–{leg.endTime}
                          </div>
                        );
                      }

                      return (
                        <div
                          key={i}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "10px",
                            backgroundColor: "#f3f4f6",
                            border: "1px solid #eceff3",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: "600",
                              fontSize: "14px",
                              marginBottom: "3px",
                            }}
                          >
                            {modeLabel(leg.mode)}
                            {leg.lineName ? ` · ${leg.lineName}` : ""}
                          </div>

                          <div
                            style={{
                              color: "#4b5563",
                              fontSize: "14px",
                              lineHeight: 1.4,
                            }}
                          >
                            {leg.from} → {leg.to}
                          </div>

                          <div
                            style={{
                              color: "#6b7280",
                              fontSize: "12px",
                              marginTop: "4px",
                            }}
                          >
                            {leg.startTime}–{leg.endTime}
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
