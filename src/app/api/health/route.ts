export const dynamic = "force-dynamic";
// Liveness probe for container hosts. Reports whether keys are present, never their values.
export async function GET() {
  return Response.json({ ok: true, nebius: Boolean(process.env.NEBIUS_API_KEY), tavily: Boolean(process.env.TAVILY_API_KEY) });
}
