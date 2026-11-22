// Logo do Client Prospector: um radar achando um cliente (encontrar empresas para prospectar),
// nas cores da plataforma (roxo, magenta e rosa sobre o fundo escuro do painel).
// SVG inline: nítido em qualquer tamanho e sem arquivo extra. Mesmo desenho de src/app/icon.svg.

export const NOME_PLATAFORMA = "Client Prospector";

export function LogoMarca({ tamanho = 32, id = "cp", className = "" }: { tamanho?: number; id?: string; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" role="img" aria-label={NOME_PLATAFORMA} className={`shrink-0 drop-shadow-[0_6px_16px_rgba(192,38,211,0.35)] ${className}`}>
      <defs>
        <linearGradient id={`${id}-fundo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1a1440" />
          <stop offset="1" stopColor="#0b0d1c" />
        </linearGradient>
        <radialGradient id={`${id}-varredura`} cx="32" cy="32" r="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#c026d3" stopOpacity="0.75" />
          <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-ponteiro`} x1="32" y1="32" x2="51" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#a78bfa" />
          <stop offset="1" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}-fundo)`} />
      <circle cx="32" cy="32" r="22" fill="none" stroke="#8b5cf6" strokeOpacity="0.35" strokeWidth="1.6" />
      <circle cx="32" cy="32" r="14" fill="none" stroke="#a78bfa" strokeOpacity="0.5" strokeWidth="1.6" />
      <path d="M32 32 L32 10 A22 22 0 0 1 51.05 21 Z" fill={`url(#${id}-varredura)`} />
      <line x1="32" y1="32" x2="51.05" y2="21" stroke={`url(#${id}-ponteiro)`} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="44" cy="19" r="4.2" fill="#f9a8d4" />
      <circle cx="44" cy="19" r="7.5" fill="none" stroke="#f472b6" strokeOpacity="0.55" strokeWidth="1.5" />
      <circle cx="32" cy="32" r="2.6" fill="#f5f3ff" />
    </svg>
  );
}
