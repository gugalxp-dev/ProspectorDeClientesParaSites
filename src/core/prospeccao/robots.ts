// Leitor mínimo de robots.txt (RFC 9309): grupos por User-agent, Allow/Disallow com * e $, regra mais longa vence.

export interface Regra {
  permitir: boolean;
  padrao: string;
}

export function interpretarRobots(texto: string, agente: string): Regra[] {
  const nosso = agente.toLowerCase();
  const grupos: Array<{ agentes: string[]; regras: Regra[] }> = [];
  let atual: { agentes: string[]; regras: Regra[] } | null = null;
  let ultimaFoiAgente = false;

  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.replace(/#.*/, "").trim();
    const m = linha.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const campo = m[1].toLowerCase();
    const valor = m[2].trim();
    if (campo === "user-agent") {
      if (!ultimaFoiAgente || !atual) {
        atual = { agentes: [], regras: [] };
        grupos.push(atual);
      }
      atual.agentes.push(valor.toLowerCase());
      ultimaFoiAgente = true;
    } else if ((campo === "allow" || campo === "disallow") && atual) {
      ultimaFoiAgente = false;
      if (valor === "" && campo === "disallow") continue; // "Disallow:" vazio = tudo permitido
      atual.regras.push({ permitir: campo === "allow", padrao: valor });
    } else {
      ultimaFoiAgente = false;
    }
  }

  const especifico = grupos.filter((g) => g.agentes.some((a) => a !== "*" && nosso.includes(a)));
  const escolhidos = especifico.length ? especifico : grupos.filter((g) => g.agentes.includes("*"));
  return escolhidos.flatMap((g) => g.regras);
}

function casa(caminho: string, padrao: string): boolean {
  const ancorado = padrao.endsWith("$");
  const corpo = (ancorado ? padrao.slice(0, -1) : padrao).split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${corpo}${ancorado ? "$" : ""}`).test(caminho);
}

export function permitido(regras: Regra[], caminho: string): boolean {
  let melhor: Regra | null = null;
  for (const r of regras) {
    if (!casa(caminho, r.padrao)) continue;
    if (!melhor || r.padrao.length > melhor.padrao.length || (r.padrao.length === melhor.padrao.length && r.permitir)) melhor = r;
  }
  return melhor ? melhor.permitir : true;
}
