import { isValidVideoId } from "@/lib/youtube";

// img.youtube.com tidak mengirim header CORS, jadi gambar diambil di server
// dan disajikan same-origin supaya canvas tidak "tainted".
const VARIANTS = ["maxresdefault", "hqdefault"];

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!isValidVideoId(id)) {
    return new Response("ID video tidak valid.", { status: 400 });
  }

  for (const variant of VARIANTS) {
    try {
      const res = await fetch(`https://img.youtube.com/vi/${id}/${variant}.jpg`);
      if (!res.ok) continue;
      return new Response(await res.arrayBuffer(), {
        headers: {
          "Content-Type": res.headers.get("content-type") ?? "image/jpeg",
          "Cache-Control": "public, max-age=3600, s-maxage=86400",
        },
      });
    } catch {
      // coba varian berikutnya
    }
  }

  return new Response("Thumbnail tidak ditemukan.", { status: 404 });
}
