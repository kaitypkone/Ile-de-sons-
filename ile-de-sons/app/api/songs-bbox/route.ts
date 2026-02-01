import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const minLng = Number(searchParams.get("minLng"));
  const minLat = Number(searchParams.get("minLat"));
  const maxLng = Number(searchParams.get("maxLng"));
  const maxLat = Number(searchParams.get("maxLat"));
  const artists = searchParams.getAll("artist").filter(Boolean);
const decennies = searchParams.getAll("decennie").filter(Boolean);
const styles = searchParams.getAll("style").filter(Boolean);
const echelles = searchParams.getAll("echelle").filter(Boolean);
  const languages = searchParams.getAll("language").filter(Boolean);
  const echelle2s = searchParams.getAll("echelle2").filter(Boolean);
  const sousTypes = searchParams.getAll("sous_type").filter(Boolean);

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
  let query = supabase
  .from("chansons")
  .select(
  "id, anciens_id, genius_song_id, full_title, title, main_artist, artist_names, place, echelle, echelle2, sous_type, latitude, longitude, youtube_embed, youtube_url, spotify_url, soundcloud_url, lyrics, annee, decennie, style, language"
)
  .in("echelle", ["Rue", "Commune", "Région"])
  .not("latitude", "is", null)
  .not("longitude", "is", null)
  .gte("longitude", minLng)
  .lte("longitude", maxLng)
  .gte("latitude", minLat)
  .lte("latitude", maxLat);

if (decennies.length) query = query.in("decennie", decennies);

// Artistes : OR entre main_artist et artist_names, et OR entre les artistes saisis
if (artists.length) {
  const ors = artists.flatMap((a) => [
    `main_artist.ilike.%${a}%`,
    `artist_names.ilike.%${a}%`,
  ]);
  query = query.or(ors.join(","));
}

// Styles : OR (au moins un style) => match dans le champ texte "style"
if (styles.length) {
  const ors = styles.map((s) => `style.ilike.%${s}%`);
  query = query.or(ors.join(","));
}

// Echelles (si tu les utilises)
if (echelles.length) {
  const ors: string[] = [];
  if (echelles.includes("Rue")) ors.push("echelle.eq.Rue");
  if (echelles.includes("Commune")) ors.push("echelle.eq.Commune");
  if (echelles.includes("Région")) ors.push("echelle.eq.Région");
  if (echelles.includes("Département")) ors.push("echelle2.eq.Département");
  if (ors.length) query = query.or(ors.join(","));
}

// Langues
if (languages.length) {
  query = query.in("language", languages);
}

// echelle2 (utile pour Département / Paris)
if (echelle2s.length) {
  query = query.in("echelle2", echelle2s);
}

// sous_type
if (sousTypes.length) {
  query = query.in("sous_type", sousTypes);
}

const { data, error } = await query.limit(6000);


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
