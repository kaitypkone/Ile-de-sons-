import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "30")));

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // On récupère un pool (car pas de group by simple ici), puis on déduplique en Node.
  const { data, error } = await supabase
    .from("artistes")
    .select("commune_origine")
    .not("commune_origine", "is", null)
    .ilike("commune_origine", q ? `%${q}%` : `%`)
    .limit(1500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of data ?? []) {
    const c = (r as any).commune_origine;
    if (typeof c !== "string") continue;
    const v = c.trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= limit) break;
  }

  return NextResponse.json({ communes: out });
}
