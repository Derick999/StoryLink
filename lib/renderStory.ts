/**
 * Render template Instagram Story (1080x1920) ke <canvas>.
 * Tambah template baru: tulis fungsi `draw` lalu daftarkan di TEMPLATES.
 */

export const STORY_W = 1080;
export const STORY_H = 1920;
/** Zona UI Story (profil di atas, kotak balas di bawah): jangan taruh teks penting di sini. */
export const SAFE_MARGIN = 250;
/** Ruang kosong di bawah konten untuk Link Sticker IG. */
const STICKER_SPACE = 280;
const ZONE_TOP = SAFE_MARGIN + 40;
const ZONE_BOTTOM = STORY_H - SAFE_MARGIN - STICKER_SPACE;
const ZONE_H = ZONE_BOTTOM - ZONE_TOP;

export const FONT = '"Bricolage Grotesque", system-ui, sans-serif';

export type TemplateId = "blur" | "minimal" | "bold";

export interface PreparedThumb {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Warna dominan (sudah disesuaikan supaya enak jadi background). */
  dominant: string;
}

export interface StoryData {
  title: string;
  channel: string;
  thumb: PreparedThumb;
}

export interface StoryTemplate {
  id: TemplateId;
  label: string;
  hint: string;
  draw: (ctx: CanvasRenderingContext2D, data: StoryData) => void;
}

/* ---------- persiapan aset ---------- */

export async function ensureFonts(text: string) {
  if (typeof document === "undefined" || !document.fonts) return;
  try {
    await Promise.all([
      document.fonts.load(`800 64px ${FONT}`, text),
      document.fonts.load(`600 36px ${FONT}`, text),
    ]);
    await document.fonts.ready;
  } catch {
    // pakai font fallback
  }
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat gambar"));
    img.src = src;
  });
}

function luma(r: number, g: number, b: number) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Thumbnail Shorts biasanya 16:9 dengan bar hitam di kiri-kanan.
 * Bar dibuang hanya kalau simetris, supaya video gelap tidak ikut terpotong.
 */
function trimBars(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const full = document.createElement("canvas");
  full.width = w;
  full.height = h;
  const fctx = full.getContext("2d", { willReadFrequently: true })!;
  fctx.drawImage(img, 0, 0);
  const { data } = fctx.getImageData(0, 0, w, h);

  const THRESH = 22;
  const colBright = new Uint8Array(w);
  const rowBright = new Uint8Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (luma(data[i], data[i + 1], data[i + 2]) > THRESH) {
        colBright[x] = 1;
        rowBright[y] = 1;
      }
    }
  }

  const first = (a: Uint8Array) => a.indexOf(1);
  const last = (a: Uint8Array) => a.lastIndexOf(1);
  let x0 = Math.max(first(colBright), 0);
  let x1 = last(colBright) < 0 ? w - 1 : last(colBright);
  let y0 = Math.max(first(rowBright), 0);
  let y1 = last(rowBright) < 0 ? h - 1 : last(rowBright);

  const symmetric = (a: number, b: number, total: number) =>
    a > total * 0.03 && b > total * 0.03 && Math.abs(a - b) < Math.max(a, b) * 0.35;
  if (!symmetric(x0, w - 1 - x1, w)) {
    x0 = 0;
    x1 = w - 1;
  }
  if (!symmetric(y0, h - 1 - y1, h)) {
    y0 = 0;
    y1 = h - 1;
  }

  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  if (cw === w && ch === h) return full;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d")!.drawImage(full, x0, y0, cw, ch, 0, 0, cw, ch);
  return out;
}

function dominantColor(src: HTMLCanvasElement): string {
  const size = 32;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);

  let r = 0, g = 0, b = 0, total = 0;
  for (let i = 0; i < data.length; i += 4) {
    const max = Math.max(data[i], data[i + 1], data[i + 2]);
    const min = Math.min(data[i], data[i + 1], data[i + 2]);
    const sat = max === 0 ? 0 : (max - min) / max;
    const weight = sat * sat + 0.02; // utamakan piksel yang berwarna
    r += data[i] * weight;
    g += data[i + 1] * weight;
    b += data[i + 2] * weight;
    total += weight;
  }
  return toBackground(r / total, g / total, b / total);
}

