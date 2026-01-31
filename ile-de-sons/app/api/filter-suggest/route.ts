import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

function norm(s: string) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export async function GET(req: Request) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { searchParams } = new URL(req.url);

  
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(Number(searchParams.get("limit") || 12), 60);

const kind = (searchParams.get("kind") || "").trim(); 
const allowed = ["artist", "style", "language", "echelle2", "sous_type"] as const;

if (!allowed.includes(kind as any)) {
  return NextResponse.json({ options: [] });
}

  // MVP: on prend un échantillon puis on agrège
  let query = supabase
  .from("chansons")
  .select(
    kind === "artist"
      ? "main_artist,artist_names"
      : kind === "style"
      ? "style"
      : kind === "language"
      ? "language"
      : kind === "echelle2"
      ? "echelle2"
      : "sous_type"
  )
  .limit(1200);


  // petit filtre de perf quand on tape
  if (q.length >= 1) {
  if (kind === "artist") {
    query = query.or(`main_artist.ilike.%${q}%,artist_names.ilike.%${q}%`);
  } else if (kind === "style") {
    query = query.ilike("style", `%${q}%`);
  } else if (kind === "language") {
    query = query.ilike("language", `%${q}%`);
  } else if (kind === "echelle2") {
    query = query.ilike("echelle2", `%${q}%`);
  } else {
    query = query.ilike("sous_type", `%${q}%`);
  }
}

  const { data, error } = await query;
  if (error || !data) return NextResponse.json({ options: [] });

  const counts = new Map<string, number>();

  for (const row of data as any[]) {
    if (kind === "artist") {
      const pool: string[] = [];
      if (row.main_artist) pool.push(String(row.main_artist));
      if (row.artist_names) pool.push(String(row.artist_names));

      for (const raw of pool) {
        raw
          .split(/,|&|\/|;|\|/g)
          .map((x) => x.trim())
          .filter(Boolean)
          .forEach((name) => {
            counts.set(name, (counts.get(name) || 0) + 1);
          });
      }
    } else if (kind === "style") {
      const raw = String(row.style || "");
      raw
        .split(/,|;|\|/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((st) => {
          counts.set(st, (counts.get(st) || 0) + 1);
        });
    } else if (kind === "echelle2") {
  const raw = String((row as any).echelle2 || "").trim();
  if (raw) counts.set(raw, (counts.get(raw) || 0) + 1);

} else if (kind === "sous_type") {
  const raw = String((row as any).sous_type || "").trim();
  if (raw) counts.set(raw, (counts.get(raw) || 0) + 1);
    
      } else {
      // language : parfois c’est "français", parfois "français, anglais"
      const raw = String(row.language || "");
      raw
        .split(/,|;|\|/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((lg) => {
          counts.set(lg, (counts.get(lg) || 0) + 1);
        });
    }
  }

  const nq = norm(q);
  let arr = Array.from(counts.entries()).map(([label, c]) => ({ label, count: c }));

  if (nq) {
    arr = arr.filter((x) => norm(x.label).includes(nq));
  }

  arr.sort((a, b) => b.count - a.count);

  return NextResponse.json({ options: arr.slice(0, limit) });
}
