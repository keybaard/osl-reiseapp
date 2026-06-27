import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/authOptions";
import { getUpcomingFlights } from "../../lib/googleCalendar";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return Response.json({ error: "Ikke logget inn." }, { status: 401 });
    }

    const { calendars, detectedFlights } = await getUpcomingFlights(
      session.accessToken,
    );

    return Response.json({
      nextFlight: detectedFlights[0] || null,
      allFlights: detectedFlights,
      checkedCalendars: calendars.map((c) => ({ id: c.id, summary: c.summary })),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Noe gikk galt ved henting av fly." },
      { status: 500 },
    );
  }
}
