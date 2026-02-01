import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "30") || 30, 50);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // On prend une liste de styles (texte), on filtre côté JS pour gérer "q" facilement
  const { data, error } = await supabase
    .from("artistes")
    .select("style")
    .not("style", "is", null)
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const uniq = new Set<string>();
  for (const row of data ?? []) {
    const s = typeof row.style === "string" ? row.style.trim() : "";
    if (s) uniq.add(s);
  }

  let styles = Array.from(uniq);

  // Suggestion "dès le focus" : si q est vide, on renvoie juste les plus "courts" / lisibles
  // (tu peux changer la logique si tu veux un tri par fréquence plus tard)
  if (q) {
    const qq = q.toLowerCase();
    styles = styles.filter((s) => s.toLowerCase().includes(qq));
  }

  styles.sort((a, b) => a.localeCompare(b, "fr"));

  return NextResponse.json({
    count: Math.min(styles.length, limit),
    styles: styles.slice(0, limit),
  });
}
