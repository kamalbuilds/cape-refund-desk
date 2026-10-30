import { probeLive } from "@/lib/health";
import { providerName } from "@/lib/provider";
export const dynamic = "force-dynamic";
// Liveness probe for container hosts. Reports whether keys are present, never their values.
export async function GET() {
  const h = await probeLive();
  return Response.json({ ok: true, nebius: Boolean(process.env.NEBIUS_API_KEY), tavily: Boolean(process.env.TAVILY_API_KEY), live: h.live, liveReason: h.reason, provider: providerName() });
}
