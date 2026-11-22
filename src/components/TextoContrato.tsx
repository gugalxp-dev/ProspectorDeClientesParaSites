// Mostra o texto do contrato: "# " vira título, "## " vira subtítulo, linha vazia separa parágrafos.
// O texto passa pelo React (escapado): nada de HTML vindo do modelo.

export function TextoContrato({ texto }: { texto: string }) {
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-slate-800">
      {texto.split(/\n/).map((linha, i) => {
        if (linha.startsWith("# ")) return <h1 key={i} className="text-center text-xl font-bold text-slate-900">{linha.slice(2)}</h1>;
        if (linha.startsWith("## ")) return <h2 key={i} className="pt-2 font-semibold text-slate-900">{linha.slice(3)}</h2>;
        if (!linha.trim()) return null;
        return <p key={i} className="whitespace-pre-wrap">{linha}</p>;
      })}
    </div>
  );
}
