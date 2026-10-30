import { countClick, getLink, StoreUnavailableError } from "@/lib/store";

// Hanya angka klik yang disimpan. User-agent dibaca sesaat untuk menyaring bot, tidak disimpan.
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|whatsapp|embedly|curl|wget|python-requests|headless|monitor/i;

const page = (title: string, body: string, status: number) =>
  new Response(
    `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title></head><body style="margin:0;min-height:100dvh;display:grid;place-items:center;background:#f3eee4;color:#15120f;font-family:system-ui,sans-serif;text-align:center;padding:24px"><main><h1 style="font-size:1.6rem;margin:0 0 8px">${title}</h1><p style="margin:0;color:#6b645c">${body}</p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}

async function resolve(request: Request, ctx: RouteContext<"/l/[id]">, count: boolean) {
  const { id } = await ctx.params;
  if (!/^[a-z0-9]{4,12}$/.test(id)) return page("Link sudah kedaluwarsa", "Link ini tidak ditemukan atau sudah tidak aktif.", 404);

  try {
    const link = await getLink(id);
    if (!link) return page("Link sudah kedaluwarsa", "Short link hanya aktif 24 jam dan sudah dihapus.", 410);

    const ua = request.headers.get("user-agent") ?? "";
    if (count && ua && !BOT.test(ua)) {
      // gagal menghitung tidak boleh menghalangi pengunjung sampai ke video
      await countClick(id).catch(() => {});
    }
    return redirect(link.url);
  } catch (e) {
    if (e instanceof StoreUnavailableError) {
      return page("Layanan sedang bermasalah", "Short link tidak bisa dibuka sekarang. Coba lagi sebentar lagi.", 503);
    }
    throw e;
  }
}

export function GET(request: Request, ctx: RouteContext<"/l/[id]">) {
  return resolve(request, ctx, true);
}

export function HEAD(request: Request, ctx: RouteContext<"/l/[id]">) {
  return resolve(request, ctx, false);
}
