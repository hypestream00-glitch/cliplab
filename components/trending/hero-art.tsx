export function TrendingHeroArt() {
  return (
    <div className="relative hidden h-28 w-36 shrink-0 md:block" aria-hidden>
      <span className="absolute inset-0 rounded-full bg-magenta/30 blur-3xl" />
      <span className="absolute inset-4 rounded-full bg-purple/25 blur-2xl" />
      <svg viewBox="0 0 144 112" className="relative h-full w-full">
        <defs>
          <linearGradient id="trend-line" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#e92acb" />
            <stop offset="55%" stopColor="#8b3dff" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        <polyline
          fill="none"
          stroke="url(#trend-line)"
          strokeWidth="4"
          strokeLinecap="round"
          points="12,88 36,70 52,74 76,40 96,48 128,18"
        />
        <circle cx="128" cy="18" r="7" fill="#e92acb" />
        <rect x="18" y="78" width="10" height="18" rx="3" fill="#8b3dff" opacity="0.7" />
        <rect x="34" y="64" width="10" height="32" rx="3" fill="#e92acb" opacity="0.75" />
        <rect x="50" y="70" width="10" height="26" rx="3" fill="#2563eb" opacity="0.7" />
        <rect x="66" y="42" width="10" height="54" rx="3" fill="#8b3dff" opacity="0.85" />
      </svg>
    </div>
  );
}
