import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/authOptions";
import { fetchAllEvents } from "../../lib/googleCalendar";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return Response.json(
        { error: "Ikke logget inn med Google." },
        { status: 401 },
      );
    }

    const { events } = await fetchAllEvents(session.accessToken);

    events.sort((a, b) => {
      const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
      const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
      return aTime - bTime;
    });

    return Response.json({ count: events.length, events });
  } catch (error) {
    return Response.json(
      { error: error.message || "Klarte ikke å hente kalender-events." },
      { status: 500 },
    );
  }
}
