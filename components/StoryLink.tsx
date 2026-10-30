"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  TEMPLATES,
  STORY_H,
  SAFE_MARGIN,
  ensureFonts,
  loadImage,
  prepareThumb,
  renderStory,
  type PreparedThumb,
  type TemplateId,
} from "@/lib/renderStory";
import { parseVideoId } from "@/lib/youtube";

interface Loaded {
  id: string;
  url: string;
  title: string;
  channel: string;
  thumb: PreparedThumb;
}

type Status = "idle" | "loading" | "ready" | "error";

interface ShortLink {
  shortUrl: string;
  statsUrl: string;
}

const SAFE_PCT = (SAFE_MARGIN / STORY_H) * 100;

const STEPS = [
  { title: "Bagikan gambar", body: "Tekan “Share ke Instagram” dan pilih Story." },
  { title: "Tambah Link Sticker", body: "Di IG, buka stiker lalu pilih “Link”." },
  { title: "Tempel link-nya", body: "Tekan “Salin link” dulu, lalu tempel di stiker." },
];

function downloadBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Gagal membuat gambar"))), "image/png"),
  );
}

export default function StoryLink() {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [data, setData] = useState<Loaded | null>(null);
  const [template, setTemplate] = useState<TemplateId>("blur");
  const [showGuides, setShowGuides] = useState(false);
  const [toast, setToast] = useState("");
  const [busy, setBusy] = useState<"share" | "download" | null>(null);
  const [useShort, setUseShort] = useState(false);
  const [short, setShort] = useState<ShortLink | null>(null);
  const [shortState, setShortState] = useState<"idle" | "loading" | "error">("idle");
  const [shortError, setShortError] = useState("");
  const shortTicket = useRef(0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blobRef = useRef<Blob | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const requestRef = useRef(0);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  // gambar ulang saat template / data berubah
  useEffect(() => {
    if (!data || status !== "ready") return;
    let cancelled = false;
    blobRef.current = null;
    (async () => {
      await ensureFonts(`${data.title} ${data.channel} TONTON DI YOUTUBE`);
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      renderStory(canvas, template, data);
      try {
        const blob = await canvasToBlob(canvas);
        if (!cancelled) blobRef.current = blob; // siap dipakai langsung saat tombol ditekan
      } catch {
        blobRef.current = null;
      }
    })().catch(() => {
      if (!cancelled) {
        setError("Gagal menggambar template. Coba lagi.");
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [data, template, status]);

  // Dibuat lebih awal (bukan saat "Salin link" ditekan) supaya penyalinan tetap terjadi
  // di dalam gestur user; Safari menolak clipboard setelah await yang lama.
  async function makeShort(url: string) {
    const ticket = ++shortTicket.current;
    setShort(null);
    setShortState("loading");
    setShortError("");
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const body = (await res.json().catch(() => null)) as (Partial<ShortLink> & { error?: string }) | null;
      if (!res.ok || !body?.shortUrl || !body.statsUrl) {
        throw new Error(body?.error ?? "Gagal membuat short link.");
      }
      if (ticket !== shortTicket.current) return;
      setShort({ shortUrl: body.shortUrl, statsUrl: body.statsUrl });
      setShortState("idle");
    } catch (e) {
      if (ticket !== shortTicket.current) return;
      setShortState("error");
      setShortError(e instanceof Error ? e.message : "Gagal membuat short link.");
    }
  }

  function toggleShort(on: boolean) {
    setUseShort(on);
    if (on && data && !short && shortState !== "loading") makeShort(data.url);
  }

  async function generate(raw = input) {
    const id = parseVideoId(raw);
    if (!id) {
      setStatus("error");
      setData(null);
      setError("Link tidak dikenali. Pakai link YouTube seperti youtube.com/shorts/…, youtu.be/… atau youtube.com/watch?v=…");
      return;
    }
    const ticket = ++requestRef.current;
    shortTicket.current++;
    setShort(null);
    setShortState("idle");
    setStatus("loading");
    setError("");
    try {
      const [metaRes, img] = await Promise.all([
        fetch(`/api/meta?id=${id}`),
        loadImage(`/api/thumb?id=${id}`).catch(() => {
          throw new Error("Thumbnail video tidak bisa diambil.");
        }),
      ]);
      if (!metaRes.ok) {
        const body = (await metaRes.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Gagal mengambil info video.");
      }
      const meta = (await metaRes.json()) as { title: string; channel: string };
      if (ticket !== requestRef.current) return;
      const url = raw.trim();
      setData({ id, url, title: meta.title, channel: meta.channel, thumb: prepareThumb(img) });
      setStatus("ready");
      if (useShort) makeShort(url);
    } catch (e) {
      if (ticket !== requestRef.current) return;
      setData(null);
      setStatus("error");
      setError(e instanceof Error ? e.message : "Terjadi kesalahan. Coba lagi.");
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInput(text);
        generate(text);
      }
    } catch {
      flash("Izin clipboard ditolak. Tempel manual di kolom.");
    }
  }

  async function getBlob() {
    if (blobRef.current) return blobRef.current;
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas belum siap");
    return canvasToBlob(canvas);
  }

  async function share() {
    if (!data || busy) return;
    setBusy("share");
    try {
      const blob = await getBlob();
      const name = `storylink-${data.id}.png`;
      const file = new File([blob], name, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
        } catch (e) {
          if (!(e instanceof DOMException && e.name === "AbortError")) {
            downloadBlob(blob, name);
            flash("Share gagal, gambar diunduh. Buka IG lalu pilih dari galeri.");
          }
        }
      } else {
        downloadBlob(blob, name);
        flash("Browser ini belum bisa share file. Gambar diunduh, tambahkan lewat galeri IG.");
      }
    } catch {
      flash("Gagal membuat gambar. Coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    if (!data || busy) return;
    setBusy("download");
    try {
      downloadBlob(await getBlob(), `storylink-${data.id}.png`);
      flash("Gambar diunduh.");
    } catch {
      flash("Gagal membuat gambar. Coba lagi.");
    } finally {
      setBusy(null);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    }
  }

  async function copyLink() {
    if (!data) return;
    if (useShort) {
      if (shortState === "loading") return flash("Short link masih disiapkan, tunggu sebentar.");
      if (!short) {
        makeShort(data.url);
        return flash("Mencoba membuat short link lagi…");
      }
      if (!(await copyText(short.shortUrl))) return flash("Gagal menyalin. Salin manual dari kotak short link.");
      return flash("Short link disalin ✓");
    }
    if (!(await copyText(data.url))) return flash("Gagal menyalin. Salin manual dari kolom di atas.");
    flash("Link disalin ✓");
  }

  const loading = status === "loading";

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-7 px-5 pb-16 pt-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-paper">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" />
            </svg>
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight">StoryLink</span>
        </div>
        <h1 className="font-display text-[2.1rem] font-extrabold leading-[1.02] tracking-tight">
          Video YouTube-mu,
          <br />
          jadi <span className="text-accent">Story</span> dalam 10 detik.
        </h1>
      </header>

      <section aria-label="Masukkan link" className="flex flex-col gap-3">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            generate();
          }}
        >
          <label htmlFor="url" className="sr-only">
            Link YouTube
          </label>
          <input
            id="url"
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Tempel link YouTube / Shorts"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-invalid={status === "error"}
            aria-describedby={status === "error" ? "url-error" : undefined}
            className="h-14 w-full rounded-2xl border-2 border-ink bg-card px-4 text-base outline-none placeholder:text-muted/70 focus:ring-4 focus:ring-accent/30"
          />
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <button
              type="button"
              onClick={paste}
              className="h-14 rounded-2xl border-2 border-ink bg-card px-5 text-base font-bold active:translate-y-px"
            >
              Tempel
            </button>
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="h-14 rounded-2xl bg-ink text-base font-bold text-paper active:translate-y-px disabled:opacity-40"
            >
              {loading ? "Memproses…" : "Buat Story"}
            </button>
          </div>
        </form>
        {status === "error" && (
          <p id="url-error" role="alert" className="rounded-xl bg-accent/10 px-4 py-3 text-sm font-medium text-[#b3260a]">
            {error}
          </p>
        )}
      </section>

      {(loading || status === "ready") && (
        <section aria-label="Pratinjau" className="flex flex-col gap-5">
          <div role="radiogroup" aria-label="Pilih template" className="grid grid-cols-3 gap-2">
            {TEMPLATES.map((t) => {
              const active = template === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTemplate(t.id)}
                  className={`flex min-h-16 flex-col items-start justify-center rounded-2xl border-2 px-3 py-2 text-left transition-colors ${
                    active ? "border-ink bg-ink text-paper" : "border-line bg-card"
                  }`}
                >
                  <span className="font-display text-base font-extrabold">{t.label}</span>
                  <span className={`text-[11px] leading-tight ${active ? "text-paper/70" : "text-muted"}`}>{t.hint}</span>
                </button>
              );
            })}
          </div>

          <div className="mx-auto w-full max-w-[19rem]">
            <div className="relative aspect-[9/16] overflow-hidden rounded-[1.6rem] bg-ink shadow-[0_18px_40px_-18px_rgba(21,18,15,0.55)] ring-4 ring-ink">
              {loading ? (
                <div className="skeleton absolute inset-0" aria-busy="true" aria-label="Memuat pratinjau" />
              ) : (
                <canvas
                  ref={canvasRef}
                  width={1080}
                  height={1920}
                  className="absolute inset-0 h-full w-full"
                  aria-label={`Pratinjau Story: ${data?.title ?? ""}`}
                />
              )}
              {showGuides && !loading && (
                <div aria-hidden className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute inset-x-0 top-0 border-b-2 border-dashed border-white/80 bg-red-500/25"
                    style={{ height: `${SAFE_PCT}%` }}
                  />
                  <div
                    className="absolute inset-x-0 bottom-0 border-t-2 border-dashed border-white/80 bg-red-500/25"
                    style={{ height: `${SAFE_PCT}%` }}
                  />
                  <div
                    className="absolute inset-x-6 grid place-items-center rounded-xl border-2 border-dashed border-yellow-300 bg-yellow-300/15 text-[10px] font-bold uppercase tracking-wide text-yellow-200"
                    style={{ top: "72.4%", height: "13.5%" }}
                  >
                    Area Link Sticker
                  </div>
                </div>
              )}
            </div>
            <label className="mt-3 flex items-center justify-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={showGuides}
                onChange={(e) => setShowGuides(e.target.checked)}
                className="h-4 w-4 accent-[#ff4a1c]"
              />
              Tampilkan zona aman Story
            </label>
          </div>

          {status === "ready" && data && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={share}
                disabled={!!busy}
                className="h-16 rounded-2xl bg-accent text-lg font-extrabold text-white shadow-[0_6px_0_#b32d0a] active:translate-y-[3px] active:shadow-[0_3px_0_#b32d0a] disabled:opacity-60"
              >
                {busy === "share" ? "Menyiapkan…" : "Share ke Instagram"}
              </button>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={download}
                  disabled={!!busy}
                  className="h-14 rounded-2xl border-2 border-ink bg-card text-base font-bold active:translate-y-px disabled:opacity-60"
                >
                  Download PNG
                </button>
                <button
                  type="button"
                  onClick={copyLink}
                  className="h-14 rounded-2xl border-2 border-ink bg-card text-base font-bold active:translate-y-px"
                >
                  Salin link
                </button>
              </div>
              <p className="text-center text-sm text-muted">
                Habis itu di IG, tambah Link Sticker lalu tempel link-nya
              </p>

              <div className="flex flex-col gap-3 rounded-2xl border-2 border-line bg-card p-4">
                <label className="flex cursor-pointer items-center justify-between gap-4">
                  <span className="flex flex-col">
                    <span className="font-bold leading-tight">Pakai short link + hitung klik</span>
                    <span className="text-xs text-muted">Aktif 24 jam, hanya jumlah klik yang disimpan.</span>
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={useShort}
                    onChange={(e) => toggleShort(e.target.checked)}
                    className="h-6 w-11 shrink-0 appearance-none rounded-full bg-line transition-colors checked:bg-accent relative before:absolute before:left-0.5 before:top-0.5 before:h-5 before:w-5 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-5"
                  />
                </label>
                {useShort && shortState === "loading" && <p className="text-sm text-muted">Menyiapkan short link…</p>}
                {useShort && shortState === "error" && (
                  <p role="alert" className="rounded-xl bg-accent/10 px-3 py-2 text-sm font-medium text-[#b3260a]">
                    {shortError} Tekan “Salin link” untuk mencoba lagi, atau matikan toggle untuk pakai link YouTube biasa.
                  </p>
                )}
                {useShort && short && (
                  <div className="flex flex-col gap-2 text-sm">
                    <p>
                      Short link: <span className="break-all font-bold">{short.shortUrl}</span>
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <a
                        href={short.statsUrl}
                        target="_blank"
                        rel="noopener"
                        className="grid h-11 place-items-center rounded-xl bg-ink font-bold text-paper"
                      >
                        Lihat statistik
                      </a>
                      <button
                        type="button"
                        onClick={async () =>
                          flash((await copyText(short.statsUrl)) ? "Link statistik disalin ✓" : "Gagal menyalin.")
                        }
                        className="h-11 rounded-xl border-2 border-ink font-bold"
                      >
                        Salin link statistik
                      </button>
                    </div>
                    <p className="text-xs text-muted">Simpan link statistik; itu satu-satunya cara memantau klik.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      <section aria-label="Cara pakai" className="flex flex-col gap-4 rounded-3xl border-2 border-line bg-card p-5">
        <h2 className="font-display text-lg font-extrabold">3 langkah ke Story</h2>
        <ol className="flex flex-col gap-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink font-display text-sm font-extrabold text-paper">
                {i + 1}
              </span>
              <div>
                <p className="font-bold leading-tight">{s.title}</p>
                <p className="text-sm text-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-5 bottom-6 z-10 mx-auto max-w-sm rounded-2xl bg-ink px-4 py-3 text-center text-sm font-medium text-paper shadow-lg transition-all duration-200 ${
          toast ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        {toast}
      </div>
    </main>
  );
}
