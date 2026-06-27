import { buildRequestedDateTime, planTripsToAirport } from "../../lib/entur";

export async function POST(request) {
  try {
    const body = await request.json();
    const { fromLocation, arrivalDate, arrivalTime } = body;

    if (!fromLocation || !arrivalDate || !arrivalTime) {
      return Response.json(
        { error: "Mangler startsted, dato eller ankomsttid." },
        { status: 400 },
      );
    }

    // arrivalDate/arrivalTime are wall-clock values the user typed for Oslo.
    const dateTime = buildRequestedDateTime(arrivalDate, arrivalTime);

    const { fromPlace, airportStops, options, recommendedOption } =
      await planTripsToAirport(fromLocation, dateTime);

    return Response.json({
      fromLocation: fromPlace.name,
      targetArrivalDate: arrivalDate,
      targetArrivalTime: arrivalTime,
      targetDateTime: dateTime,
      airportStops,
      recommendedLeaveTime: recommendedOption?.leaveHome || null,
      recommendedOption,
      options,
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Noe gikk galt mot Entur." },
      { status: error.status || 500 },
    );
  }
}
