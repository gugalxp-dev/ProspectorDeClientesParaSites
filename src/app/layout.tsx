import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AlternarTema } from "@/components/AlternarTema";
import { LogoMarca, NOME_PLATAFORMA } from "@/components/LogoMarca";
import { IndicadorConexao } from "@/components/AoVivo";
import { MenuUsuario, Notificacoes } from "@/components/Cabecalho";
import { contarPendencias } from "@/core/pendencias";
import { usuarioAtual } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Client Prospector",
  description: "Prospecção comercial B2B com IA, CRM e agente comercial via WhatsApp",
};

export default async function Layout({ children }: { children: React.ReactNode }) {
  const u = await usuarioAtual();
  const tema = (await cookies()).get("tema")?.value === "claro" ? "claro" : "escuro";
  const pendencias = u ? (await contarPendencias().catch(() => null))?.total ?? 0 : 0;
  const nav: Array<{ href: string; rotulo: string; contador?: number }> = [
    { href: "/", rotulo: "Dashboard" },
    { href: "/pendencias", rotulo: "Pendências", contador: pendencias },
    { href: "/pesquisas", rotulo: "Pesquisas" },
    { href: "/crm", rotulo: "CRM" },
    ...(u?.papel === "admin" ? [{ href: "/admin/custos", rotulo: "Gastos" }, { href: "/admin", rotulo: "Admin" }] : []),
  ];
  return (
    // suppressHydrationWarning: extensões do navegador (ColorZilla, gerenciadores de senha...) colocam atributos
    // no <html>/<body> antes do React carregar. Isso não é erro do sistema; só no html/body (não vale para os filhos).
    <html lang="pt-BR" className={tema === "escuro" ? "escuro" : undefined} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {u && (
          <header className="sticky top-0 z-20 print:hidden border-b border-slate-200 bg-superficie/70 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3 sm:gap-6">
              <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900" aria-label="Início">
                <LogoMarca tamanho={32} id="cp-topo" />
                <span className="titulo-gradiente hidden font-bold tracking-tight lg:inline">{NOME_PLATAFORMA}</span>
              </Link>
              <nav className="flex gap-1 overflow-x-auto text-sm">
                {nav.map((n) => (
                  <Link key={n.href} href={n.href} className="whitespace-nowrap rounded-lg px-2 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 sm:px-3">
                    {n.rotulo}
                    {!!n.contador && <span className="ml-1.5 rounded-full bg-pink-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">{n.contador}</span>}
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
