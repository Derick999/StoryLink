const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isValidVideoId(id: string | null | undefined): id is string {
  return !!id && VIDEO_ID.test(id);
}

export interface ParsedYouTube {
  id: string;
  /** true hanya untuk bentuk youtube.com/shorts/ID. */
  isShort: boolean;
}

/** Ambil video ID dari youtube.com/shorts/ID, youtu.be/ID, dan youtube.com/watch?v=ID. */
export function parseYouTube(input: string): ParsedYouTube | null {
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
  let isShort = false;

  if (host === "youtu.be") {
    id = url.pathname.split("/")[1];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const [, kind, second] = url.pathname.split("/");
    if (kind === "watch") id = url.searchParams.get("v");
    else if (["shorts", "embed", "live", "v"].includes(kind)) {
      id = second;
      isShort = kind === "shorts";
    }
  }

  return isValidVideoId(id) ? { id, isShort } : null;
}

export function parseVideoId(input: string): string | null {
  return parseYouTube(input)?.id ?? null;
}

/** Versi aman dari link YouTube yang ditempel user (selalu https, host sudah tervalidasi), atau null. */
export function normalizeYouTubeUrl(input: string): string | null {
  if (!parseVideoId(input)) return null;
  let raw = input.trim();
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  return new URL(raw).href;
}
