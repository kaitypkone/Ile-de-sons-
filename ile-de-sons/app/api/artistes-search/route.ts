import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20")));

  if (!q) return NextResponse.json({ artistes: [] });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("artistes")
    .select(`id, artiste, commune_origine, style, annee_de_naissance, latitude, longitude, lien, image_wikipedia`)
    .ilike("artiste", `%${q}%`)
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ artistes: data ?? [] });
}
