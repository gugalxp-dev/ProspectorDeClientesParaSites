import Link from "next/link";
import { AlertTriangle, CreditCard, FileSignature, Hand, Send } from "lucide-react";

/** Contadores clicáveis do que depende de você. Usado em /pendencias e no dashboard. */
export function IndicadoresPendencias({ aprovar, contratos, intervencao, alertas, cobrar = 0 }: { aprovar: number; contratos: number; intervencao: number; alertas: number; cobrar?: number }) {
  const itens = [
    { n: cobrar, rotulo: "Enviar link de pagamento", ancora: "cobrar", Icone: CreditCard, cor: "text-teal-600", fundo: "border-teal-300" },
    { n: contratos, rotulo: "Aceitaram: gerar contrato", ancora: "contratos", Icone: FileSignature, cor: "text-emerald-600", fundo: "border-emerald-300" },
    { n: intervencao, rotulo: "Negociações esperando você", ancora: "intervencao", Icone: Hand, cor: "text-rose-600", fundo: "border-rose-300" },
    { n: aprovar, rotulo: "Contatos para aprovar", ancora: "aprovar", Icone: Send, cor: "text-violet-600", fundo: "border-violet-300" },
    { n: alertas, rotulo: "Alertas do sistema", ancora: "alertas", Icone: AlertTriangle, cor: "text-amber-600", fundo: "border-amber-300" },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {itens.map(({ n, rotulo, ancora, Icone, cor, fundo }) => (
        <Link key={ancora} href={`/pendencias#${ancora}`} className={`cartao flex items-center gap-3 border-2 p-4 transition hover:shadow-md ${n > 0 ? fundo : "border-transparent"}`}>
          <Icone className={`size-6 ${n > 0 ? cor : "text-slate-400"}`} />
          <div>
            <div className={`text-2xl font-bold tabular-nums ${n > 0 ? cor : "text-slate-400"}`}>{n}</div>
            <div className="text-xs text-slate-600">{rotulo}</div>
          </div>
        </Link>
      ))}
    </div>
  );
}
