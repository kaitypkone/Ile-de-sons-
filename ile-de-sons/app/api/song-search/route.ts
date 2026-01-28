import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function makeSnippet(text: string, needle: string, fallbackNeedle?: string) {
  const t = text ?? "";
  const n = (needle ?? "").trim();
  const fn = (fallbackNeedle ?? "").trim();

  const lower = t.toLowerCase();
  let idx = n ? lower.indexOf(n.toLowerCase()) : -1;

  if (idx < 0 && fn) idx = lower.indexOf(fn.toLowerCase());

  if (idx < 0) {
    // extrait tout début
    const short = t.slice(0, 140);
    return short.length < t.length ? short + "…" : short;
  }

  const start = Math.max(0, idx - 42);
const end = Math.min(t.length, idx + 80);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < t.length ? "…" : "";
  return prefix + t.slice(start, end) + suffix;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function boldAllCaseInsensitive(text: string, what: string) {
  if (!text || !what) return text;
  const re = new RegExp(`(${escapeRegExp(what)})`, "gi");
  // on retourne du “pseudo-markdown” avec **…**
  return text.replace(re, "**$1**");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") ?? "").trim();

  if (qRaw.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // On cherche sur plusieurs champs en OR.
  // Tolérant à la casse via ilike. V1 = pas de “typos”, mais déjà très utile.
  const like = `%${qRaw}%`;

  const loose = `%${qRaw.replace(/[\s\-’'"]+/g, "%")}%`;

  const { data, error } = await supabase
    .from("chansons")
    .select(
      "id, genius_song_id, full_title, title, main_artist, artist_names, place, anciens_id, echelle, echelle2, sous_type, latitude, longitude, youtube_embed, youtube_url, spotify_url, soundcloud_url, lyrics, annee, decennie"
    )
    .or(
  [
    `title.ilike.${like}`,
    `full_title.ilike.${like}`,
    `artist_names.ilike.${like}`,
    `main_artist.ilike.${like}`,
    `lyrics.ilike.${like}`,
    // version "loose" (espaces/tirets tolérés)
    `title.ilike.${loose}`,
    `full_title.ilike.${loose}`,
  ].join(",")
)
    .limit(12);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = (data ?? []).map((row: any) => {
    const lyrics: string = row.lyrics ?? "";
    const place: string = row.place ?? "";

    // On veut un extrait où le lieu est mentionné (en gras), tolérant à la casse.
    // Si on ne trouve pas le lieu dans les paroles, on fait un extrait autour de la requête.
    const rawSnippet = makeSnippet(lyrics, place, qRaw);
    const snippet = place ? boldAllCaseInsensitive(rawSnippet, place) : rawSnippet;

    return {
      id: row.id,
      genius_song_id: row.genius_song_id,
      full_title: row.full_title,
      title: row.title,
      main_artist: row.main_artist,
      artist_names: row.artist_names,
      place: row.place,
      anciens_id: row.anciens_id,
      echelle: row.echelle,
      echelle2: row.echelle2,
      sous_type: row.sous_type,
      latitude: row.latitude,
      longitude: row.longitude,
      youtube_embed: row.youtube_embed,
      youtube_url: row.youtube_url,
      spotify_url: row.spotify_url,
      soundcloud_url: row.soundcloud_url,
      lyrics: row.lyrics,
      annee: row.annee,
      decennie: row.decennie,
      snippet,
    };
  });

  return NextResponse.json({ results });
}
