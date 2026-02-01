import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Filters = {
  artists?: string[];
  echelles?: string[];
  decennies?: string[];
  styles?: string[];
  languages?: string[];
};

export async function POST(req: Request) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { place, filters, offset = 0, limit = 50 } = (await req.json()) as {
  place: string;
  filters: Filters;
  offset?: number;
  limit?: number;
};
  const p = String(place ?? "").trim();
  if (!p)
  return NextResponse.json({
    center: null,
    songs: [],
    total: 0,
    offset: 0,
    limit,
    hasMore: false,
  });

  let query = supabase
    .from("chansons")
    .select(
  "id, genius_song_id, full_title, title, main_artist, artist_names, place, anciens_id, echelle, echelle2, sous_type, latitude, longitude, youtube_embed, youtube_url, spotify_url, soundcloud_url, lyrics, annee, decennie, language"
)
    .eq("place", p)
.range(offset, offset + limit - 1);


  if (filters?.decennies?.length) query = query.in("decennie", filters.decennies);

  if (filters?.languages?.length) query = query.in("language", filters.languages);

  if (filters?.echelles?.length) {
    const hasDep = filters.echelles.includes("Département");
    const hasReg = filters.echelles.includes("Région");
    const hasCom = filters.echelles.includes("Commune");
    const hasRue = filters.echelles.includes("Rue");

    const ors: string[] = [];
    if (hasRue) ors.push(`echelle.eq.Rue`);
    if (hasCom) ors.push(`echelle.eq.Commune`);
    if (hasReg) ors.push(`echelle.eq.Région`);
    if (hasDep) ors.push(`echelle2.eq.Département`);

    if (ors.length) query = query.or(ors.join(","));
  }

  if (filters?.artists?.length) {
    const ors = filters.artists.flatMap((a) => [
      `main_artist.ilike.%${a}%`,
      `artist_names.ilike.%${a}%`,
    ]);
    query = query.or(ors.join(","));
  }

  if (filters?.styles?.length) {
    const ors = filters.styles.map((s) => `style.ilike.%${s}%`);
    query = query.or(ors.join(","));
  }

  // --- COUNT EXACT avec les mêmes filtres ---
let countQuery = supabase
  .from("chansons")
  .select("id", { count: "exact", head: true })
  .eq("place", p);

if (filters?.decennies?.length)
  countQuery = countQuery.in("decennie", filters.decennies);

if (filters?.languages?.length)
  countQuery = countQuery.in("language", filters.languages);

if (filters?.echelles?.length) {
  const hasDep = filters.echelles.includes("Département");
  const hasReg = filters.echelles.includes("Région");
  const hasCom = filters.echelles.includes("Commune");
  const hasRue = filters.echelles.includes("Rue");

  const ors: string[] = [];
  if (hasRue) ors.push(`echelle.eq.Rue`);
  if (hasCom) ors.push(`echelle.eq.Commune`);
  if (hasReg) ors.push(`echelle.eq.Région`);
  if (hasDep) ors.push(`echelle2.eq.Département`);

  if (ors.length) countQuery = countQuery.or(ors.join(","));
}

if (filters?.artists?.length) {
  const ors = filters.artists.flatMap((a) => [
    `main_artist.ilike.%${a}%`,
    `artist_names.ilike.%${a}%`,
  ]);
  countQuery = countQuery.or(ors.join(","));
}

if (filters?.styles?.length) {
  const ors = filters.styles.map((s) => `style.ilike.%${s}%`);
  countQuery = countQuery.or(ors.join(","));
}

const { count: totalCount } = await countQuery;
const total = typeof totalCount === "number" ? totalCount : 0;

  const { data, error } = await query;
  if (error || !data)
  return NextResponse.json({
    center: null,
    songs: [],
    total,
    offset,
    limit,
    hasMore: false,
  });

  // centre : moyenne des coords dispo (si Rue/Commune)
  const coords = (data as any[])
    .filter((r) => typeof r.longitude === "number" && typeof r.latitude === "number")
    .map((r) => [r.longitude as number, r.latitude as number] as const);

  let center: [number, number] | null = null;
  if (coords.length) {
    const lng = coords.reduce((s, c) => s + c[0], 0) / coords.length;
    const lat = coords.reduce((s, c) => s + c[1], 0) / coords.length;
    center = [lng, lat];
  }

  const hasMore = offset + limit < total;

return NextResponse.json({
  center,
  songs: data,
  total,
  offset,
  limit,
  hasMore,
});
}
