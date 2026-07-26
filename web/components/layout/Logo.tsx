/**
 * Marca do ERP — "BarberPro" (fonte Rye).
 * Ícone: TESOURA + PENTE + NAVALHA (composição original, line-art dourado).
 *  - LogoMark: só o ícone (rail / favicon).
 *  - Logo: ícone + wordmark inline (sidebar).
 *  - LogoStacked: ícone acima do nome (login), estilo placa de barbearia.
 */

/** Trio de barbearia: pente (esq.), tesoura (centro), navalha (dir.). */
function BarberTrio({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={(size * 60) / 66}
      viewBox="0 0 66 60"
      fill="none"
      stroke="var(--primary)"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* PENTE — esquerda, levemente inclinado */}
      <g transform="rotate(-18 20 40)">
        <path d="M6 38 H34" strokeWidth="4" />
        <g strokeWidth="2.4">
          <path d="M9 39 V48" />
          <path d="M13 39 V48" />
          <path d="M17 39 V48" />
          <path d="M21 39 V48" />
          <path d="M25 39 V48" />
          <path d="M29 39 V48" />
          <path d="M33 39 V47" />
        </g>
      </g>

      {/* TESOURA — centro, aberta apontando para cima */}
      <g strokeWidth="3">
        <circle cx="28" cy="52" r="4.2" />
        <circle cx="40" cy="52" r="4.2" />
        <path d="M30.5 48.5 L42 16" />
        <path d="M37.5 48.5 L26 16" />
      </g>
      <circle cx="34" cy="40.5" r="1.5" fill="var(--primary)" stroke="none" />

      {/* NAVALHA — direita, aberta */}
      <g strokeWidth="3.6">
        <path d="M56 44 L52 18" />
        <path d="M52 18 L55.5 20.5" />
        <path d="M56 44 L64 51" />
      </g>
      <circle cx="56" cy="44" r="1.5" fill="var(--primary)" stroke="none" />
    </svg>
  );
}

export function LogoMark({ size = 34 }: { size?: number }) {
  return <BarberTrio size={size} />;
}

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-brand leading-none tracking-tight ${className}`}>
      <span className="text-gradient-gold">Barber</span>
      <span className="text-foreground">Pro</span>
    </span>
  );
}

/** Lockup horizontal (sidebar). */
export function Logo({
  collapsed,
  size = 40,
}: {
  collapsed?: boolean;
  size?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <BarberTrio size={size} />
      {!collapsed && <Wordmark className="text-xl" />}
    </div>
  );
}

/** Lockup vertical (login) — ícone acima do nome, estilo placa. */
export function LogoStacked() {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <BarberTrio size={72} />
      <Wordmark className="text-4xl text-distress" />
    </div>
  );
}
