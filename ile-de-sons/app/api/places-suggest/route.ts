import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type Filters = {
  artists?: string[];
  echelles?: string[];
  decennies?: string[];
  styles?: string[];
};

type Suggest = {
  place: string;
  echelle: string | null;
  echelle2: string | null;
  sous_type: string | null;
  anciens_id: string | null;  // ✅ AJOUT
  count: number;
};

function applyCommonFilters<T extends ReturnType<typeof createClient>["from"] extends any ? any : any>(
  q: any,
  filters: Filters | undefined
) {
  if (filters?.decennies?.length) q = q.in("decennie", filters.decennies);

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

    if (ors.length) q = q.or(ors.join(","));
  }

  if (filters?.artists?.length) {
    const ors = filters.artists.flatMap((a) => [
      `main_artist.ilike.%${a}%`,
      `artist_names.ilike.%${a}%`,
    ]);
    q = q.or(ors.join(","));
  }

  if (filters?.styles?.length) {
    const ors = filters.styles.map((s) => `style.ilike.%${s}%`);
    q = q.or(ors.join(","));
  }

  return q;
}

export async function POST(req: Request) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { q, filters } = (await req.json()) as { q: string; filters: Filters };

  const qq = String(q ?? "").trim();
  if (qq.length < 2) return NextResponse.json([]);

  // 1) Suggestions rapides (échantillon)
  let base = supabase
    .from("chansons")
    .select("place,echelle,echelle2,sous_type,anciens_id")
    .ilike("place", `%${qq}%`)
    .limit(600);

  base = applyCommonFilters(base, filters);

  const { data, error } = await base;
  if (error || !data) return NextResponse.json([]);

  // 2) Agrégation sur l’échantillon
  const map = new Map<string, Suggest>();

  for (const row of data as any[]) {
    const place = row.place ?? "";
    if (!place) continue;

    const key = `${place}||${row.echelle ?? ""}||${row.echelle2 ?? ""}||${row.sous_type ?? ""}||${row.anciens_id ?? ""}`;
    const cur = map.get(key);
    if (cur) cur.count += 1;
    else {
      map.set(key, {
        place,
        echelle: row.echelle ?? null,
        echelle2: row.echelle2 ?? null,
        sous_type: row.sous_type ?? null,
        anciens_id: row.anciens_id ?? null, // ✅ AJOUT
        count: 1, // provisoire (sera remplacé par le count exact)
      });
    }
  }

  // On sort les meilleures suggestions (sur l’échantillon) puis on recalculera le count exact
  const candidates = Array.from(map.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 3) Count EXACT pour chaque suggestion (occurrences réelles)
  const exacts = await Promise.all(
    candidates.map(async (s) => {
      let cq = supabase
        .from("chansons")
        .select("id", { count: "exact", head: true })
        .eq("place", s.place);
        if (s.anciens_id !== null) cq = cq.eq("anciens_id", s.anciens_id);


      // IMPORTANT : même filtres globaux
      cq = applyCommonFilters(cq, filters);

      // IMPORTANT : on garde la cohérence avec l’item suggéré
      if (s.echelle !== null) cq = cq.eq("echelle", s.echelle);
      if (s.echelle2 !== null) cq = cq.eq("echelle2", s.echelle2);
      if (s.sous_type !== null) cq = cq.eq("sous_type", s.sous_type);

      const { count } = await cq;
      return {
        ...s,
        count: typeof count === "number" ? count : 0,
      };
    })
  );

  // Tri final par count exact
  exacts.sort((a, b) => b.count - a.count);

  return NextResponse.json(exacts);
}
