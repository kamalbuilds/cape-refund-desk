import { runRuleWatch } from "@/lib/rulewatch";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET() { return Response.json(await runRuleWatch()); }
