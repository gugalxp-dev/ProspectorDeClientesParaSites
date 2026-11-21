// Primitivas de criptografia (node:crypto). Ver "04 - Segurança/Criptografia".

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { segredoApp } from "./env";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** HMAC-SHA256 com AUTH_SECRET: tokens de sessão e números suprimidos nunca ficam em texto no banco. */
export function hashSecret(valor: string): string {
  return createHmac("sha256", segredoApp("AUTH_SECRET")).update(valor).digest("hex");
}

/** Comparação em tempo constante (evita ataque de tempo). */
export function iguaisSeguro(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

// ── Senhas: hash lento com sal (scrypt), nunca HMAC ──

const N = 2 ** 15;
const R = 8;
const P = 1;
const TAM = 64;

function scryptAsync(senha: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, erro) =>
    scrypt(senha, sal, TAM, { N: n, r, p, maxmem: 128 * n * r * 2 }, (e, k) => (e ? erro(e) : ok(k))),
  );
}

export async function hashSenha(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const k = await scryptAsync(senha, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64")}$${k.toString("base64")}`;
}

export async function conferirSenha(senha: string, guardado: string): Promise<boolean> {
  const [alg, n, r, p, sal, hash] = guardado.split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const k = await scryptAsync(senha, Buffer.from(sal, "base64"), Number(n), Number(r), Number(p));
  return k.length === esperado.length && timingSafeEqual(k, esperado);
}

/** Hash de mentira com o mesmo custo: login de e-mail inexistente demora o mesmo que senha errada. */
export const HASH_ISCA = `scrypt$${N}$${R}$${P}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(TAM).toString("base64")}`;

// ── Criptografia em repouso: AES-256-GCM para credenciais cadastradas no painel ──

function chaveCifra(): Buffer {
  // Deriva 32 bytes de qualquer string forte (hex, base64 ou texto).
  return createHash("sha256").update(segredoApp("APP_ENCRYPTION_KEY")).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chaveCifra(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString("base64");
}

export function decifrar(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const d = createDecipheriv("aes-256-gcm", chaveCifra(), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
}

/** HMAC-SHA256 genérico (assinatura de webhooks). */
export function hmacHex(chave: string, corpo: string | Buffer): string {
  return createHmac("sha256", chave).update(corpo).digest("hex");
}
