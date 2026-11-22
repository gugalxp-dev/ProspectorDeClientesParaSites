import { describe, expect, it } from "vitest";
import { telefoneFmt } from "../src/components/ui";

describe("telefone no painel", () => {
  it("padroniza todos os formatos que chegam das fontes", () => {
    for (const bruto of ["+55 13 99636-6934", "+5513996366934", "(13) 99636-6934", "13996366934", "013 99636 6934", "5513996366934"]) {
      expect(telefoneFmt(bruto)).toBe("(13) 99636-6934");
    }
    expect(telefoneFmt("(13) 3304-5232")).toBe("(13) 3304-5232"); // fixo
    expect(telefoneFmt(null, "+5513991630136")).toBe("(13) 99163-0136"); // usa o primeiro que der
    expect(telefoneFmt("0800 123 4567")).toBe("0800 123 4567"); // especial: mostra como veio
    expect(telefoneFmt(null, undefined)).toBeNull();
  });
});
