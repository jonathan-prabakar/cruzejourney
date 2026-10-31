import { createIntelligenceRequestHandler } from "@/lib/intelligence/http.server";
import { isSameOrigin } from "@/lib/intelligence/origin.server";
import { gemmaConfiguration } from "@/lib/intelligence/configuration";
import { getDemoSnapshot } from "@/lib/integration/snapshot";
import { isDemoRouteId } from "@/lib/integration/routes";
import { getStoredRoutePlan } from "@/lib/integration/rerouting.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  return Response.json(
    {
      ...gemmaConfiguration(process.env),
      mode: "synthetic-demo",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export const POST = createIntelligenceRequestHandler({
  authorize: isSameOrigin,
  resolveContext: (body) => {
    if (
      !body ||
      typeof body !== "object" ||
      !("index" in body) ||
      typeof body.index !== "number" ||
      Object.keys(body).some(
        (key) =>
          key !== "index" &&
          key !== "routeId" &&
          key !== "mode" &&
          key !== "planId",
      )
    )
      throw new Error("Invalid request");
    const routeId = "routeId" in body ? body.routeId : "austin";
    if (!isDemoRouteId(routeId)) throw new Error("Invalid route");
    if ("mode" in body && body.mode !== "road") throw new Error("Invalid mode");
    const plan =
      "planId" in body ? getStoredRoutePlan(body.planId, routeId) : undefined;
    return getDemoSnapshot(body.index, routeId, true, plan?.trip).context;
  },
});