/** Atur saturasi & kecerahan supaya kartu putih tetap kontras di atasnya. */
function toBackground(r: number, g: number, b: number): string {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const d = max - min;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = Math.min(0.5, Math.max(0.3, (max + min) / 2));
  const s = Math.min(0.85, Math.max(0.45, d === 0 ? 0 : d / (1 - Math.abs(2 * ((max + min) / 2) - 1))));
  return `hsl(${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

export function prepareThumb(img: HTMLImageElement): PreparedThumb {
  const canvas = trimBars(img);
  return { canvas, width: canvas.width, height: canvas.height, dominant: dominantColor(canvas) };
}

/* ---------- helper gambar ---------- */

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitSize(thumb: PreparedThumb, maxW: number, maxH: number) {
  const scale = Math.min(maxW / thumb.width, maxH / thumb.height);
  return { w: Math.round(thumb.width * scale), h: Math.round(thumb.height * scale) };
}

function drawCover(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / src.width, h / src.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, x, y, w, h);
}

function drawThumb(ctx: CanvasRenderingContext2D, thumb: PreparedThumb, x: number, y: number, w: number, h: number, radius: number) {
  ctx.save();
  roundedRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(thumb.canvas, x, y, w, h);
  ctx.restore();
}

/** Blur yang jalan di semua browser (ctx.filter belum didukung di Safari lama). */
function drawBlurredCover(ctx: CanvasRenderingContext2D, src: HTMLCanvasElement) {
  const small = document.createElement("canvas");
  small.width = 27;
  small.height = 48;
  const sctx = small.getContext("2d")!;
  sctx.imageSmoothingQuality = "high";
  drawCover(sctx, src, 0, 0, small.width, small.height);

  const mid = document.createElement("canvas");
  mid.width = 108;
  mid.height = 192;
  const mctx = mid.getContext("2d")!;
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(small, 0, 0, mid.width, mid.height);

  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mid, 0, 0, STORY_W, STORY_H);
}

/* ---------- helper teks ---------- */

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): { lines: string[]; truncated: boolean } {
  const tokens: string[] = [];
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    if (ctx.measureText(word).width <= maxWidth) {
      tokens.push(word);
      continue;
    }
    let chunk = "";
    for (const ch of Array.from(word)) {
      if (ctx.measureText(chunk + ch).width > maxWidth) {
        tokens.push(chunk);
        chunk = ch;
      } else chunk += ch;
    }
    if (chunk) tokens.push(chunk);
  }

  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const next = line ? `${line} ${token}` : token;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = token;
    }
  }
  if (line) lines.push(line);

  if (lines.length <= maxLines) return { lines, truncated: false };
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return { lines: kept, truncated: true };
}

interface TitleLayout {
  lines: string[];
  size: number;
  lineHeight: number;
  height: number;
  font: string;
}

/** Cari ukuran font terbesar yang muat dalam `maxLines` baris tanpa dipotong. */
function layoutTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  sizes: number[],
  maxLines: number,
  lineHeightRatio: number,
): TitleLayout {
  let result: TitleLayout | null = null;
  for (const size of sizes) {
    const font = `800 ${size}px ${FONT}`;
    ctx.font = font;
    const { lines, truncated } = wrapText(ctx, text, maxWidth, maxLines);
    const lineHeight = Math.round(size * lineHeightRatio);
    result = { lines, size, lineHeight, height: lines.length * lineHeight, font };
    if (!truncated) break;
  }
  return result!;
}

function drawLines(ctx: CanvasRenderingContext2D, t: TitleLayout, x: number, y: number) {
  ctx.font = t.font;
  ctx.textBaseline = "top";
  t.lines.forEach((line, i) => ctx.fillText(line, x, y + i * t.lineHeight));
}

function oneLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  let out = text;
  while (out.length > 1 && ctx.measureText(out).width > maxWidth) out = out.slice(0, -1);
  return out === text ? text : `${out.trimEnd()}…`;
}

/* ---------- template ---------- */

const blur: StoryTemplate = {
  id: "blur",
  label: "Blur",
  hint: "Latar thumbnail buram",
  draw(ctx, { title, channel, thumb }) {
    drawBlurredCover(ctx, thumb.canvas);
    const shade = ctx.createLinearGradient(0, 0, 0, STORY_H);
    shade.addColorStop(0, "rgba(8,6,6,0.62)");
    shade.addColorStop(1, "rgba(8,6,6,0.78)");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, STORY_W, STORY_H);

    const cx = STORY_W / 2;
    const t = layoutTitle(ctx, title, 880, [66, 58, 52, 46], 3, 1.16);
    const channelH = 46;
    const gapThumb = 56;
    const gapChannel = 22;
    const textBlock = gapThumb + t.height + gapChannel + channelH;

    const { w, h } = fitSize(thumb, 900, Math.min(760, ZONE_H - textBlock));
    const top = ZONE_TOP + Math.max(0, (ZONE_H - (h + textBlock)) / 2);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 60;
    ctx.shadowOffsetY = 24;
    ctx.fillStyle = "#000";
    roundedRect(ctx, cx - w / 2, top, w, h, 44);
    ctx.fill();
    ctx.restore();
    drawThumb(ctx, thumb, cx - w / 2, top, w, h, 44);
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 3;
    roundedRect(ctx, cx - w / 2, top, w, h, 44);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = "#fff";
    const titleY = top + h + gapThumb;
    drawLines(ctx, t, cx, titleY);

    ctx.font = `600 36px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText(oneLine(ctx, channel, 860), cx, titleY + t.height + gapChannel);
    ctx.textAlign = "left";
  },
};

