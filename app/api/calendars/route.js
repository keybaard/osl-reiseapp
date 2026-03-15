import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/authOptions";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return Response.json({ error: "Ikke logget inn." }, { status: 401 });
  }

  const response = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList",
    {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
      },
      cache: "no-store",
    },
  );

  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      { error: data.error?.message || "Klarte ikke å hente kalendere." },
      { status: response.status },
    );
  }

  const calendars = (data.items || []).map((cal) => ({
    id: cal.id,
    summary: cal.summary,
    primary: cal.primary || false,
    accessRole: cal.accessRole,
  }));

  return Response.json({ calendars });
}
