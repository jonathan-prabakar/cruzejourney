import { createIntelligenceRequestHandler } from "@/lib/intelligence/http.server";
import { isSameOrigin } from "@/lib/intelligence/origin.server";
import { gemmaConfiguration } from "@/lib/intelligence/configuration";
import { getDemoSnapshot } from "@/lib/integration/snapshot";
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
      Object.keys(body).some((key) => key !== "index")
    )
      throw new Error("Invalid request");
    return getDemoSnapshot(body.index).context;
  },
});
