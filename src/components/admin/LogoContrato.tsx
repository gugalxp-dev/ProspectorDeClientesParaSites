"use client";

// Logo da empresa no cabeçalho do contrato. Fica guardada embutida (data URL) na configuração,
// para abrir na página do cliente sem login. Imagens grandes são reduzidas no navegador antes de enviar.

import { useState } from "react";
import { ImageUp, Trash2 } from "lucide-react";
import { chamarApi } from "../api";

const LIMITE = 300_000; // caracteres do data URL (~220 KB de imagem)

function lerArquivo(f: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => erro(new Error("Não foi possível ler o arquivo."));
    r.readAsDataURL(f);
  });
}

/** Reduz para no máximo 512 px (mantém proporção e transparência). */
function reduzir(dataUrl: string): Promise<string> {
  return new Promise((ok, erro) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, 512 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * escala);
      c.height = Math.round(img.height * escala);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      ok(c.toDataURL("image/png"));
    };
    img.onerror = () => erro(new Error("Imagem inválida."));
    img.src = dataUrl;
  });
}

export function LogoContrato({ inicial }: { inicial: string }) {
  const [logo, setLogo] = useState(inicial);
  const [estado, setEstado] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function salvar(valor: string) {
    setOcupado(true);
    setEstado(null);
    try {
      await chamarApi("/api/admin/config/contrato", { metodo: "PUT", corpo: { logo: valor } });
      setLogo(valor);
      setEstado({ tipo: "ok", texto: valor ? "Logo salva." : "Logo removida." });
    } catch (e) {
      setEstado({ tipo: "erro", texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  async function escolher(f: File | undefined) {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(f.type)) {
      setEstado({ tipo: "erro", texto: "Envie PNG, JPG, WEBP ou SVG." });
      return;
    }
    try {
      let url = await lerArquivo(f);
      if (url.length > LIMITE && f.type !== "image/svg+xml") url = await reduzir(url);
      if (url.length > LIMITE) throw new Error("Imagem grande demais. Use uma versão menor (até ~200 KB).");
      await salvar(url);
    } catch (e) {
      setEstado({ tipo: "erro", texto: (e as Error).message });
    }
  }

  return (
    <section className="cartao space-y-3 p-4 text-sm">
      <h2 className="font-medium">Logo da empresa</h2>
      <p className="text-xs text-slate-500">Aparece no cabeçalho do contrato (prévia e página do cliente). PNG, JPG, WEBP ou SVG; de preferência quadrada.</p>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-20 items-center justify-center rounded-xl bg-[#ffffff] ring-1 ring-black/10">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Logo atual" className="size-16 object-contain" />
          ) : (
            <span className="text-xs text-[#9ca3af]">sem logo</span>
          )}
        </div>
        <label className={`botao cursor-pointer ${ocupado ? "pointer-events-none opacity-60" : ""}`}>
          <ImageUp className="size-4" /> {logo ? "Trocar logo" : "Enviar logo"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => escolher(e.target.files?.[0])} />
        </label>
        {logo && (
          <button className="botao-perigo" disabled={ocupado} onClick={() => salvar("")}>
            <Trash2 className="size-4" /> Remover
          </button>
        )}
      </div>
      {estado && <p className={estado.tipo === "ok" ? "text-xs text-emerald-700" : "erro"}>{estado.texto}</p>}
    </section>
  );
}
