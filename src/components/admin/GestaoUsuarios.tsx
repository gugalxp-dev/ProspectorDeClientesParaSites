"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { chamarApi } from "../api";
import { dataHora } from "../ui";

interface U {
  id: string;
  nome: string;
  email: string;
  papel: string;
  bloqueado: boolean;
  ultimoAcesso: string | null;
}

export function GestaoUsuarios({ usuarios, euId }: { usuarios: U[]; euId: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);

  async function rodar(fn: () => Promise<unknown>) {
    setErro(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setErro((e as Error).message);
      return false;
    }
  }

  return (
    <div className="space-y-3">
      <div className="cartao overflow-x-auto">
        <table className="tabela">
          <thead>
            <tr><th>Nome</th><th>E-mail</th><th>Papel</th><th>Último acesso</th><th /></tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={u.bloqueado ? "opacity-50" : ""}>
                <td>{u.nome}{u.id === euId && <span className="ml-1 text-xs text-slate-400">(você)</span>}</td>
                <td>{u.email}</td>
                <td>
                  <select className="campo w-32" value={u.papel} disabled={u.id === euId} onChange={(e) => rodar(() => chamarApi(`/api/admin/usuarios/${u.id}`, { metodo: "PATCH", corpo: { papel: e.target.value } }))} aria-label="Papel">
                    <option value="admin">admin</option>
                    <option value="operador">operador</option>
                  </select>
                </td>
                <td className="text-xs">{dataHora(u.ultimoAcesso)}</td>
                <td>
                  {u.id !== euId && (
                    <button className={u.bloqueado ? "botao-sec" : "botao-perigo"} onClick={() => rodar(() => chamarApi(`/api/admin/usuarios/${u.id}`, { metodo: "PATCH", corpo: { bloqueado: !u.bloqueado } }))}>
                      {u.bloqueado ? "Desbloquear" : "Bloquear"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erro && <p className="erro">{erro}</p>}
      {!novo ? (
        <button className="botao" onClick={() => setNovo(true)}>Novo usuário</button>
      ) : (
        <form
          className="cartao grid gap-3 p-4 md:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const ok = await rodar(() => chamarApi("/api/admin/usuarios", { corpo: { nome: f.get("nome"), email: f.get("email"), papel: f.get("papel"), senha: f.get("senha") }, idempotente: true }));
            if (ok) setNovo(false);
          }}
        >
          <input name="nome" required className="campo" placeholder="Nome" aria-label="Nome" />
          <input name="email" type="email" required className="campo" placeholder="E-mail" aria-label="E-mail" />
          <select name="papel" className="campo" defaultValue="operador" aria-label="Papel">
            <option value="operador">Operador</option>
            <option value="admin">Admin</option>
          </select>
          <input name="senha" type="password" required minLength={12} autoComplete="new-password" className="campo" placeholder="Senha inicial (mín. 12, letras e números)" aria-label="Senha" />
          <div className="flex gap-2 md:col-span-2">
            <button className="botao">Criar</button>
            <button type="button" className="botao-sec" onClick={() => setNovo(false)}>Cancelar</button>
          </div>
        </form>
      )}
    </div>
  );
}
