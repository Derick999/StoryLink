# StoryLink

Tempel link YouTube (terutama Shorts), dapatkan gambar template Instagram Story 1080×1920, lalu share atau download. Next.js (App Router) + TypeScript + Tailwind, tanpa database dan tanpa login.

## Menjalankan

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # cek build produksi
```

## Struktur

- `lib/youtube.ts` — parse video ID (`/shorts/`, `youtu.be/`, `watch?v=`).
- `lib/renderStory.ts` — seluruh logika canvas. Tambah template baru dengan menulis objek `StoryTemplate` (`id`, `label`, `hint`, `draw`) lalu masukkan ke array `TEMPLATES`.
- `app/api/meta` — judul & nama channel lewat YouTube oEmbed (tanpa API key).
- `app/api/thumb` — proxy thumbnail (`maxresdefault`, fallback `hqdefault`) supaya same-origin dan canvas tidak *tainted*.
- `components/StoryLink.tsx` — UI mobile-first.

Semua template menyisakan 250px atas/bawah (zona UI Story) dan ruang kosong di bawah konten untuk Link Sticker. Bar hitam di thumbnail Shorts dibuang otomatis.

## Deploy ke Vercel

Opsi A — CLI:

```bash
npm i -g vercel
vercel        # preview
vercel --prod
```

Opsi B — GitHub: push repo ini ke GitHub, lalu **Add New → Project** di vercel.com dan import repo-nya. Tidak ada environment variable yang dibutuhkan.

> Web Share API (`navigator.share` dengan file) hanya jalan di **HTTPS** dan di browser HP. Tes tombol "Share ke Instagram" lewat URL Vercel di HP, bukan `localhost` di desktop (desktop akan fallback ke download).
