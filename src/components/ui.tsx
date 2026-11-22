// Peças visuais compartilhadas (sem estado).

import { PRESENCA_ROTULO, type Presenca } from "@/core/tipos";

export const COR_ETAPA: Record<string, string> = {
  slate: "bg-slate-400",
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  blue: "bg-blue-500",
  cyan: "bg-cyan-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  emerald: "bg-emerald-500",
  zinc: "bg-zinc-500",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
  pink: "bg-pink-500",
  lime: "bg-lime-500",
};

const COR_PRESENCA: Record<Presenca, string> = {
  sem_site_identificado: "bg-rose-100 text-rose-800",
  so_rede_social: "bg-amber-100 text-amber-800",
  site_fora_do_ar: "bg-orange-100 text-orange-800",
  com_site: "bg-slate-100 text-slate-700",
};

export function SeloPresenca({ presenca, confianca }: { presenca: string; confianca?: string }) {
  const p = presenca as Presenca;
  return (
    <span className={`selo ${COR_PRESENCA[p] ?? "bg-slate-100"}`} title={confianca ? `Confiança: ${confianca}` : undefined}>
      {PRESENCA_ROTULO[p] ?? presenca}
      {confianca && p === "sem_site_identificado" ? ` · ${confianca}` : ""}
    </span>
  );
}

export function Score({ valor }: { valor: number | null }) {
  if (valor == null) return <span className="inline-flex h-7 w-9 items-center justify-center rounded-md bg-slate-100 text-xs text-slate-400">—</span>;
  const cor = valor >= 70 ? "bg-linear-to-br from-emerald-500 to-teal-600" : valor >= 50 ? "bg-linear-to-br from-violet-600 to-fuchsia-600" : "bg-zinc-500";
  return <span className={`inline-flex h-7 w-9 items-center justify-center rounded-md text-xs font-semibold text-white ${cor}`}>{valor}</span>;
}

const STATUS_Q: Record<string, [string, string]> = {
  pendente: ["Aguardando análise", "bg-slate-100 text-slate-600"],
  analisando: ["Analisando", "bg-sky-100 text-sky-800"],
  qualificado: ["Qualificado", "bg-emerald-100 text-emerald-800"],
  desqualificado: ["Baixo potencial", "bg-slate-100 text-slate-600"],
  erro: ["Erro na análise", "bg-rose-100 text-rose-800"],
  descartado: ["Descartado", "bg-zinc-200 text-zinc-700"],
};

export function SeloQualificacao({ status }: { status: string }) {
  const [t, c] = STATUS_Q[status] ?? [status, "bg-slate-100"];
  return <span className={`selo ${c}`}>{t}</span>;
}

const STATUS_CONTATO: Record<string, [string, string]> = {
  sem_autorizacao: ["Sem autorização", "bg-slate-100 text-slate-600"],
  autorizado: ["Contato autorizado", "bg-emerald-100 text-emerald-800"],
  opt_out: ["Não contatar (opt-out)", "bg-rose-100 text-rose-800"],
};

export function SeloContato({ status }: { status: string }) {
  const [t, c] = STATUS_CONTATO[status] ?? [status, "bg-slate-100"];
  return <span className={`selo ${c}`}>{t}</span>;
}

export function Barra({ valor }: { valor: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={valor} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-linear-to-r from-violet-600 via-fuchsia-500 to-pink-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, valor))}%` }} />
    </div>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <div className="cartao p-8 text-center text-sm text-slate-500">{children}</div>;
}

export function Titulo({ children, acoes }: { children: React.ReactNode; acoes?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">{children}</h1>
      {acoes}
    </div>
  );
}

export function dataHora(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function data(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

export function usd(v: number | null | undefined): string {
  if (v == null) return "—";
  return `US$ ${v < 0.01 && v > 0 ? v.toFixed(4) : v.toFixed(2)}`;
}
