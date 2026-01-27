import PrimaryButton from "../components/PrimaryButton";
import ArtistCarousel from "../components/ArtistCarousel";
import { createClient } from "@supabase/supabase-js";
import LibraryCard from "../components/LibraryCard";

export default async function HomePage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  // Récupère le nombre de chansons uniques (DISTINCT genius_song_id)
  const { data, error } = await supabase.rpc("count_distinct_genius_song_id");

  const uniqueSongsCount =
    !error && typeof data === "number" ? data : null;

  return (
    <main className="min-h-dvh bg-[color:var(--bg)]">
  <div className="min-h-dvh">
        <div className="mx-auto w-full max-w-[420px] px-4 pb-10 pt-6">
          <header className="rounded-3xl border border-[color:var(--border)] bg-white/80 backdrop-blur px-5 py-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div
  className="
    h-[96px] w-[96px] shrink-0 rounded-3xl
    bg-white
    border-2 border-[color:var(--warm)]
    shadow-md
    flex items-center justify-center p-2
  "
>
                <img
                  src="https://i.postimg.cc/yd2FtR14/Capture-d-ecran-2026-01-25-194918-removebg-preview.png"
                  alt="Logo Île-de-Sons"
                  className="h-full w-full object-contain"
                  loading="eager"
                />
              </div>

              <div className="flex-1">
                <h1 className="text-[20px] font-semibold tracking-tight text-[color:var(--ink)]">
                  Île-de-Sons
                </h1>
                <p className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
                  Des dizaines de milliers de chansons géoréférencées à partir des lieux cités dans les paroles ! Si tu veux découvrir des chansons sur tes lieux préférés en Île-de-France, tu es au bon endroit. Plutôt musiques des années 2000 ? 80 ? Plutôt Vincent Delerme ou Booba ? Explore les Carto'musicales d'Île-de-Sons, en filtrant par artistes, décennies, style !
                </p>
              </div>
            </div>

          </header>

          <section className="mt-6 space-y-3">
            <div className="text-[12px] font-semibold tracking-wide text-[color:var(--muted)]">
              Explorer
            </div>

            <PrimaryButton
  href="/carte"
  title="Carte musicale"
  subtitle="Navigue par lieux, zoom et filtres."
  extra={
    <div className="inline-flex items-center rounded-full border border-[color:var(--border)] bg-[color:var(--cardTint)] px-3 py-1">
      <span className="text-[12px] font-semibold text-[color:var(--ink)]">
        {uniqueSongsCount !== null
          ? `${uniqueSongsCount.toLocaleString("fr-FR")} chansons`
          : "Chargement du total…"}
      </span>
    </div>
  }
/>

            <ArtistCarousel />

            <LibraryCard />

            <PrimaryButton
              href="/parcours"
              title="Parcours musicaux"
              subtitle="Des itinéraires thématiques à suivre."
            />
          </section>
        </div>
      </div>
    </main>
  );
}