const minimal: StoryTemplate = {
  id: "minimal",
  label: "Minimal",
  hint: "Kartu putih, warna dari thumbnail",
  draw(ctx, { title, channel, thumb }) {
    ctx.fillStyle = thumb.dominant;
    ctx.fillRect(0, 0, STORY_W, STORY_H);

    const pad = 44;
    const cardW = 888;
    const innerW = cardW - pad * 2;
    const cardX = (STORY_W - cardW) / 2;

    const t = layoutTitle(ctx, title, innerW, [60, 54, 48, 44], 3, 1.16);
    const channelH = 44;
    const gap = 36;
    const textBlock = gap + t.height + 14 + channelH;
    const { w, h } = fitSize(thumb, innerW, Math.min(760, ZONE_H - pad * 2 - textBlock));

    const cardH = pad + h + textBlock + pad;
    const cardY = ZONE_TOP + Math.max(0, (ZONE_H - cardH) / 2);

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.28)";
    ctx.shadowBlur = 70;
    ctx.shadowOffsetY = 28;
    ctx.fillStyle = "#fff";
    roundedRect(ctx, cardX, cardY, cardW, cardH, 56);
    ctx.fill();
    ctx.restore();

    drawThumb(ctx, thumb, cardX + (cardW - w) / 2, cardY + pad, w, h, 28);

    const textX = cardX + pad;
    const titleY = cardY + pad + h + gap;
    ctx.fillStyle = "#15120F";
    drawLines(ctx, t, textX, titleY);

    const chY = titleY + t.height + 14;
    ctx.fillStyle = "#FF3B30";
    ctx.beginPath();
    ctx.arc(textX + 11, chY + 22, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `600 34px ${FONT}`;
    ctx.fillStyle = "#6B645C";
    ctx.textBaseline = "top";
    ctx.fillText(oneLine(ctx, channel, innerW - 36), textX + 36, chY + 3);
  },
};

const bold: StoryTemplate = {
  id: "bold",
  label: "Bold",
  hint: "Judul besar, badge merah",
  draw(ctx, { title, channel, thumb }) {
    ctx.fillStyle = "#0E0D0C";
    ctx.fillRect(0, 0, STORY_W, STORY_H);
    // aksen: blok warna miring di pojok
    ctx.save();
    ctx.fillStyle = "#FFD60A";
    ctx.beginPath();
    ctx.moveTo(STORY_W, 0);
    ctx.lineTo(STORY_W, 520);
    ctx.lineTo(STORY_W - 520, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const x = 80;
    const maxW = STORY_W - x * 2;

    ctx.font = `600 34px ${FONT}`;
    const channelText = oneLine(ctx, channel.toUpperCase(), maxW - 120);
    const channelH = 40;
    const t = layoutTitle(ctx, title, maxW, [112, 100, 88, 76, 66, 58], 4, 1.04);
    const badgeH = 92;
    const gapA = 26;
    const gapB = 64;
    const textBlock = channelH + gapA + t.height + gapB;
    const shadow = 18;
    const { w, h } = fitSize(thumb, maxW - shadow, Math.min(760, ZONE_H - textBlock - badgeH / 2 - shadow));

    const total = textBlock + h + badgeH / 2 + shadow;
    const top = ZONE_TOP + Math.max(0, (ZONE_H - total) / 2);

    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.font = `600 34px ${FONT}`;
    ctx.fillStyle = "#FFD60A";
    ctx.fillText(channelText, x, top);

    ctx.fillStyle = "#fff";
    drawLines(ctx, t, x, top + channelH + gapA);

    const ty = top + textBlock;
    ctx.fillStyle = "#FF3B30";
    roundedRect(ctx, x + shadow, ty + shadow, w, h, 30);
    ctx.fill();
    drawThumb(ctx, thumb, x, ty, w, h, 30);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 8;
    roundedRect(ctx, x, ty, w, h, 30);
    ctx.stroke();

    // badge
    const label = "TONTON DI YOUTUBE";
    ctx.font = `800 40px ${FONT}`;
    const labelW = ctx.measureText(label).width;
    const badgeW = 40 + 44 + 22 + labelW + 44;
    const bx = x + 28;
    const by = ty + h - badgeH / 2;
    ctx.save();
    ctx.translate(bx + badgeW / 2, by + badgeH / 2);
    ctx.rotate((-3 * Math.PI) / 180);
    ctx.translate(-badgeW / 2, -badgeH / 2);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = "#FF3B30";
    roundedRect(ctx, 0, 0, badgeW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.moveTo(40, badgeH / 2 - 20);
    ctx.lineTo(40 + 36, badgeH / 2);
    ctx.lineTo(40, badgeH / 2 + 20);
    ctx.closePath();
    ctx.fill();
    ctx.textBaseline = "middle";
    ctx.fillText(label, 40 + 44 + 22, badgeH / 2 + 2);
    ctx.restore();
  },
};

export const TEMPLATES: StoryTemplate[] = [blur, minimal, bold];

export function renderStory(canvas: HTMLCanvasElement, templateId: TemplateId, data: StoryData) {
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas tidak didukung");
  ctx.clearRect(0, 0, STORY_W, STORY_H);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const template = TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
  template.draw(ctx, data);
}
