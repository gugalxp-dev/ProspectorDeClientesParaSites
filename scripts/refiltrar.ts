// Reaplica o filtro (rede/franquia, sem celular/WhatsApp, site bom) nos leads ainda não contatados. Quem não passa é apagado.
// Uso: npm run refiltrar

import "dotenv/config";
import { db } from "../src/core/db";
import { aplicarFiltro } from "../src/core/prospeccao/filtro";

const leads = await db.lead.findMany({ where: { contatoStatus: "sem_autorizacao", conversa: { is: null } }, select: { id: true } });
let descartados = 0;
for (const l of leads) if (await aplicarFiltro(l.id)) descartados++;
console.log(`✓ ${leads.length} leads revisados · ${descartados} apagados · ${leads.length - descartados} continuam`);
await db.$disconnect();
