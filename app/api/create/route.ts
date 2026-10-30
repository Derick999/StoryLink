import { createLink, StoreUnavailableError } from "@/lib/store";
import { normalizeYouTubeUrl } from "@/lib/youtube";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const raw = typeof body?.url === "string" ? body.url : "";
  const url = raw.length <= 500 ? normalizeYouTubeUrl(raw) : null;
  if (!url) {
    return Response.json({ error: "Link tidak valid. Gunakan link YouTube." }, { status: 400 });
  }

  try {
    const { id, statsToken } = await createLink(url);
    const origin = new URL(request.url).origin;
    return Response.json(
      { shortUrl: `${origin}/l/${id}`, statsUrl: `${origin}/stats/${statsToken}` },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    const unavailable = e instanceof StoreUnavailableError;
    return Response.json(
      { error: unavailable ? "Fitur short link sedang tidak tersedia. Matikan toggle untuk pakai link biasa." : "Gagal membuat short link." },
      { status: unavailable ? 503 : 500 },
    );
  }
}
