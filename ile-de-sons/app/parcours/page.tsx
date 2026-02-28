import Link from "next/link";

type PlaylistCardProps = {
  title: string;
  description: string;
  imageUrl: string;
  href: string;
};

function PlaylistCard({ title, description, imageUrl, href }: PlaylistCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-3xl border border-[color:var(--border)] bg-white/80 backdrop-blur shadow-sm overflow-hidden hover:shadow-md transition-shadow"
    >
      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4 p-5 items-center">
        <div>
          <h2 className="text-[16px] font-bold text-[color:var(--ink)]">
            {title}
          </h2>
          <p className="mt-2 text-[13px] leading-5 text-[color:var(--muted)]">
            {description}
          </p>
          <div className="mt-3 text-[12px] font-semibold text-[color:var(--primary)]">
            Ouvrir la playlist →
          </div>
        </div>

        <div className="w-full">
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-[140px] md:h-[120px] object-cover rounded-2xl border border-[color:var(--border)]"
            loading="lazy"
          />
        </div>
      </div>
    </Link>
  );
}

export default function ParcoursPage() {
  return (
    <main className="min-h-dvh bg-[color:var(--bg)]">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-[18px] md:text-[20px] font-extrabold text-[color:var(--ink)]">
          Sélectionne une playlist géographique pour découvrir un nouveau territoire en musique !
        </h1>

        <div className="mt-6 grid gap-4">
          <PlaylistCard
            title="Cergy-Pontoise 9-5"
            description="Cergy-Pontoise est un des fiefs de rap le plus important du Val d’Oise. Viens explorer ce qu’ils ont à en dire !"
            imageUrl="https://i.postimg.cc/Gt1NWnVq/Capture-d-ecran-2026-02-28-111722.png"
            href="/parcours/cergy-pontoise-95"
          />

          <PlaylistCard
            title="Musées parisiens en musique"
            description="Comment sont évoqués les grands musées parisiens par différents artistes musicaux ? De la rébellion contre le Quai Branly à un hommage nostalgique au Musée de l’Orangerie, découvre quels symboles incarnent de grands musées pour une courte sélection d’artistes."
            imageUrl="https://static.actu.fr/uploads/2021/06/adobestock-366118579-editorial-use-only-960x640.jpeg"
            href="/parcours/musees-parisiens"
          />

          <PlaylistCard
            title="RER B : une expérience partagée"
            description="Découvre notre sélection de sons mentionnant le RER B et ses joyeusetés."
            imageUrl="https://www.laviedurail.com/rp/wp-content/uploads/sites/3/2018/09/09D-MC-RER-B.jpg"
            href="/parcours/rer-b"
          />
        </div>
      </div>
    </main>
  );
}