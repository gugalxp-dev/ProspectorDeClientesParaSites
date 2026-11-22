import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { salvarConfig } from "../src/core/config";
import { garantirEtapas, idEtapa } from "../src/core/crm/etapas";
import { db } from "../src/core/db";
import { contarPendencias } from "../src/core/pendencias";
import { agendarContato, ajustarAoHorario, cancelarAgendamento, dentroDoHorario, proximoHorario } from "../src/core/whatsapp/agendamento";
import { forcarClienteWhatsApp } from "../src/core/whatsapp/cliente";
import { limparBanco, rodarFila } from "./ajuda";

const CFG = { envioIntervaloMinMin: 3, envioIntervaloMaxMin: 8, horaInicio: 9, horaFim: 18, enviarSabado: true, enviarDomingo: false };
const meio = () => 0.5;

describe("horário dos envios", () => {
  it("espaça entre 3 e 8 minutos depois do último envio", () => {
    const ultimo = new Date(2026, 10, 23, 10, 0); // segunda, 10h
    const agora = new Date(2026, 10, 23, 10, 1);
    expect(proximoHorario(CFG, ultimo, agora, () => 0).getTime() - ultimo.getTime()).toBe(3 * 60_000);
    expect(proximoHorario(CFG, ultimo, agora, () => 0.999).getTime() - ultimo.getTime()).toBeCloseTo(8 * 60_000, -3);
  });

  it("fora do horário comercial joga para a próxima janela (e pula domingo)", () => {
    const noite = new Date(2026, 10, 23, 20, 0); // segunda 20h
    const r = ajustarAoHorario(noite, CFG, meio);
    expect([r.getDate(), r.getHours()]).toEqual([24, 9]); // terça 9h
    const madrugada = ajustarAoHorario(new Date(2026, 10, 24, 6, 0), CFG, meio);
    expect([madrugada.getDate(), madrugada.getHours()]).toEqual([24, 9]);
    const sabadoNoite = ajustarAoHorario(new Date(2026, 10, 28, 19, 0), CFG, meio); // sábado 19h
    expect([sabadoNoite.getDay(), sabadoNoite.getHours()]).toEqual([1, 9]); // segunda 9h (domingo desligado)
    expect(dentroDoHorario(new Date(2026, 10, 29, 10, 0), CFG)).toBe(false); // domingo
  });
});

describe("fila de primeiros contatos", () => {
  beforeEach(async () => {
    await limparBanco();
    await garantirEtapas();
    // Janela o dia todo, para o teste não depender da hora em que roda.
    await salvarConfig("whatsapp", { horaInicio: 0, horaFim: 24, enviarSabado: true, enviarDomingo: true, envioIntervaloMinMin: 3, envioIntervaloMaxMin: 8 });
  });
  afterEach(() => forcarClienteWhatsApp(null));

  async function lead(nome: string, tel: string) {
    return db.lead.create({
      data: { nome, nomeNormalizado: nome.toLowerCase(), telefoneE164: tel, ehCelular: true, qualificacaoStatus: "qualificado", etapaId: await idEtapa("qualificado") },
    });
  }

  it("aprovar vários agenda com intervalo; sai da lista de aprovação; o worker envia na hora", async () => {
    const a = await lead("A", "+5513988880001");
    const b = await lead("B", "+5513988880002");
    expect((await contarPendencias()).aprovar).toBe(2);
    const qa = await agendarContato(a.id, "u1");
    const qb = await agendarContato(b.id, "u1");
    const diff = (qb.getTime() - qa.getTime()) / 60_000;
    expect(diff).toBeGreaterThanOrEqual(3);
    expect(diff).toBeLessThanOrEqual(8.01);
    expect((await contarPendencias()).aprovar).toBe(0);
    expect(await agendarContato(a.id, "u1")).toEqual(qa); // aprovar de novo não duplica

    await rodarFila(50, { ignorarAtraso: true });
    expect(await db.mensagem.count({ where: { direcao: "saida", tipo: "template" } })).toBe(2);
  });

  it("cancelar tira da fila e volta para aprovação", async () => {
    const a = await lead("A", "+5513988880001");
    await agendarContato(a.id, "u1");
    expect(await cancelarAgendamento(a.id)).toBe(true);
    expect((await contarPendencias()).aprovar).toBe(1);
    await rodarFila(50, { ignorarAtraso: true });
    expect(await db.mensagem.count()).toBe(0);
  });
});
