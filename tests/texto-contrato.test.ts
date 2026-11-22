import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { blocosDoContrato, TextoContrato } from "../src/components/TextoContrato";

describe("formatação do contrato", () => {
  it("entende títulos, listas e negrito em markdown", () => {
    const texto = "# CONTRATO\n## CLÁUSULA 1\nIntro: **O que está incluído**\n\n- **Estudo:** análise do segmento\n- **Identidade visual:** cores\n1. primeiro\n2. segundo";
    expect(blocosDoContrato(texto).map((b) => b.tipo)).toEqual(["h1", "h2", "p", "ul", "ol"]);
    const html = renderToStaticMarkup(TextoContrato({ texto }));
    expect(html).toContain("<strong");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).not.toContain("**");
    expect(html).not.toMatch(/>- /);
  });

  it("não deixa HTML do texto virar HTML de verdade", () => {
    const html = renderToStaticMarkup(TextoContrato({ texto: "<script>alert(1)</script> **ok**" }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
