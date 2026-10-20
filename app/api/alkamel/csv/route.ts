import { alkamelUrl, type Championship } from "../../../../src/alkamel";

export async function GET(request: Request) {
  let url: string;
  try {
    const params = new URL(request.url).searchParams;
    url = alkamelUrl(params.get("championship") as Championship, params.get("path") || "");
  } catch {
    return Response.json({ error: "Invalid race path" }, { status: 400 });
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return Response.json({ error: `Alkamel HTTP ${response.status}` }, { status: 502 });
    const text = await response.text();
    if (!text.includes("LAP_NUMBER") || !text.includes("NUMBER"))
      return Response.json({ error: "Alkamel returned an unexpected CSV" }, { status: 502 });
    return new Response(text, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
  } catch {
    return Response.json({ error: "Could not reach Alkamel" }, { status: 502 });
  }
}
