import { describe, expect, it } from "vitest";
import { esquemaDecisao } from "../src/core/agente/agente";

const base = { resposta: "Claro! Posso te mostrar.", objecoes_novas: [], etapa: "descoberta", transferir: false };

describe("leitura da decisão do agente", () => {
  it("aceita acento, maiúscula, espaço e sinônimo na intenção", () => {
    expect(esquemaDecisao.parse({ ...base, intencao: "Dúvida" }).intencao).toBe("duvida");
    expect(esquemaDecisao.parse({ ...base, intencao: "pedido humano" }).intencao).toBe("pedido_humano");
    expect(esquemaDecisao.parse({ ...base, intencao: "confirmação" }).intencao).toBe("interesse");
    expect(esquemaDecisao.parse({ ...base, intencao: "aceitou" }).intencao).toBe("aceite");
  });

  it("valor desconhecido não trava a conversa: vira 'outro'", () => {
    const d = esquemaDecisao.parse({ ...base, intencao: "algo_inventado", etapa: "fase_x", transferir: "talvez" });
    expect(d).toMatchObject({ intencao: "outro", etapa: "descoberta", transferir: false, resposta: "Claro! Posso te mostrar." });
  });
});
