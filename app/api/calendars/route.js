import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/authOptions";
import { fetchCalendarList } from "../../lib/googleCalendar";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return Response.json({ error: "Ikke logget inn." }, { status: 401 });
    }

    const items = await fetchCalendarList(session.accessToken);

    const calendars = items.map((cal) => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false,
      accessRole: cal.accessRole,
    }));

    return Response.json({ calendars });
  } catch (error) {
    return Response.json(
      { error: error.message || "Klarte ikke å hente kalendere." },
      { status: 500 },
    );
  }
}
