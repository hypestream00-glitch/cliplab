export function CreateHeroArt() {
  return (
    <div className="relative hidden h-32 w-36 shrink-0 sm:block" aria-hidden>
      <span className="absolute inset-0 rounded-full bg-magenta/25 blur-2xl" />
      <span className="absolute inset-3 rounded-full bg-purple/20 blur-xl" />
      <svg viewBox="0 0 112 96" className="relative h-full w-full">
        <defs>
          <linearGradient id="clap-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#e92acb" />
            <stop offset="55%" stopColor="#8b3dff" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        <rect x="22" y="38" width="68" height="42" rx="10" fill="#0c0c12" stroke="url(#clap-grad)" strokeWidth="2.5" />
        <rect x="18" y="22" width="76" height="18" rx="6" fill="#12121a" stroke="url(#clap-grad)" strokeWidth="2" transform="rotate(-8 56 31)" />
        <rect x="28" y="26" width="8" height="10" rx="1" fill="#e92acb" transform="rotate(-8 32 31)" />
        <rect x="42" y="24" width="8" height="10" rx="1" fill="#8b3dff" transform="rotate(-8 46 29)" />
        <rect x="56" y="22" width="8" height="10" rx="1" fill="#2563eb" transform="rotate(-8 60 27)" />
        <circle cx="56" cy="60" r="12" fill="url(#clap-grad)" />
        <polygon points="52,54 52,66 64,60" fill="#ffffff" />
      </svg>
    </div>
  );
}
