import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Target } from "lucide-react";
import { AlternarTema } from "@/components/AlternarTema";
import { IndicadorConexao } from "@/components/AoVivo";
import { MenuUsuario, Notificacoes } from "@/components/Cabecalho";
import { usuarioAtual } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "ProspectorDeClientesParaSites",
  description: "Prospecção comercial B2B com IA, CRM e agente comercial via WhatsApp",
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const u = await usuarioAtual();
  const tema = (await cookies()).get("tema")?.value === "claro" ? "claro" : "escuro";
  const nav = [
    { href: "/", rotulo: "Dashboard" },
    { href: "/pesquisas", rotulo: "Pesquisas" },
    { href: "/crm", rotulo: "CRM" },
    ...(u?.papel === "admin" ? [{ href: "/admin/custos", rotulo: "Gastos" }, { href: "/admin", rotulo: "Admin" }] : []),
  ];
  return (
    <html lang="pt-BR" className={tema === "escuro" ? "escuro" : undefined}>
      <body>
        {u && (
          <header className="sticky top-0 z-20 border-b border-slate-200 bg-superficie/70 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:gap-6">
              <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900" aria-label="Início">
                <span className="flex size-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-600 via-fuchsia-600 to-pink-500 shadow-lg shadow-fuchsia-600/30">
                  <Target className="size-4.5 text-white" />
                </span>
                <span className="titulo-gradiente hidden font-bold lg:inline">ProspectorDeClientesParaSites</span>
              </Link>
              <nav className="flex gap-1 overflow-x-auto text-sm">
                {nav.map((n) => (
                  <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-2 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:px-3">
                    {n.rotulo}
                  </Link>
                ))}
              </nav>
              <div className="ml-auto flex items-center gap-3">
                <IndicadorConexao />
                <AlternarTema inicial={tema} />
                <Notificacoes />
                <MenuUsuario nome={u.nome} papel={u.papel} />
              </div>
            </div>
          </header>
        )}
        <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
