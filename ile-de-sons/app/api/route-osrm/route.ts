import { NextResponse } from "next/server";

type Body = {
  coordinates: Array<[number, number]>; // [[lng, lat], ...]
  profile?: "driving" | "walking" | "cycling";
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const coords = Array.isArray(body?.coordinates) ? body.coordinates : [];
    const profile = body?.profile ?? "driving";

    if (coords.length < 2) {
      return NextResponse.json({ geometry: null });
    }

    // OSRM expects: lng,lat;lng,lat;...
    const coordStr = coords.map(([lng, lat]) => `${lng},${lat}`).join(";");

    const url =
      `https://router.project-osrm.org/route/v1/${profile}/` +
      `${coordStr}?overview=full&geometries=geojson&steps=false`;

    const res = await fetch(url, {
      // petit cache côté serveur (optionnel)
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return NextResponse.json(
        { geometry: null, error: `OSRM error ${res.status}` },
        { status: 502 }
      );
    }

    const json = await res.json();
    const geometry = json?.routes?.[0]?.geometry ?? null; // GeoJSON LineString

    return NextResponse.json({ geometry });
  } catch (e: any) {
    return NextResponse.json(
      { geometry: null, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}