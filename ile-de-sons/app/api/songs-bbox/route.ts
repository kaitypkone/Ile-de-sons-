import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minLng = Number(searchParams.get("minLng"));
  const minLat = Number(searchParams.get("minLat"));
  const maxLng = Number(searchParams.get("maxLng"));
  const maxLat = Number(searchParams.get("maxLat"));

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return NextResponse.json({ error: "Bad bbox" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Rue + Commune : géolocalisées en points
  // On filtre aussi sur lat/lng non null.
  const { data, error } = await supabase
    .from("chansons")
    .select(
      "id, genius_song_id, full_title, title, main_artist, artist_names, place, echelle, echelle2, sous_type, latitude, longitude, youtube_embed, youtube_url, spotify_url, soundcloud_url, lyrics, annee, decennie"
    )
    .in("echelle", ["Rue", "Commune"])
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("longitude", minLng)
    .lte("longitude", maxLng)
    .gte("latitude", minLat)
    .lte("latitude", maxLat)
    .limit(6000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const features = (data ?? []).map((row: any) => ({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [row.longitude, row.latitude],
    },
    properties: row,
  }));

  return NextResponse.json({
    type: "FeatureCollection",
    features,
  });
}
