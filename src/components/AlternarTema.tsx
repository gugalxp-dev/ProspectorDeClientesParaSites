"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

/** Alterna claro/escuro. A escolha fica num cookie para o servidor já renderizar no tema certo (sem piscar). */
export function AlternarTema({ inicial }: { inicial: "escuro" | "claro" }) {
  const [tema, setTema] = useState(inicial);
  function alternar() {
    const novo = tema === "escuro" ? "claro" : "escuro";
    document.documentElement.classList.toggle("escuro", novo === "escuro");
    document.cookie = `tema=${novo}; path=/; max-age=31536000; samesite=lax`;
    setTema(novo);
  }
  return (
    <button
      className="rounded-lg p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      onClick={alternar}
      aria-label={tema === "escuro" ? "Usar tema claro" : "Usar tema escuro"}
      title={tema === "escuro" ? "Tema claro" : "Tema escuro"}
    >
      {tema === "escuro" ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
