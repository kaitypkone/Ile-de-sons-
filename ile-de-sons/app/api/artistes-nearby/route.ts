import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  lat: number;
  lng: number;
  radiusKm?: number;
  limit?: number;
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// bbox approx autour d’un point (suffisant pour pré-filtrer)
function bboxFromRadius(lat: number, lng: number, radiusKm: number) {
  const dLat = radiusKm / 111; // ~111 km par degré latitude
  const dLng = radiusKm / (111 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ error: "Bad body" }, { status: 400 });

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const radiusKm = Number(body.radiusKm ?? 30);
  const limit = Math.min(500, Math.max(1, Number(body.limit ?? 100)));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Bad coords" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const bb = bboxFromRadius(lat, lng, radiusKm);

  const { data, error } = await supabase
    .from("artistes")
    .select(
      `id, artiste, commune_origine, style, annee_de_naissance, latitude, longitude, lien, image_wikipedia`
    )
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("latitude", bb.minLat)
    .lte("latitude", bb.maxLat)
    .gte("longitude", bb.minLng)
    .lte("longitude", bb.maxLng)
    .limit(3000);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? [])
    .map((a: any) => {
      const alat = Number(a.latitude);
      const alng = Number(a.longitude);
      const d = Number.isFinite(alat) && Number.isFinite(alng)
        ? haversineKm(lat, lng, alat, alng)
        : null;
      return { ...a, distance_km: d };
    })
    .filter((a: any) => typeof a.distance_km === "number" && a.distance_km <= radiusKm)
    .sort((a: any, b: any) => a.distance_km - b.distance_km)
    .slice(0, limit);

  return NextResponse.json({
    count: rows.length,
    artistes: rows,
  });
}
