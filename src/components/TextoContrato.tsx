// Folha do contrato: papel branco com texto escuro, cores FIXAS (não seguem o tema escuro do painel).
// A mesma folha é usada na prévia do painel e na página do cliente: o que você aprova é o que ele vê.
// "# " vira título, "## " vira cláusula, linha vazia separa parágrafos. O texto passa pelo React (escapado).

export function TextoContrato({ texto }: { texto: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-7 text-[#374151]">
      {texto.split(/\n/).map((linha, i) => {
        if (linha.startsWith("# ")) {
          return (
            <h1 key={i} className="pb-1 text-center text-lg font-bold uppercase tracking-wide text-[#111827] sm:text-xl">
              {linha.slice(2)}
            </h1>
          );
        }
        if (linha.startsWith("## ")) {
          return (
            <h2 key={i} className="border-b border-[#e5e7eb] pb-1 pt-4 text-sm font-bold uppercase tracking-wide text-[#111827]">
              {linha.slice(3)}
            </h2>
          );
        }
        if (!linha.trim()) return null;
        return (
          <p key={i} className="whitespace-pre-wrap text-justify">
            {linha}
          </p>
        );
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
