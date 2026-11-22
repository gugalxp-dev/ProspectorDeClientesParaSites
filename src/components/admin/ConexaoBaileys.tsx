"use client";

import { useEffect, useState } from "react";
import { chamarApi } from "../api";

interface Estado {
  conectado: boolean;
  qr: string | null;
  numero: string | null;
  detalhe: string;
}

/** QR code e estado da conexão Baileys; atualiza sozinho a cada 3 s. */
export function ConexaoBaileys() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const atualizar = () =>
      chamarApi<Estado>("/api/admin/whatsapp/baileys")
        .then((e) => ativo && (setEstado(e), setErro(null)))
        .catch((e) => ativo && setErro((e as Error).message));
    void atualizar();
    const t = setInterval(atualizar, 3000);
    return () => {
      ativo = false;
      clearInterval(t);
    };
  }, []);

  async function desconectar() {
    try {
      await chamarApi("/api/admin/whatsapp/baileys", { metodo: "POST", corpo: {} });
      setEstado((e) => e && { ...e, conectado: false, detalhe: "Desconectando..." });
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  if (!estado) return <p className="text-xs text-slate-500">{erro ?? "Consultando conexão..."}</p>;
  return (
    <div className="space-y-2">
      <p className={estado.conectado ? "text-emerald-700" : "text-amber-700"}>{estado.detalhe}</p>
      {estado.qr && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={estado.qr} alt="QR code para conectar o WhatsApp" width={280} height={280} className="rounded border border-slate-200" />
      )}
      {estado.conectado && (
        <button className="botao-perigo" onClick={desconectar}>Desconectar número</button>
      )}
      {erro && <p className="text-xs text-rose-700">{erro}</p>}
    </div>
  );
}
