import Link from "next/link";

function prettyTitle(slug: string) {
  return decodeURIComponent(slug)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function PlaylistPage({ params }: { params: { slug: string } }) {
  const title = prettyTitle(params.slug);

  return (
    <main className="min-h-dvh bg-[color:var(--bg)]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Link
          href="/parcours"
          className="text-[13px] font-semibold text-[color:var(--primary)] hover:underline"
        >
          ← Retour aux géoplaylists
        </Link>

        <h1 className="mt-4 text-[20px] font-extrabold text-[color:var(--ink)]">
          {title}
        </h1>

        <p className="mt-2 text-[13px] leading-5 text-[color:var(--muted)]">
          Page playlist en construction. Donne-moi le format que tu veux (carte,
          liste de titres, lecteur, etc.) et je te la branche.
        </p>
      </div>
    </main>
  );
}