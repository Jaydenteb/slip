import { connection } from "next/server";
import { db } from "@/lib/db";

// For Render's health check and an uptime monitor: is the app up and can it reach its
// database? It deliberately doesn't call PayPal or Claude, so pinging it costs nothing.
export async function GET() {
  await connection();
  try {
    await db.$queryRaw`SELECT 1`;
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error(JSON.stringify({ level: "error", at: new Date().toISOString(), route: "/api/health", message: "database unreachable" }));
    return Response.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
