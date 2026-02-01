import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Filters = {
  artists?: string[];
  decennies?: string[];
  styles?: string[];
  echelles?: string[];
  languages?: string[];
  echelle2s?: string[];
  sous_types?: string[];
};

function applyCommonFilters(query: any, filters: Filters) {
  const artists = (filters.artists ?? []).filter(Boolean);
  const decennies = (filters.decennies ?? []).filter(Boolean);
  const styles = (filters.styles ?? []).filter(Boolean);
  const echelles = (filters.echelles ?? []).filter(Boolean);
  const languages = (filters.languages ?? []).filter(Boolean);
  const echelle2s = (filters.echelle2s ?? []).filter(Boolean);
  const sousTypes = (filters.sous_types ?? []).filter(Boolean);

  if (decennies.length) query = query.in("decennie", decennies);

  // Artistes : OR entre main_artist et artist_names
  if (artists.length) {
    const ors = artists.flatMap((a) => [
      `main_artist.ilike.%${a}%`,
      `artist_names.ilike.%${a}%`,
    ]);
    query = query.or(ors.join(","));
  }

  // Styles : match texte
  if (styles.length) {
    const ors = styles.map((s) => `style.ilike.%${s}%`);
    query = query.or(ors.join(","));
  }

  // Echelles (si tu les utilises dans l’UI)
  if (echelles.length) {
    const ors: string[] = [];
    if (echelles.includes("Rue")) ors.push("echelle.eq.Rue");
    if (echelles.includes("Commune")) ors.push("echelle.eq.Commune");
    if (echelles.includes("Région")) ors.push("echelle.eq.Région");
    // Département = souvent echelle2
    if (echelles.includes("Département")) ors.push("echelle2.eq.Département");
    if (ors.length) query = query.or(ors.join(","));
  }

  if (languages.length) query = query.in("language", languages);
  if (echelle2s.length) query = query.in("echelle2", echelle2s);
  if (sousTypes.length) query = query.in("sous_type", sousTypes);

  return query;
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const kind = body?.kind as "idf" | "dep" | "river" | "rail" | undefined;
  const id = body?.id;
  const filters = (body?.filters ?? {}) as Filters;

  const offset = Number.isFinite(Number(body?.offset)) ? Number(body.offset) : 0;
  const limit = Number.isFinite(Number(body?.limit)) ? Number(body.limit) : 100;

  if (!kind || id === undefined || id === null) {
    return NextResponse.json({ error: "Missing kind/id" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Base query : on récupère les chansons liées par anciens_id
  // IMPORTANT : anciens_id est souvent texte, donc on cast en string
  let query = supabase
    .from("chansons")
    .select(
      "id, genius_song_id, full_title, title, main_artist, artist_names, place, anciens_id, echelle, echelle2, sous_type, latitude, longitude, youtube_embed, youtube_url, spotify_url, soundcloud_url, lyrics, annee, decennie, language",
      { count: "exact" }
    )
    .eq("anciens_id", String(id));

  // Contraintes par type de GeoJSON
  if (kind === "dep") {
    // Département : echelle2 = Département
    query = query.eq("echelle2", "Département");
  }

  if (kind === "river") {
    // Fleuves : echelle = Région & sous_type = Fleuves
    query = query.eq("echelle", "Région").eq("sous_type", "Fleuves");
  }

  if (kind === "rail") {
    // Rail : echelle = Région & sous_type = Lignes de trains - métros
    query = query
      .eq("echelle", "Région")
      .eq("sous_type", "Lignes de trains - métros");
  }

  if (kind === "idf") {
    // IDF (région) : echelle = Région & sous_type NULL
    // Selon ton DB, c’est parfois "" au lieu de NULL → ajuste si besoin
    query = query.eq("echelle", "Région").is("sous_type", null);
  }

  // + Filtres “communs” (artistes, styles, etc.)
  query = applyCommonFilters(query, filters);

  // Pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("songs-by-geo error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const songs = data ?? [];
  const hasMore = offset + songs.length < total;

  return NextResponse.json({ songs, total, hasMore });
}
