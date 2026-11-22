// Logo do Client Prospector: um "C" que captura um ponto (o cliente sendo prospectado).
// SVG inline: nítido em qualquer tamanho e sem arquivo extra. Mesmo desenho de src/app/icon.svg.

export const NOME_PLATAFORMA = "Client Prospector";

export function LogoMarca({ tamanho = 32, id = "cp", className = "" }: { tamanho?: number; id?: string; className?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 64 64" role="img" aria-label={NOME_PLATAFORMA} className={`shrink-0 drop-shadow-[0_6px_16px_rgba(147,51,234,0.35)] ${className}`}>
      <defs>
        <linearGradient id={`${id}-fundo`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f46e5" />
          <stop offset="0.55" stopColor="#9333ea" />
          <stop offset="1" stopColor="#ec4899" />
        </linearGradient>
        <radialGradient id={`${id}-brilho`} cx="0.25" cy="0.15" r="0.9">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="0.6" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${id}-fundo)`} />
      <rect width="64" height="64" rx="16" fill={`url(#${id}-brilho)`} />
      <path d="M43.5 21.4 A15.5 15.5 0 1 0 43.5 42.6" fill="none" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
      <circle cx="45.5" cy="32" r="4.6" fill="#ffffff" />
    </svg>
  );
}
