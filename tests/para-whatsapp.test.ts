import { describe, expect, it } from "vitest";
import { paraWhatsApp } from "../src/core/agente/regras";

describe("formatação para o WhatsApp", () => {
  it("troca **negrito** e títulos por *negrito* do WhatsApp", () => {
    expect(paraWhatsApp("1. **Briefing:** conversamos\n2. __Layout__: design")).toBe("1. *Briefing:* conversamos\n2. *Layout*: design");
    expect(paraWhatsApp("## Como funciona\nTexto")).toBe("*Como funciona*\nTexto");
    expect(paraWhatsApp("Já está *certo* e R$ 750,00")).toBe("Já está *certo* e R$ 750,00");
  });
});
