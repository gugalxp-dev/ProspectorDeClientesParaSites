// Folha do contrato: papel branco com texto escuro, cores FIXAS (não seguem o tema escuro do painel).
// A mesma folha é usada na prévia do painel e na página do cliente: o que você aprova é o que ele vê.
// Markdown simples: "# " título, "## " cláusula, "### " subtítulo, "- "/"* "/"• " lista, "1. " lista numerada,
// **negrito**, *itálico*, linha vazia separa parágrafos. Tudo vira elemento React (escapado): nada de HTML cru.

import type { ReactNode } from "react";

/** **negrito**, __negrito__, *itálico* e _itálico_ dentro de uma linha. */
export function formatarInline(texto: string): ReactNode[] {
  const partes: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\s][^*]*?)\*|_([^_\s][^_]*?)_)/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) partes.push(texto.slice(ultimo, m.index));
    const negrito = m[2] ?? m[3];
    partes.push(
      negrito !== undefined ? (
        <strong key={m.index} className="font-semibold text-[#111827]">{negrito}</strong>
      ) : (
        <em key={m.index}>{m[4] ?? m[5]}</em>
      ),
    );
    ultimo = m.index + m[0].length;
  }
  if (ultimo < texto.length) partes.push(texto.slice(ultimo));
  return partes;
}

type Bloco =
  | { tipo: "h1" | "h2" | "h3" | "p"; texto: string }
  | { tipo: "ul" | "ol"; itens: string[] };

const ITEM = /^\s*[-*•]\s+(.*)$/;
const NUMERO = /^\s*\d+[.)]\s+(.*)$/;

/** Agrupa as linhas em blocos (itens seguidos de lista viram uma lista só). */
export function blocosDoContrato(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  for (const linha of texto.replace(/\r/g, "").split("\n")) {
    const item = ITEM.exec(linha);
    const numero = item ? null : NUMERO.exec(linha);
    const anterior = blocos[blocos.length - 1];
    if (item || numero) {
      const tipo = item ? "ul" : "ol";
      const conteudo = (item ?? numero)![1];
      if (anterior && anterior.tipo === tipo) anterior.itens.push(conteudo);
      else blocos.push({ tipo, itens: [conteudo] });
    } else if (linha.startsWith("### ")) blocos.push({ tipo: "h3", texto: linha.slice(4) });
    else if (linha.startsWith("## ")) blocos.push({ tipo: "h2", texto: linha.slice(3) });
    else if (linha.startsWith("# ")) blocos.push({ tipo: "h1", texto: linha.slice(2) });
    else if (linha.trim()) blocos.push({ tipo: "p", texto: linha.trim() });
  }
  return blocos;
}

export function TextoContrato({ texto }: { texto: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-7 text-[#374151]">
      {blocosDoContrato(texto).map((b, i) => {
        switch (b.tipo) {
          case "h1":
            return (
              <h1 key={i} className="pb-1 text-center text-lg font-bold uppercase tracking-wide text-[#111827] sm:text-xl">
                {formatarInline(b.texto)}
              </h1>
            );
          case "h2":
            return (
              <h2 key={i} className="border-b border-[#e5e7eb] pb-1 pt-4 text-sm font-bold uppercase tracking-wide text-[#111827]">
                {formatarInline(b.texto)}
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="pt-2 font-semibold text-[#111827]">
                {formatarInline(b.texto)}
              </h3>
            );
          case "ul":
          case "ol": {
            const Lista = b.tipo;
            return (
              <Lista key={i} className={`space-y-1.5 pl-6 text-left ${b.tipo === "ul" ? "list-disc" : "list-decimal"} marker:text-[#6b7280]`}>
                {b.itens.map((it, j) => (
                  <li key={j}>{formatarInline(it)}</li>
                ))}
              </Lista>
            );
          }
          default:
            return (
              <p key={i} className="text-justify">
                {formatarInline(b.texto)}
              </p>
            );
        }
      })}
    </div>
  );
}

export interface CabecalhoContrato {
  logo?: string | null;
  empresa?: string | null;
  numero?: string | null;
}

/** Contrato como documento pronto: folha centralizada, proporção de página, pronta para ler, imprimir ou salvar em PDF. */
export function FolhaContrato({ texto, rodape, cabecalho }: { texto: string; rodape?: React.ReactNode; cabecalho?: CabecalhoContrato }) {
  return (
    <article className="mx-auto w-full max-w-[820px] rounded-sm bg-[#ffffff] px-6 py-10 text-[#1f2937] shadow-2xl ring-1 ring-black/10 sm:px-16 sm:py-14 print:max-w-none print:px-0 print:py-0 print:shadow-none print:ring-0">
      {cabecalho && (cabecalho.logo || cabecalho.empresa) && (
        <header className="mb-8 flex items-center gap-4 border-b border-[#e5e7eb] pb-5">
          {cabecalho.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cabecalho.logo} alt={cabecalho.empresa ? `Logo ${cabecalho.empresa}` : "Logo"} className="size-14 shrink-0 rounded-xl object-contain" />
          )}
          <div className="min-w-0 flex-1">
            {cabecalho.empresa && <div className="text-lg font-bold text-[#111827]">{cabecalho.empresa}</div>}
            <div className="text-xs uppercase tracking-wide text-[#6b7280]">Contrato de prestação de serviços</div>
          </div>
          {cabecalho.numero && <div className="shrink-0 text-right text-xs text-[#6b7280]">Nº<br /><span className="font-mono text-sm text-[#111827]">{cabecalho.numero}</span></div>}
        </header>
      )}
      <TextoContrato texto={texto} />
      {rodape && <div className="mt-10 border-t border-[#e5e7eb] pt-6 text-sm text-[#374151]">{rodape}</div>}
    </article>
  );
}
