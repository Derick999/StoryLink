import { isValidVideoId } from "@/lib/youtube";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!isValidVideoId(id)) {
    return Response.json({ error: "ID video tidak valid." }, { status: 400 });
  }

  const target = `https://www.youtube.com/watch?v=${id}`;
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(target)}&format=json`;

  try {
    const res = await fetch(oembed, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return Response.json(
        { error: "Video tidak ditemukan, private, atau tidak bisa diakses." },
        { status: res.status >= 400 && res.status < 500 ? 404 : 502 },
      );
    }
    const data = (await res.json()) as { title?: string; author_name?: string };
    return Response.json({
      title: data.title ?? "",
      channel: data.author_name ?? "",
    });
  } catch {
    return Response.json({ error: "Gagal menghubungi YouTube." }, { status: 502 });
  }
}
