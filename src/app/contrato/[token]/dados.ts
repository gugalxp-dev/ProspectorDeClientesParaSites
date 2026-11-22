// Dados da página pública do contrato, compartilhados entre a página, os metadados (prévia do link) e a imagem de prévia.
// cache(): numa mesma requisição, o banco é consultado uma vez só.

import { cache } from "react";
import { obterConfig } from "@/core/config";
import { contratoPorToken, esquemaDadosContrato, reais } from "@/core/contratos";

export const dadosContratoPublico = cache(async (token: string) => {
  const c = await contratoPorToken(token);
  if (!c || !c.conteudo || c.status === "rascunho") return null;
  const [cfg, cfgAgente] = await Promise.all([obterConfig("contrato"), obterConfig("agente")]);
  const dados = esquemaDadosContrato.parse(JSON.parse(c.dados));
  const marca = (cfgAgente.nomeEmpresa || cfg.contratadaNome).trim() || "Contrato de prestação de serviços";
  return { c, cfg, dados, marca, valor: reais(dados.valorCentavos) };
});

/** Robôs que abrem o link só para montar a prévia (WhatsApp, Facebook, gerador de prévia do Baileys...). */
export const ROBO_PREVIA = /bot|crawler|spider|preview|whatsapp|facebookexternalhit|facebookcatalog|slackbot|discord|telegram|skype|linkedin|embedly|curl|wget|node-fetch|undici|headless/i;
