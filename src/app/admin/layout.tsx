import Link from "next/link";
import { exigirAdmin } from "@/lib/auth";

const ABAS = [
  ["integracoes", "Integrações"],
  ["ia", "IA"],
  ["agente", "Agente"],
  ["conhecimento", "Base de conhecimento"],
  ["comercial", "Serviços e preços"],
  ["prospeccao", "Prospecção"],
  ["whatsapp", "WhatsApp"],
  ["custos", "Gastos"],
  ["crm", "Etapas do CRM"],
  ["usuarios", "Usuários"],
  ["lgpd", "LGPD"],
  ["auditoria", "Auditoria"],
] as const;

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirAdmin();
  return (
    <div className="grid gap-6 md:grid-cols-[200px_1fr]">
      <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Administração">
        {ABAS.map(([href, rotulo]) => (
          <Link key={href} href={`/admin/${href}`} className="whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-superficie hover:text-slate-900">
            {rotulo}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
