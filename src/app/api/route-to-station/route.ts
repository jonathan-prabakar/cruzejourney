import { isDemoRouteId } from "@/lib/integration/routes";
import {
  createStationRoute,
  RoutingError,
} from "@/lib/integration/rerouting.server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin)
    return Response.json(
      { error: "Same-origin requests required." },
      { status: 401 },
    );
  try {
    const text = await request.text();
    if (text.length > 2048) throw new RoutingError("Invalid routing request.");
    const body = JSON.parse(text);
    if (
      !body ||
      !isDemoRouteId(body.routeId) ||
      !Number.isInteger(body.index) ||
      typeof body.stationId !== "string" ||
      body.stationId.length > 100 ||
      (body.planId !== undefined && typeof body.planId !== "string") ||
      Object.keys(body).some(
        (key) => !["routeId", "index", "stationId", "planId"].includes(key),
      )
    )
      throw new RoutingError("Invalid routing request.");
    return Response.json(
      await createStationRoute(
        body.routeId,
        body.index,
        body.stationId,
        body.planId,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to route to station.",
      },
      { status: error instanceof RoutingError ? error.status : 400 },
    );
  }
}
