// Imagem do cartão do link (WhatsApp, e-mail, redes): logo, marca, serviço, valor e chamada para ação.
// Gerada na hora a partir do contrato. Cores da sua marca (preto, verde-limão e creme da TechNino).

import { ImageResponse } from "next/og";
import { dadosContratoPublico } from "./dados";

export const alt = "Contrato de prestação de serviços";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FUNDO = "#0a0a0b";
const DESTAQUE = "#d4ff3a";
const CLARO = "#f2efe9";
const APAGADO = "#9a9a92";

export default async function Imagem({ params }: { params: Promise<{ token: string }> }) {
  const p = await dadosContratoPublico((await params).token);
  const aceito = p?.c.status === "aceito";
  const cancelado = p?.c.status === "cancelado";

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: FUNDO, color: CLARO, padding: "64px 72px", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {p?.cfg.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.cfg.logo} width={96} height={96} style={{ borderRadius: 22 }} alt="" />
          ) : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 44, fontWeight: 700 }}>{p?.marca ?? "Contrato"}</div>
            <div style={{ fontSize: 26, color: APAGADO, letterSpacing: 2, textTransform: "uppercase" }}>Contrato de prestação de serviços</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", marginTop: 64, flexGrow: 1 }}>
          <div style={{ fontSize: 30, color: APAGADO }}>{p ? `Para ${p.dados.contratanteNome}` : ""}</div>
          <div style={{ fontSize: 60, fontWeight: 700, marginTop: 8, lineHeight: 1.1 }}>{p?.dados.servico ?? "Contrato"}</div>
          {p && !cancelado ? (
            <div style={{ display: "flex", alignItems: "baseline", gap: 24, marginTop: 24 }}>
              <div style={{ fontSize: 72, fontWeight: 800, color: DESTAQUE }}>{p.valor}</div>
              <div style={{ fontSize: 30, color: APAGADO }}>{`entrega em até ${p.dados.prazoDias} dias`}</div>
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              fontSize: 32,
              fontWeight: 700,
              padding: "18px 36px",
              borderRadius: 999,
              background: cancelado ? "#3f3f46" : DESTAQUE,
              color: cancelado ? CLARO : FUNDO,
            }}
          >
            {cancelado ? "Contrato cancelado" : aceito ? "✓ Contrato aceito" : "Toque para ler e aceitar"}
          </div>
          <div style={{ fontSize: 28, color: APAGADO }}>{p ? `Nº ${p.c.numero}` : ""}</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
