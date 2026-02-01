import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const minLng = Number(searchParams.get("minLng"));
  const minLat = Number(searchParams.get("minLat"));
  const maxLng = Number(searchParams.get("maxLng"));
  const maxLat = Number(searchParams.get("maxLat"));

  if (
    !Number.isFinite(minLng) ||
    !Number.isFinite(minLat) ||
    !Number.isFinite(maxLng) ||
    !Number.isFinite(maxLat)
  ) {
    return NextResponse.json({ error: "Bad bbox" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("artistes")
    .select(
      `
        id,
        artiste,
        commune_origine,
        style,
        annee_de_naissance,
        latitude,
        longitude,
        lien,
        image_wikipedia
      `
    )
    .not("latitude", "is", null)
    .not("longitude", "is", null)
    .gte("longitude", minLng)
    .lte("longitude", maxLng)
    .gte("latitude", minLat)
    .lte("latitude", maxLat)
    .limit(3000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    count: data?.length ?? 0,
    artistes: data ?? [],
  });
}
