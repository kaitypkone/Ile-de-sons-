import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function POST(req: Request) {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const body = (await req.json()) as { ids?: string[] };
    const ids = Array.isArray(body?.ids) ? body.ids.filter(Boolean) : [];

    if (!ids.length) {
      return NextResponse.json({ songs: [] });
    }

    const { data, error } = await supabase
      .from("chansons")
      .select(
        "id, full_title, title, main_artist, artist_names, place, latitude, longitude, youtube_embed, youtube_url, spotify_url, soundcloud_url, lyrics, annee, decennie, language"
      )
      .in("id", ids);

    if (error) {
      return NextResponse.json({ songs: [], error: error.message }, { status: 500 });
    }

    const byId = new Map((data ?? []).map((s: any) => [s.id, s]));
    const ordered = ids.map((id) => byId.get(id)).filter(Boolean);

    return NextResponse.json({ songs: ordered });
  } catch (e: any) {
    return NextResponse.json(
      { songs: [], error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}