import { NextResponse } from "next/server";

type NominatimItem = {
  display_name: string;
  lat: string;
  lon: string;
};

export async function POST(req: Request) {
  const { q } = (await req.json()) as { q: string };

  const qq = String(q ?? "").trim();
  if (qq.length < 3) return NextResponse.json([]);

  // BBOX approximative Île-de-France (lon/lat)
  // left, top, right, bottom (format Nominatim: left,top,right,bottom)
  const viewbox = "1.44,49.24,3.56,48.12";

  const url =
    "https://nominatim.openstreetmap.org/search" +
    `?format=jsonv2` +
    `&q=${encodeURIComponent(qq)}` +
    `&addressdetails=1` +
    `&limit=5` +
    `&countrycodes=fr` +
    `&viewbox=${encodeURIComponent(viewbox)}` +
    `&bounded=1`;

  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim demande un User-Agent explicite
        "User-Agent": "ile-de-sons (Next.js)",
        "Accept-Language": "fr",
      },
    });

    if (!res.ok) return NextResponse.json([]);

    const data = (await res.json()) as NominatimItem[];
    const out = (data ?? []).map((it) => ({
      label: it.display_name,
      lat: Number(it.lat),
      lng: Number(it.lon),
    }));

    return NextResponse.json(out);
  } catch {
    return NextResponse.json([]);
  }
}