function normQ(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enlève accents
    .toLowerCase()
    .replace(/[’']/g, " ")          // apostrophes -> espace
    .replace(/[-‐-‒–—―]/g, " ")      // tirets -> espace
    .replace(/[^a-z0-9]+/g, " ")     // tout le reste -> espace
    .replace(/\s+/g, " ")
    .trim();
}

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
  const artists = searchParams.getAll("artist").filter(Boolean);
const decennies = searchParams.getAll("decennie").filter(Boolean);
const styles = searchParams.getAll("style").filter(Boolean);
const echelles = searchParams.getAll("echelle").filter(Boolean);
const languages = searchParams.getAll("language").filter(Boolean);


  if (qRaw.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // On cherche sur plusieurs champs en OR.
  // Tolérant à la casse via ilike. V1 = pas de “typos”, mais déjà très utile.

 // On cherche sur plusieurs champs en OR.
const q = normQ(qRaw);
const like = `%${q}%`;

// version “tokens” : "joe taxi" -> "%joe%taxi%"
const loose = `%${q.split(" ").join("%")}%`;

const andParts: string[] = [
  `or(title_norm.ilike.${like},title_norm.ilike.${loose})`,
];


// Filtre artistes (OR entre main_artist et artist_names, et OR entre les artistes sélectionnés)
if (artists.length) {
  const ors = artists.flatMap((a) => [
    `main_artist.ilike.%${a}%`,
    `artist_names.ilike.%${a}%`,
  ]);
  andParts.push(`or(${ors.join(",")})`);
}

// Filtre styles : OR (au moins un style sélectionné doit apparaître dans la colonne "style")
if (styles.length) {
  const ors = styles.map((s) => `style.ilike.%${s}%`);
  andParts.push(`or(${ors.join(",")})`);
}

// Filtre échelles : echelle + echelle2 (Paris en Département via echelle2)
if (echelles.length) {
  const ors: string[] = [];
  if (echelles.includes("Rue")) ors.push("echelle.eq.Rue");
  if (echelles.includes("Commune")) ors.push("echelle.eq.Commune");
  if (echelles.includes("Région")) ors.push("echelle.eq.Région");
  if (echelles.includes("Département")) ors.push("echelle2.eq.Département");
  if (ors.length) andParts.push(`or(${ors.join(",")})`);
}

// Requête : AND(...) autour de plusieurs blocs OR(...)
let query = supabase
  .from("chansons")
  .select(
  "id, genius_song_id, full_title, title, main_artist, artist_names, place, anciens_id, echelle, echelle2, sous_type, latitude, longitude, youtube_embed, youtube_url, spotify_url, soundcloud_url, lyrics, annee, decennie, language"
)
  .or(`and(${andParts.join(",")})`)
  .limit(12);

// Décennies : filtre direct (AND)
if (languages.length) query = query.in("language", languages);

if (decennies.length) query = query.in("decennie", decennies);

const { data, error } = await query;


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
