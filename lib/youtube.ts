const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isValidVideoId(id: string | null | undefined): id is string {
  return !!id && VIDEO_ID.test(id);
}

/** Ambil video ID dari youtube.com/shorts/ID, youtu.be/ID, dan youtube.com/watch?v=ID. */
export function parseVideoId(input: string): string | null {
  let raw = input.trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  let id: string | null | undefined = null;

  if (host === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, kind, second] = url.pathname.split("/");
    if (kind === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(kind)) id = second;
  }

  return isValidVideoId(id) ? id : null;
}
