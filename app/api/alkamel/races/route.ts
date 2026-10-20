import { discoverRaces } from "../../../../src/alkamel";

export async function GET() {
  try {
    const races = await discoverRaces();
    return Response.json({ races }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Alkamel unavailable" }, { status: 502 });
  }
}
