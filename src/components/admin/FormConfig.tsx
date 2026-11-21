"use client";

// Formulário genérico para uma seção de configuração (Admin). Envia a seção inteira, validada no servidor.

import { useState } from "react";
import { chamarApi } from "../api";

export interface Campo {
  caminho: string; // "modelo" ou "crawler.profundidade"
  rotulo: string;
  tipo: "texto" | "area" | "numero" | "booleano" | "lista" | "opcoes";
  opcoes?: Array<[string, string]>;
  ajuda?: string;
  min?: number;
  max?: number;
  passo?: number;
}

function ler(obj: Record<string, unknown>, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

function escrever(obj: Record<string, unknown>, caminho: string, valor: unknown): Record<string, unknown> {
  const [k, ...resto] = caminho.split(".");
  if (!resto.length) return { ...obj, [k]: valor };
  return { ...obj, [k]: escrever((obj[k] as Record<string, unknown>) ?? {}, resto.join("."), valor) };
}

export function FormConfig({ secao, campos, valores, titulo, descricao }: { secao: string; campos: Campo[]; valores: Record<string, unknown>; titulo?: string; descricao?: string }) {
  const [v, setV] = useState(valores);
  const [estado, setEstado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setEstado(null);
    try {
      // Só as chaves deste formulário: outro formulário da mesma seção não é sobrescrito.
      const chaves = [...new Set(campos.map((c) => c.caminho.split(".")[0]))];
      const corpo = Object.fromEntries(chaves.map((k) => [k, v[k]]));
      const salvo = await chamarApi<Record<string, unknown>>(`/api/admin/config/${secao}`, { metodo: "PUT", corpo });
      setV(salvo);
      setEstado({ tipo: "ok", texto: "Salvo." });
    } catch (e) {
      setEstado({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="cartao space-y-4 p-4">
      {titulo && <h2 className="font-medium">{titulo}</h2>}
      {descricao && <p className="-mt-2 text-xs text-slate-500">{descricao}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {campos.map((c) => {
          const valor = ler(v, c.caminho);
          const id = `${secao}-${c.caminho}`;
          const largo = c.tipo === "area" || c.tipo === "lista";
          return (
            <div key={c.caminho} className={largo ? "md:col-span-2" : ""}>
              {c.tipo === "booleano" ? (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!valor} onChange={(e) => setV(escrever(v, c.caminho, e.target.checked))} /> {c.rotulo}
                </label>
              ) : (
                <>
                  <label className="rotulo" htmlFor={id}>{c.rotulo}</label>
                  {c.tipo === "area" ? (
                    <textarea id={id} className="campo font-mono text-xs" rows={8} value={String(valor ?? "")} onChange={(e) => setV(escrever(v, c.caminho, e.target.value))} />
                  ) : c.tipo === "lista" ? (
                    <textarea
                      id={id}
                      className="campo"
                      rows={3}
                      value={Array.isArray(valor) ? valor.join("\n") : ""}
                      onChange={(e) => setV(escrever(v, c.caminho, e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)))}
                    />
                  ) : c.tipo === "opcoes" ? (
                    <select id={id} className="campo" value={String(valor ?? "")} onChange={(e) => setV(escrever(v, c.caminho, e.target.value))}>
                      {c.opcoes?.map(([val, rot]) => (
                        <option key={val} value={val}>{rot}</option>
                      ))}
                    </select>
                  ) : c.tipo === "numero" ? (
                    <input
                      id={id}
                      type="number"
                      className="campo"
                      min={c.min}
                      max={c.max}
                      step={c.passo ?? 1}
                      value={valor == null ? "" : String(valor)}
                      onChange={(e) => setV(escrever(v, c.caminho, e.target.value === "" ? null : Number(e.target.value)))}
                    />
                  ) : (
                    <input id={id} className="campo" value={String(valor ?? "")} onChange={(e) => setV(escrever(v, c.caminho, e.target.value))} />
                  )}
                </>
              )}
              {c.ajuda && <p className="ajuda">{c.ajuda}</p>}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <button className="botao" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        {estado && <span className={estado.tipo === "ok" ? "text-sm text-emerald-700" : "erro"}>{estado.texto}</span>}
      </div>
    </form>
  );
}
