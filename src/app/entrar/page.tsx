import { redirect } from "next/navigation";
import { Target } from "lucide-react";
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
        <span className="flex size-14 items-center justify-center rounded-2xl bg-linear-to-br from-violet-600 via-fuchsia-600 to-pink-500 shadow-xl shadow-fuchsia-600/30">
          <Target className="size-7 text-white" />
        </span>
        <span className="titulo-gradiente text-xl font-bold">ProspectorDeClientesParaSites</span>
      </div>
      <FormLogin destino={destino} />
      <p className="mt-4 text-center text-xs text-slate-500">
        Sem conta? Crie a primeira pelo terminal: <code>npm run usuario -- --email voce@exemplo.com --nome &quot;Seu Nome&quot; --admin</code>
      </p>
    </div>
  );
}
