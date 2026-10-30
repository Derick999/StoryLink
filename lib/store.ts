import { Redis } from "@upstash/redis";
import { customAlphabet, nanoid } from "nanoid";

export const LINK_TTL = 86400; // 24 jam, dalam detik

const shortId = customAlphabet("abcdefghijkmnpqrstuvwxyz23456789", 7);

export interface LinkRecord {
  url: string;
  createdAt: number;
}

export class StoreUnavailableError extends Error {
  constructor() {
    super("Redis tidak tersedia");
  }
}

let client: Redis | null | undefined;

/** Kredensial dari integrasi Vercel Marketplace (Upstash): KV_REST_API_URL dan KV_REST_API_TOKEN. */
function getRedis(): Redis {
  if (client === undefined) {
    const missing = ["KV_REST_API_URL", "KV_REST_API_TOKEN"].filter((name) => !process.env[name]);
    if (missing.length > 0) {
      console.error(
        `[store] Redis tidak dikonfigurasi: env var ${missing.join(" dan ")} kosong. ` +
          "Sambungkan Upstash Redis lewat Vercel Marketplace atau isi variabelnya, lalu redeploy.",
      );
      client = null;
    } else {
      client = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
    }
  }
  if (!client) throw new StoreUnavailableError();
  return client;
}

/** Bungkus error jaringan/Redis jadi StoreUnavailableError supaya pemanggil cukup menangani satu jenis. */
async function guard<T>(fn: (r: Redis) => Promise<T>): Promise<T> {
  const r = getRedis();
  try {
    return await fn(r);
  } catch (e) {
    console.error("[store] Perintah Redis gagal:", e);
    throw new StoreUnavailableError();
  }
}

export async function createLink(url: string): Promise<{ id: string; statsToken: string }> {
  return guard(async (r) => {
    const record: LinkRecord = { url, createdAt: Date.now() };
    for (let attempt = 0; attempt < 4; attempt++) {
      const id = shortId();
      const ok = await r.set(`link:${id}`, record, { nx: true, ex: LINK_TTL });
      if (!ok) continue; // id sudah dipakai, coba lagi
      const statsToken = nanoid(32);
      await Promise.all([
        r.set(`clicks:${id}`, 0, { ex: LINK_TTL }),
        r.set(`stats:${statsToken}`, id, { ex: LINK_TTL }),
      ]);
      return { id, statsToken };
    }
    throw new StoreUnavailableError();
  });
}

export async function getLink(id: string): Promise<LinkRecord | null> {
  return guard((r) => r.get<LinkRecord>(`link:${id}`));
}

export async function countClick(id: string): Promise<void> {
  await guard(async (r) => {
    const n = await r.incr(`clicks:${id}`);
    if (n === 1) {
      // kunci clicks sudah kedaluwarsa lebih dulu: jangan biarkan hidup selamanya
      const ttl = await r.ttl(`link:${id}`);
      if (ttl > 0) await r.expire(`clicks:${id}`, ttl);
    }
  });
}

export interface Stats {
  id: string;
  clicks: number;
  /** Detik tersisa sebelum data dihapus. */
  ttl: number;
}

export async function getStats(statsToken: string): Promise<Stats | null> {
  return guard(async (r) => {
    const id = await r.get<string>(`stats:${statsToken}`);
    if (!id) return null;
    const [clicks, ttl] = await Promise.all([r.get<number>(`clicks:${id}`), r.ttl(`stats:${statsToken}`)]);
    if (ttl <= 0) return null;
    return { id, clicks: Number(clicks ?? 0), ttl };
  });
}
