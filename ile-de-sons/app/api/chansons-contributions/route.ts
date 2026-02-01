import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Transforme une URL YouTube en embed
 * Supporte:
 * - https://youtu.be/ID
 * - https://www.youtube.com/watch?v=ID
 * - https://www.youtube.com/embed/ID
 */
function youtubeToEmbed(url: string) {
  try {
    const u = new URL(url);
    let id = "";

    if (u.hostname.includes("youtu.be")) {
      id = u.pathname.replace("/", "");
    } else if (u.searchParams.get("v")) {
      id = u.searchParams.get("v") ?? "";
    } else if (u.pathname.includes("/embed/")) {
      id = u.pathname.split("/embed/")[1] ?? "";
    }

    if (!id) return null;
    return `https://www.youtube.com/embed/${id}`;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Payload invalide." },
      { status: 400 }
    );
  }

  const {
    title,
    main_artist,
    lyrics,
    place,
    echelle,
    sous_type,
    decennie,
    youtube_url,
    latitude,
    longitude,
  } = body ?? {};

  // ✅ Champs réellement obligatoires (alignés avec ton formulaire)
  if (
    !title?.trim() ||
    !main_artist?.trim() ||
    !place?.trim()
  ) {
    return NextResponse.json(
      {
        error: "Champs requis manquants.",
        missing: {
          title: !title,
          main_artist: !main_artist,
          place: !place,
        },
      },
      { status: 400 }
    );
  }

  const youtube_embed =
    typeof youtube_url === "string" && youtube_url.trim()
      ? youtubeToEmbed(youtube_url.trim())
      : null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const payload = {
    title: title.trim(),
    main_artist: main_artist.trim(),
    lyrics: typeof lyrics === "string" ? lyrics : null,
    place: place.trim(),
    echelle: echelle || null,
    sous_type: sous_type || null,
    decennie: decennie || null,
    youtube_url: youtube_url || null,
    youtube_embed,
    latitude: latitude == null ? null : Number(latitude),
    longitude: longitude == null ? null : Number(longitude),
  };

  const { error } = await supabase
    .from("chansons_contributions")
    .insert(payload);

  if (error) {
    return NextResponse.json(
      {
        error: "Erreur Supabase",
        details: error.message,
      },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
