// Base de conhecimento do agente (RAG). Busca híbrida: BM25 por palavras + similaridade de embeddings
// (quando o provedor de IA gera embeddings). Os embeddings são calculados sob demanda e refeitos
// quando o texto muda (a edição zera o embedding salvo).

import { db } from "../db";
import { gerarEmbeddings } from "../ia/servico";
import { log, mensagemErro } from "@/lib/log";

const PARADAS = new Set(
  "a o e de da do das dos em no na nos nas um uma uns umas para por com sem que se ou ao aos as os mais muito pouco ja ja nao sim eu voce voces ele ela eles elas meu minha seu sua isso isto esse essa este esta qual quais como quando onde tem ter ser sao foi vai vou pra pro ne".split(" "),
);

export function tokenizar(t: string): string[] {
  return (
    t
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .match(/[a-z0-9]{2,}/g) ?? []
  )
    .filter((w) => !PARADAS.has(w))
    .map((w) => (w.length > 4 ? w.replace(/(oes|aes|ais|eis|s)$/, "") : w));
}

export interface Trecho {
  id: string;
  categoria: string;
  titulo: string;
  conteudo: string;
  score: number;
}

function cosseno(a: number[], b: number[]): number {
  let s = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    s += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? s / Math.sqrt(na * nb) : 0;
}

type Item = Awaited<ReturnType<typeof db.conhecimento.findMany>>[number];

function bm25(itens: Item[], consulta: string[]): number[] {
  const docs = itens.map((i) => tokenizar(`${i.titulo} ${i.titulo} ${i.categoria} ${i.tags ?? ""} ${i.conteudo}`));
  const media = docs.reduce((s, d) => s + d.length, 0) / Math.max(1, docs.length);
  const k1 = 1.4;
  const b = 0.75;
  return docs.map((d) => {
    let s = 0;
    for (const q of new Set(consulta)) {
      const f = d.filter((w) => w === q).length;
      if (!f) continue;
      const n = docs.filter((x) => x.includes(q)).length;
      const idf = Math.log(1 + (docs.length - n + 0.5) / (n + 0.5));
      s += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * d.length) / media)));
    }
    return s;
  });
}

async function garantirEmbeddings(itens: Item[], modeloAtual: string | null): Promise<Item[]> {
  const faltando = itens.filter((i) => !i.embedding || (modeloAtual && i.embeddingModelo !== modeloAtual));
  if (!faltando.length) return itens;
  const r = await gerarEmbeddings(faltando.map((i) => `${i.titulo}\n${i.conteudo}`.slice(0, 8000)));
  if (!r) return itens;
  for (let k = 0; k < faltando.length; k++) {
    faltando[k].embedding = JSON.stringify(r.vetores[k]);
    faltando[k].embeddingModelo = r.modelo;
    await db.conhecimento.update({ where: { id: faltando[k].id }, data: { embedding: faltando[k].embedding, embeddingModelo: r.modelo } });
  }
  return itens;
}

export async function buscarConhecimento(consulta: string, k = 5): Promise<Trecho[]> {
  let itens = await db.conhecimento.findMany({ where: { ativo: true } });
  if (!itens.length) return [];
  const lex = bm25(itens, tokenizar(consulta));
  const maxLex = Math.max(...lex, 0);

  let sem: number[] = itens.map(() => 0);
  try {
    const q = await gerarEmbeddings([consulta]);
    if (q) {
      itens = await garantirEmbeddings(itens, q.modelo);
      sem = itens.map((i) => (i.embedding && i.embeddingModelo === q.modelo ? cosseno(JSON.parse(i.embedding) as number[], q.vetores[0]) : 0));
    }
  } catch (e) {
    // Sem embeddings (limite, erro de rede): segue só com a busca por palavras.
    log.aviso("RAG: embeddings indisponíveis", { erro: mensagemErro(e) });
  }

  const usaSem = sem.some((s) => s > 0);
  const notas = itens.map((_, i) => (maxLex ? lex[i] / maxLex : 0) * (usaSem ? 0.5 : 1) + (usaSem ? Math.max(0, sem[i]) * 0.5 : 0));
  const escolhidos = itens
    .map((it, i) => ({ id: it.id, categoria: it.categoria, titulo: it.titulo, conteudo: it.conteudo, score: notas[i] }))
    .filter((t) => t.score > 0.05)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  if (escolhidos.length) await db.conhecimento.updateMany({ where: { id: { in: escolhidos.map((e) => e.id) } }, data: { usos: { increment: 1 } } });
  return escolhidos;
}
