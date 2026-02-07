// app/api/geo-ids-for-filters/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Filters = {
  artists?: string[];
  decennies?: string[];
  styles?: string[];
  languages?: string[];
};

function uniq(arr: string[]) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function isBlank(v: any) {
  return v == null || (typeof v === "string" && v.trim() === "");
}

// Même logique que ton kindFromRow côté client
function kindFromRow(
  echelle: string | null,
  echelle2: string | null,
  sous_type: string | null
): "idf" | "dep" | "river" | "rail" | null {
  if (echelle2 === "Département") return "dep";
  if (echelle === "Région" && sous_type === "Fleuves") return "river";
  if (echelle === "Région" && sous_type === "Lignes de trains - métros") return "rail";
  if (echelle === "Région" && isBlank(sous_type)) return "idf";
  return null;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const body = (await req.json().catch(() => ({}))) as { filters?: Filters };
    const filters: Filters = body.filters ?? {};

    const artists = (filters.artists ?? []).map((s) => s.trim()).filter(Boolean);
    const decennies = (filters.decennies ?? []).map((s) => s.trim()).filter(Boolean);
    const styles = (filters.styles ?? []).map((s) => s.trim()).filter(Boolean);
    const languages = (filters.languages ?? []).map((s) => s.trim()).filter(Boolean);

    // On ne récupère QUE les colonnes nécessaires pour déterminer les entités geo
    let q = supabase
      .from("chansons")
      .select("anciens_id,echelle,echelle2,sous_type,main_artist,artist_names,decennie,language,style")
      .not("anciens_id", "is", null);

    // Décennies / langues : simple IN
    if (decennies.length) q = q.in("decennie", decennies);
    if (languages.length) q = q.in("language", languages);

    // Artistes : on accepte main_artist OU artist_names (feat)
    if (artists.length) {
      const orParts: string[] = [];
      for (const a of artists) {
        const safe = a.replace(/,/g, " "); // supabase OR utilise des virgules
        orParts.push(`main_artist.eq.${safe}`);
        // match dans artist_names (feat) : contient
        orParts.push(`artist_names.ilike.%${safe}%`);
      }
      q = q.or(orParts.join(","));
    }

    // Styles : la colonne est une string "pop, rap, ..."
    // => on fait un ilike contains pour chaque style (OR)
    if (styles.length) {
      const orParts: string[] = [];
      for (const s of styles) {
        const safe = s.replace(/,/g, " ");
        orParts.push(`style.ilike.%${safe}%`);
      }
      q = q.or(orParts.join(","));
    }

    // ⚠️ Important : Supabase peut paginer si beaucoup de lignes.
    // Ici on ne veut que les IDs uniques => on lit en plusieurs pages.
    const PAGE = 5000;
    let from = 0;

    const idf: string[] = [];
    const dep: string[] = [];
    const river: string[] = [];
    const rail: string[] = [];

    while (true) {
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const rows = (data ?? []) as Array<{
        anciens_id: string | null;
        echelle: string | null;
        echelle2: string | null;
        sous_type: string | null;
      }>;

      for (const r of rows) {
        if (!r.anciens_id) continue;

        const kind = kindFromRow(r.echelle, r.echelle2, r.sous_type);
        if (!kind) continue;

        if (kind === "idf") idf.push(r.anciens_id);
        if (kind === "dep") dep.push(r.anciens_id);
        if (kind === "river") river.push(r.anciens_id);
        if (kind === "rail") rail.push(r.anciens_id);
      }

      if (rows.length < PAGE) break;
      from += PAGE;
    }

    return NextResponse.json({
      idf: uniq(idf),
      dep: uniq(dep),
      river: uniq(river),
      rail: uniq(rail),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Erreur serveur" },
      { status: 500 }
    );
  }
}

// (optionnel) si quelqu’un appelle en GET
export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}
