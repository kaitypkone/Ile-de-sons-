import PrimaryButton from "../components/PrimaryButton";
import ArtistCarousel from "../components/ArtistCarousel";
import { createClient } from "@supabase/supabase-js";

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
  {/* Logo au-dessus, sans cadre */}
  <img
    src="https://i.postimg.cc/yd2FtR14/Capture-d-ecran-2026-01-25-194918-removebg-preview.png"
    alt="Logo Île-de-Sons"
    className="mx-auto h-[200px] w-[200px] object-contain"
    loading="eager"
  />

  {/* Texte avec gras + saut de ligne */}
  <div className="mt-3 space-y-3 text-[13px] leading-5 text-[color:var(--muted)]">
    <p>
      Des dizaines de milliers de{" "}
      <strong className="font-semibold text-[color:var(--ink)]">
        chansons géoréférencées à partir des lieux cités dans les paroles
      </strong>{" "}
      ! Si tu veux découvrir des chansons sur tes lieux préférés en Île-de-France,
      tu es au bon endroit.
    </p>

    <p>
      Plutôt musiques des années 2000 ? 80 ? 2020 ? Plutôt Vincent Delerm ou
      Werenoi ? Explore les Carto'musicales d'Île-de-Sons, en{" "}
      <strong className="font-semibold text-[color:var(--ink)]">
        filtrant par artistes, décennies, style
      </strong>{" "}
      !
    </p>
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

            <PrimaryButton
              href="/parcours"
              title="Parcours musicaux"
              subtitle="Des itinéraires thématiques à suivre."
            />
          </section>


          <section className="mt-10">
  <div className="text-[12px] font-semibold tracking-wide text-[color:var(--muted)]">
    Notre projet
  </div>

  <div className="mt-4 rounded-3xl border border-[color:var(--border)] bg-white/80 backdrop-blur px-5 py-5 shadow-sm space-y-4 text-[13px] leading-6 text-[color:var(--ink)]">
    <p>
      L&apos;Île-de-France, département le plus peuplé du pays, embrasse une
      diversité de lieux, aussi bien d&apos;un point de vue social que
      structurel. Il y a bien sûr les internationales Paris et Versailles… Mais
      aussi, et peut-être même surtout : les banlieues et les zones
      périurbaines, souvent chantées comme des centres par de nombreux artistes,
      notamment dans le rap.
    </p>

    <p>
      Une chanson est l&apos;expression d&apos;une{" "}
      <strong className="font-semibold">subjectivité</strong> : celle de
      l&apos;artiste. Lorsqu&apos;un lieu est cité dans les paroles, il occupe
      une <strong className="font-semibold">fonction symbolique</strong>. Une
      rue, une ville, un bâtiment, un fleuve. Ils sont associés à des rêves, des
      cauchemars, des émotions et des valeurs. Il est passionnant de comprendre,
      à partir du texte mais aussi de la musique, ce qu&apos;est ce symbole et
      ce qu&apos;il dit vraiment.
    </p>

    <p>
      La{" "}
      <strong className="font-semibold">
        localisation cartographique
      </strong>{" "}
      d&apos;une multitude de chansons, et donc d&apos;une multitude de
      subjectivités, permet de{" "}
      <strong className="font-semibold">
        comprendre un peu mieux à la fois l&apos;expérience vécue ici et là,
        mais aussi les projections et fantasmes collectifs ou personnels
        associés à des lieux
      </strong>
      . Ces aspects-là, pourtant très importants pour comprendre un territoire,
      sont souvent difficilement saisissables. Une carte peut peut-être aider…
      <strong className="font-semibold">
        {" "}
        À condition bien sûr de ne pas perdre de vue le plus important : la
        musique
      </strong>{" "}
      !
    </p>
  </div>
</section>

        </div>
      </div>
    </main>
  );
}
