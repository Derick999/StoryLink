import { Suspense } from "react";
import type { Metadata } from "next";
import { getStats, StoreUnavailableError } from "@/lib/store";
import StatsView from "@/components/StatsView";

export const metadata: Metadata = {
  title: "Statistik Link — StoryLink",
  robots: { index: false, follow: false },
};

export default function StatsPage(props: PageProps<"/stats/[token]">) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-5 py-10">
      <Suspense fallback={<div className="skeleton h-72 rounded-3xl" aria-busy="true" />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/stats/[token]">["params"] }) {
  const { token } = await params;

  let stats = null;
  try {
    stats = /^[A-Za-z0-9_-]{20,64}$/.test(token) ? await getStats(token) : null;
  } catch (e) {
    if (!(e instanceof StoreUnavailableError)) throw e;
    return (
      <Message
        title="Statistik belum bisa dimuat"
        body="Layanan penyimpanan sedang bermasalah. Coba muat ulang halaman ini sebentar lagi."
      />
    );
  }

  if (!stats) {
    return <Message title="Statistik sudah dihapus (24 jam)" body="Short link dan jumlah kliknya hanya disimpan 24 jam, lalu dihapus otomatis." />;
  }

  return <StatsView id={stats.id} clicks={stats.clicks} expiresAt={expiryFromTtl(stats.ttl)} />;
}

/** Server-side, dihitung per request setelah data Redis dibaca. */
function expiryFromTtl(ttl: number) {
  return Date.now() + ttl * 1000;
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border-2 border-line bg-card p-6 text-center">
      <h1 className="font-display text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-muted">{body}</p>
    </div>
  );
}
