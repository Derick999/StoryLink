/**
 * Crop thumbnail Shorts jadi vertikal 9:16.
 * Thumbnail Shorts lama berupa 16:9 dengan bar hitam di kiri-kanan (pillarbox);
 * yang baru mengisi sisinya dengan salinan buram, dengan strip 9:16 tajam di tengah.
 * Bar hitam dibuang kalau ada; kalau tidak, ambil crop tengah 9:16 (cocok untuk kasus kedua).
 */

const SAMPLE_W = 640;
/** Rata-rata luminansi kolom/baris yang masih dianggap bar hitam (toleransi noise JPEG). */
const MEAN_MAX = 20;
/** Piksel paling terang di kolom bar tidak boleh melewati ini; membedakan bar dari adegan gelap. */
const PEAK_MAX = 70;
/** Bar yang lebih sempit dari ini (fraksi sisi) dianggap bukan bar. */
const MIN_BAR = 0.03;
/** Buang beberapa piksel tepi konten karena ringing/blend JPEG. */
const EDGE_INSET = 2;

const TARGET = 9 / 16;
const MIN_ASPECT = 0.45;
const MAX_ASPECT = 0.68;

function lumaOf(d: Uint8ClampedArray, i: number) {
  return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
}

/** Hitung berapa kolom (axis "x") atau baris (axis "y") hitam dari tepi `from` ke tengah. */
function barSize(data: Uint8ClampedArray, w: number, h: number, axis: "x" | "y", fromEnd: boolean) {
  const lines = axis === "x" ? w : h;
  const len = axis === "x" ? h : w;
  const limit = Math.floor(lines / 2);
  let n = 0;
  for (; n < limit; n++) {
    const line = fromEnd ? lines - 1 - n : n;
    let sum = 0;
    let peak = 0;
    for (let k = 0; k < len; k++) {
      const i = (axis === "x" ? k * w + line : line * w + k) * 4;
      const l = lumaOf(data, i);
      sum += l;
      if (l > peak) peak = l;
    }
    if (sum / len > MEAN_MAX || peak > PEAK_MAX) break;
  }
  return n;
}

export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** true kalau bar hitam ditemukan; false berarti crop tengah 9:16. */
  barsFound: boolean;
}

/** Cari kotak konten di koordinat gambar asli. */
export function detectShortsBox(img: HTMLImageElement): CropBox {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const sw = Math.min(W, SAMPLE_W);
  const sh = Math.max(1, Math.round((H * sw) / W));
  const small = document.createElement("canvas");
  small.width = sw;
  small.height = sh;
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0, sw, sh);
  const { data } = sctx.getImageData(0, 0, sw, sh);

  // Hanya pillarbox (kolom hitam kiri-kanan). Baris tidak dipotong: adegan gelap
  // atau sisi buram yang gelap gampang disangka bar.
  const left = barSize(data, sw, sh, "x", false);
  const right = barSize(data, sw, sh, "x", true);
  const bothBars = left >= sw * MIN_BAR && right >= sw * MIN_BAR;
  const balanced = Math.abs(left - right) <= Math.max(left, right) * 0.35;

  if (bothBars && balanced) {
    const k = W / sw;
    const x = Math.round((left + EDGE_INSET) * k);
    const w = Math.round((sw - right - EDGE_INSET) * k) - x;
    // sisa area harus berbentuk Shorts (~9:16); kalau tidak, itu bukan bar sungguhan
    if (w > 40 && w / H >= MIN_ASPECT && w / H <= MAX_ASPECT) {
      return { x, y: 0, w, h: H, barsFound: true };
    }
  }

  const w = Math.min(W, Math.round(H * TARGET));
  const h = Math.min(H, Math.round(W / TARGET));
  return { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h, barsFound: false };
}

export function cropShortsThumb(img: HTMLImageElement): { canvas: HTMLCanvasElement; barsFound: boolean } {
  const box = detectShortsBox(img);
  const out = document.createElement("canvas");
  out.width = box.w;
  out.height = box.h;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
  return { canvas: out, barsFound: box.barsFound };
}
