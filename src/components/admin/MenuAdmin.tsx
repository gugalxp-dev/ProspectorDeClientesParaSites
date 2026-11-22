"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ABAS = [
  ["integracoes", "Integrações"],
  ["ia", "IA"],
  ["agente", "Agente"],
  ["conhecimento", "Base de conhecimento"],
  ["comercial", "Serviços e preços"],
  ["contrato", "Contrato"],
  ["prospeccao", "Prospecção"],
  ["whatsapp", "WhatsApp"],
  ["custos", "Gastos"],
  ["crm", "Etapas do CRM"],
  ["usuarios", "Usuários"],
  ["lgpd", "LGPD"],
  ["auditoria", "Auditoria"],
] as const;

/** Menu lateral do admin, com a página aberta destacada (vale também para subpáginas). */
export function MenuAdmin() {
  const caminho = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Administração">
      {ABAS.map(([href, rotulo]) => {
        const url = `/admin/${href}`;
        const ativa = caminho === url || caminho.startsWith(`${url}/`);
        return (
          <Link
            key={href}
            href={url}
            aria-current={ativa ? "page" : undefined}
            className={`whitespace-nowrap rounded-md border-l-2 px-3 py-1.5 text-sm transition ${
              ativa ? "border-marca-600 bg-superficie font-semibold text-marca-700 shadow-sm" : "border-transparent text-slate-600 hover:bg-superficie hover:text-slate-900"
            }`}
          >
            {rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
