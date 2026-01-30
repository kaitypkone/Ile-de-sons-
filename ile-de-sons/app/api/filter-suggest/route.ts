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

  const kind = (searchParams.get("kind") || "").trim(); // "artist" | "style"
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(Number(searchParams.get("limit") || 12), 30);

  if (kind !== "artist" && kind !== "style") {
    return NextResponse.json({ options: [] });
  }

  // MVP: on prend un échantillon puis on agrège côté serveur
  // (évite DISTINCT/RPC, comme tu as déjà fait ailleurs)
  let query = supabase
    .from("chansons")
    .select(kind === "artist" ? "main_artist,artist_names" : "style")
    .limit(800);

  // petit filtre de perf quand on tape
  if (q.length >= 1) {
    if (kind === "artist") {
      query = query.or(`main_artist.ilike.%${q}%,artist_names.ilike.%${q}%`);
    } else {
      query = query.ilike("style", `%${q}%`);
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

      // artist_names peut être "A, B, C" → on split
      for (const raw of pool) {
        raw
          .split(/,|&|\/|;|\|/g)
          .map((x) => x.trim())
          .filter(Boolean)
          .forEach((name) => {
            const key = name;
            counts.set(key, (counts.get(key) || 0) + 1);
          });
      }
    } else {
      // style = "r&b contemporain, pop, rap"
      const raw = String(row.style || "");
      raw
        .split(/,|;|\|/g)
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((st) => {
          const key = st;
          counts.set(key, (counts.get(key) || 0) + 1);
        });
    }
  }

  // filtre "tolérant" côté serveur
  const nq = norm(q);
  let arr = Array.from(counts.entries()).map(([label, c]) => ({ label, count: c }));

  if (nq) {
    arr = arr.filter((x) => norm(x.label).includes(nq));
  }

  arr.sort((a, b) => b.count - a.count);

  return NextResponse.json({
    options: arr.slice(0, limit),
  });
}
