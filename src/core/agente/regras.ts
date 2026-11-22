// Verificação de toda resposta do agente ANTES de enviar. A IA recebe as regras no prompt, mas o código
// confere de novo: preço que não está cadastrado, desconto acima do limite ou promessa de resultado
// bloqueiam a mensagem e transferem para uma pessoa.

export interface ServicoRegra {
  nome: string;
  precoCentavos: number;
  descontoMaxPct: number;
  descontoMaxCentavos?: number;
  condicoes: string | null;
}

/** Maior desconto permitido em centavos: o maior entre o valor fixo e o percentual. */
export function descontoMaximo(s: ServicoRegra): number {
  return Math.min(s.precoCentavos, Math.max(s.descontoMaxCentavos ?? 0, Math.floor((s.precoCentavos * s.descontoMaxPct) / 100)));
}

export function centavosDe(valor: string): number | null {
  // "1.500", "1.500,00", "1500", "1500,5"
  const limpo = valor.replace(/\s/g, "");
  if (!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(limpo)) return null;
  const [inteiro, dec = "0"] = limpo.replace(/\./g, "").split(",");
  return Number(inteiro) * 100 + Number(dec.padEnd(2, "0"));
}

export function valoresMencionados(texto: string): number[] {
  return [...texto.matchAll(/R\$\s?(\d[\d.]*(?:,\d{1,2})?)/gi)].map((m) => centavosDe(m[1])).filter((v): v is number => v !== null);
}

/** Valores permitidos: preço cadastrado, preço com desconto até o limite, parcelas e valores escritos nas condições. */
export function valorPermitido(centavos: number, servicos: ServicoRegra[]): boolean {
  for (const s of servicos) {
    if (centavos === s.precoCentavos) return true;
    const minimo = s.precoCentavos - descontoMaximo(s);
    if (centavos >= minimo && centavos <= s.precoCentavos) return true;
    for (let n = 2; n <= 12; n++) if (Math.abs(centavos - Math.round(s.precoCentavos / n)) <= 1) return true;
    if (s.condicoes && valoresMencionados(s.condicoes).includes(centavos)) return true;
  }
  return false;
}

const PROMESSAS = [
  /garant\w*\s+(?:de\s+|que\s+)?(?:\w+\s+){0,3}(?:resultado|cliente|venda|faturamento|lucro|retorno|primeira p[aá]gina|topo|aumento)/i,
  /(?:vai|v[aã]o|ir[aá]|ir[aã]o)\s+(?:\w+\s+){0,2}(?:aumentar|dobrar|triplicar|multiplicar)\s+(?:\w+\s+){0,2}(?:vendas|faturamento|clientes|lucro)/i,
  /100\s?%\s+garantid/i,
  /resultado\s+garantido/i,
];

export interface Verificacao {
  ok: boolean;
  motivo?: string;
}

export function verificarResposta(texto: string, servicos: ServicoRegra[]): Verificacao {
  if (!texto.trim()) return { ok: false, motivo: "Resposta vazia." };
  if (texto.length > 1200) return { ok: false, motivo: "Resposta longa demais para WhatsApp." };
  for (const v of valoresMencionados(texto)) {
    if (!valorPermitido(v, servicos)) {
      return { ok: false, motivo: `Valor R$ ${(v / 100).toFixed(2).replace(".", ",")} não corresponde a nenhum preço ou desconto autorizado.` };
    }
  }
  for (const re of PROMESSAS) {
    if (re.test(texto)) return { ok: false, motivo: "A resposta prometia resultado garantido." };
  }
  return { ok: true };
}

export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
