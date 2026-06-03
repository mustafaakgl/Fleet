type LogoProps = { className?: string };

function NovaTransLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 160 40" className={className} aria-label="Nova Trans">
      <rect x="0" y="8" width="28" height="24" rx="4" fill="#0066CC" />
      <text x="6" y="24" fill="white" fontSize="11" fontWeight="800" fontFamily="system-ui">
        NT
      </text>
      <text x="36" y="26" fill="#334155" fontSize="14" fontWeight="800" fontFamily="system-ui">
        NOVA TRANS
      </text>
    </svg>
  );
}

function BlueCargoLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 160 40" className={className} aria-label="BlueCargo">
      <circle cx="18" cy="20" r="14" fill="#0ea5e9" />
      <text x="11" y="25" fill="white" fontSize="12" fontWeight="800" fontFamily="system-ui">
        B
      </text>
      <text x="38" y="26" fill="#334155" fontSize="13" fontWeight="700" fontFamily="system-ui">
        BlueCargo
      </text>
    </svg>
  );
}

function RoadlineLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 160 40" className={className} aria-label="Roadline">
      <path d="M4 30 L18 10 L32 30 Z" fill="#f59e0b" />
      <text x="38" y="26" fill="#334155" fontSize="14" fontWeight="800" fontFamily="system-ui">
        ROADLINE
      </text>
    </svg>
  );
}

function UrbanFleetLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 160 40" className={className} aria-label="UrbanFleet">
      <rect x="2" y="12" width="32" height="16" rx="8" fill="#6366f1" />
      <rect x="8" y="16" width="8" height="8" rx="2" fill="white" opacity="0.9" />
      <rect x="20" y="16" width="8" height="8" rx="2" fill="white" opacity="0.9" />
      <text x="40" y="26" fill="#334155" fontSize="12" fontWeight="700" fontFamily="system-ui">
        UrbanFleet
      </text>
    </svg>
  );
}

function VectorLogLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 160 40" className={className} aria-label="Vector Log">
      <path d="M4 30 L16 10 L28 30" fill="none" stroke="#dc2626" strokeWidth="3" />
      <text x="34" y="26" fill="#334155" fontSize="13" fontWeight="800" fontFamily="system-ui">
        VECTOR LOG
      </text>
    </svg>
  );
}

const logos = [
  { id: 'nova', Component: NovaTransLogo },
  { id: 'bluecargo', Component: BlueCargoLogo },
  { id: 'roadline', Component: RoadlineLogo },
  { id: 'urbanfleet', Component: UrbanFleetLogo },
  { id: 'vector', Component: VectorLogLogo },
];

export function CustomerLogos() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {logos.map(({ id, Component }) => (
        <div
          key={id}
          className="flex h-20 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 shadow-sm transition hover:border-slate-300 hover:shadow-md"
        >
          <Component className="h-8 w-full max-w-[130px]" />
        </div>
      ))}
    </div>
  );
}

export function TestimonialAvatar({ name }: { name: string }) {
  const initials = name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2);
  const colors = ['bg-blue-600', 'bg-emerald-600', 'bg-violet-600'];
  const color = colors[name.length % colors.length];

  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white ${color}`}
    >
      {initials}
    </div>
  );
}
