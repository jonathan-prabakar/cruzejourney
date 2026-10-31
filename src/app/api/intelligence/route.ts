import { createIntelligenceRequestHandler } from "@/lib/intelligence/http.server";
import {
  DEFAULT_GEMMA_MODEL,
  SUPPORTED_GEMMA_MODELS,
} from "@/lib/intelligence/gemma.server";
import { getDemoSnapshot } from "@/lib/integration/snapshot";
import { isDemoRouteId } from "@/lib/integration/routes";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  const model = process.env.GEMMA_MODEL ?? DEFAULT_GEMMA_MODEL;
  return Response.json(
    {
      available:
        Boolean(process.env.GEMINI_API_KEY?.trim()) &&
        SUPPORTED_GEMMA_MODELS.some((m) => m === model),
      model,
      mode: "synthetic-demo",
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export const POST = createIntelligenceRequestHandler({
  authorize: (request) =>
    request.headers.get("origin") === new URL(request.url).origin,
  resolveContext: (body) => {
    if (
      !body ||
      typeof body !== "object" ||
      !("index" in body) ||
      typeof body.index !== "number" ||
      Object.keys(body).some((key) => key !== "index" && key !== "routeId" && key !== "mode")
    )
      throw new Error("Invalid request");
    const routeId = "routeId" in body ? body.routeId : "austin";
    if (!isDemoRouteId(routeId)) throw new Error("Invalid route");
    if ("mode" in body && body.mode !== "road") throw new Error("Invalid mode");
    return getDemoSnapshot(body.index, routeId, "mode" in body && body.mode === "road").context;
  },
});
