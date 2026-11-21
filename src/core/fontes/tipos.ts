// Contrato de uma fonte de descoberta de empresas. Para adicionar uma fonte nova:
// 1. crie um arquivo nesta pasta exportando um objeto FonteDescoberta
// 2. registre em fontes/index.ts
// 3. ela aparece em Admin > Prospecção para ser ativada

import type { Local } from "../geocode";
import type { LugarBruto } from "../tipos";

export interface ParametrosDescoberta {
  nicho: string;
  cidade: string;
  local: Local;
  max: number;
  /** Para atribuir custos de fontes pagas à pesquisa. */
  buscaId?: string;
}

export interface FonteDescoberta {
  id: string;
  nome: string;
  descricao: string;
  /** Aviso legal ou de custo mostrado no painel. */
  aviso?: string;
  gratuita: boolean;
  disponivel(): Promise<{ ok: boolean; motivo?: string }>;
  descobrir(p: ParametrosDescoberta): Promise<LugarBruto[]>;
}

/** Fonte temporariamente indisponível (servidor fora, limite atingido): o job tenta de novo mais tarde. */
export class FonteIndisponivel extends Error {}
