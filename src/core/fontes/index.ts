// Registro das fontes de descoberta. Nova fonte = novo arquivo + uma linha aqui.

import { fonteOsm } from "./osm";
import type { FonteDescoberta } from "./tipos";

const REGISTRO = new Map<string, FonteDescoberta>([fonteOsm].map((f) => [f.id, f]));

export function todasAsFontes(): FonteDescoberta[] {
  return [...REGISTRO.values()];
}

export function fonte(id: string): FonteDescoberta | undefined {
  return REGISTRO.get(id);
}

/** Só para testes: troca uma fonte por uma simulada. */
export function registrarFonte(f: FonteDescoberta): void {
  REGISTRO.set(f.id, f);
}
