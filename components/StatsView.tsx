"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

function format(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

export default function StatsView({ id, clicks, expiresAt }: { id: string; clicks: number; expiresAt: number }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const t = setInterval(tick, 1000);
    const refresh = setInterval(() => router.refresh(), 20000);
    return () => {
      clearInterval(t);
      clearInterval(refresh);
    };
  }, [router]);

  async function copy() {
    const url = `${window.location.origin}/l/${id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt("Salin short link:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // `now` null sebelum hydrate: tampilkan sisa waktu tanpa membaca jam di server
  const remaining = now === null ? null : expiresAt - now;
  const expired = remaining !== null && remaining <= 0;

  if (expired) {
    return (
      <div className="rounded-3xl border-2 border-line bg-card p-6 text-center">
        <h1 className="font-display text-2xl font-extrabold">Statistik sudah dihapus (24 jam)</h1>
        <p className="mt-2 text-muted">Short link dan jumlah kliknya sudah dihapus otomatis.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="font-display text-xl font-extrabold">StoryLink</span>
        <h1 className="text-sm font-semibold text-muted">Statistik short link</h1>
      </div>
      <div className="rounded-3xl bg-ink p-6 text-paper">
        <p className="text-sm font-semibold text-paper/70">Total klik</p>
        <p className="font-display text-7xl font-extrabold leading-none tabular-nums">{clicks}</p>
        <div className="mt-6 flex items-center justify-between border-t border-paper/20 pt-4">
          <span className="text-sm text-paper/70">Dihapus dalam</span>
          <span className="font-display text-2xl font-extrabold tabular-nums" suppressHydrationWarning>
            {remaining === null ? "--:--:--" : format(remaining)}
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        className="h-14 rounded-2xl border-2 border-ink bg-card text-base font-bold active:translate-y-px"
      >
        {copied ? "Tersalin ✓" : "Salin short link"}
      </button>
      <p className="text-center text-sm text-muted">
        Hanya jumlah klik yang dihitung. Tidak ada data pengunjung yang disimpan. Simpan halaman ini untuk memantau.
      </p>
    </>
  );
}
