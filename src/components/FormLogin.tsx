"use client";

import { useState } from "react";
import { chamarApi } from "./api";

export function FormLogin({ destino }: { destino: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErro(null);
    setEnviando(true);
    try {
      await chamarApi("/api/auth/login", { corpo: { email: f.get("email"), senha: f.get("senha") } });
      window.location.href = destino;
    } catch (e) {
      setErro((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="cartao space-y-4 p-6">
      <div>
        <label className="rotulo" htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="campo" />
      </div>
      <div>
        <label className="rotulo" htmlFor="senha">Senha</label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required className="campo" />
      </div>
      {erro && <p className="erro" role="alert">{erro}</p>}
      <button className="botao w-full" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
    </form>
  );
}
