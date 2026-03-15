import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/authOptions";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return Response.json(
      { error: "Ikke logget inn med Google." },
      { status: 401 },
    );
  }

  const now = new Date();
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);

  const url =
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?" +
    new URLSearchParams({
      timeMin: now.toISOString(),
      timeMax: in30Days.toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "50",
    }).toString();

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });

  const data = await response.json();

  if (!response.ok) {
    return Response.json(
      { error: data.error?.message || "Klarte ikke å hente kalender." },
      { status: response.status },
    );
  }

  const events = (data.items || []).map((event) => ({
    id: event.id,
    title: event.summary || "",
    description: event.description || "",
    location: event.location || "",
    startTime: event.start?.dateTime || event.start?.date || null,
    endTime: event.end?.dateTime || event.end?.date || null,
  }));

  return Response.json({ events });
}
