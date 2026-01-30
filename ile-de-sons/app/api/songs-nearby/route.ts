import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Filters = {
  artists?: string[];
  echelles?: string[];
  decennies?: string[];
  styles?: string[];
  languages?: string[]; // ✅ AJOUT
};

function norm(s: string) {
  return String(s ?? "").toLowerCase().trim();
}

// styles: en DB tu as parfois "r&b, pop, rap"
function songHasAnyStyle(songStyle: string | null | undefined, wanted: string[]) {
  const raw = norm(songStyle ?? "");
  if (!raw) return false;

  const tokens = raw
    .split(",")
    .map((x) => norm(x))
    .filter(Boolean);

  // Si l’utilisateur met "rap", on garde si un token contient "rap"
  return wanted.some((w) => {
    const ww = norm(w);
    if (!ww) return false;
    return tokens.some((t) => t.includes(ww));
  });
}

function applyFiltersToSongs(songs: any[], filters?: Filters) {
  if (!filters) return songs;

  const artists = (filters.artists ?? []).map(norm).filter(Boolean);
  const decennies = (filters.decennies ?? []).map(norm).filter(Boolean);
  const styles = (filters.styles ?? []).map(norm).filter(Boolean);
  const languages = (filters.languages ?? []).map(norm).filter(Boolean);

  return songs.filter((s) => {
    // décennies
    if (decennies.length) {
      const d = norm(s.decennie);
      if (!decennies.includes(d)) return false;
    }

    // langues
    if (languages.length) {
      const lang = norm(s.language);
      if (!languages.includes(lang)) return false;
    }

    // artistes (main_artist OU artist_names contient l’un des chips)
    if (artists.length) {
      const a1 = norm(s.main_artist);
      const a2 = norm(s.artist_names);
      const ok = artists.some((a) => a1.includes(a) || a2.includes(a));
      if (!ok) return false;
    }

    // styles (multi-valeurs)
    if (styles.length) {
      if (!songHasAnyStyle(s.style, styles)) return false;
    }

    return true;
  });
}

export async function POST(req: Request) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { lat, lng, radiusKm = 20, limit = 100, filters } = (await req.json()) as {
    lat: number;
    lng: number;
    radiusKm?: number;
    limit?: number;
    filters?: Filters;
  };

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ songs: [] }, { status: 400 });
  }

  // RPC Postgres qui renvoie déjà distance_km + champs chanson
  const { data, error } = await supabase.rpc("songs_nearby", {
    p_lat: lat,
    p_lng: lng,
    p_radius_km: radiusKm,
    p_limit: limit,
  });

  if (error || !data) return NextResponse.json({ songs: [] });

  // ✅ Filtre côté API (JS)
  const filtered = applyFiltersToSongs(data as any[], filters);

  return NextResponse.json({ songs: filtered });
}
