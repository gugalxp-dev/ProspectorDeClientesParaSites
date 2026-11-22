import { redirect } from "next/navigation";
import { LogoMarca, NOME_PLATAFORMA } from "@/components/LogoMarca";
import { FormLogin } from "@/components/FormLogin";
import { usuarioAtual } from "@/lib/auth";

export default async function Entrar({ searchParams }: { searchParams: Promise<{ voltar?: string }> }) {
  const { voltar } = await searchParams;
  // Só caminhos internos: evita redirecionamento aberto para outro site.
  const destino = voltar && voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/";
  if (await usuarioAtual()) redirect(destino);
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <LogoMarca tamanho={64} id="cp-login" />
        <span className="titulo-gradiente text-2xl font-bold tracking-tight">{NOME_PLATAFORMA}</span>
        <span className="-mt-2 text-sm text-slate-500">Prospecção com IA, do primeiro contato ao contrato</span>
      </div>
      <FormLogin destino={destino} />
      <p className="mt-4 text-center text-xs text-slate-500">
        Sem conta? Crie a primeira pelo terminal: <code>npm run usuario -- --email voce@exemplo.com --nome &quot;Seu Nome&quot; --admin</code>
      </p>
    </div>
  );
}
