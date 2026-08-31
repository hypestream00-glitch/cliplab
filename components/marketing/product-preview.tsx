export function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-xl" aria-hidden="true">
      <div className="rounded-3xl border border-white/10 bg-zinc-950 p-3 shadow-2xl shadow-violet-500/10">
        <div className="mb-3 flex items-center justify-between px-1">
          <div className="h-2 w-16 rounded-full bg-violet-500/80" />
          <div className="h-2 w-10 rounded-full bg-white/10" />
        </div>
        <div className="grid grid-cols-[1.1fr_0.9fr] gap-3">
          <div className="overflow-hidden rounded-2xl bg-zinc-900">
            <div className="relative aspect-[9/16] bg-gradient-to-b from-violet-500/30 via-zinc-900 to-zinc-950">
              <div className="absolute inset-x-4 top-10 rounded-xl border border-white/10 bg-black/40 p-3 backdrop-blur">
                <div className="h-2 w-3/4 rounded bg-white/80" />
                <div className="mt-2 h-2 w-1/2 rounded bg-white/40" />
              </div>
              <div className="absolute right-3 bottom-16 rounded-full border border-violet-400/40 bg-violet-500/20 px-2 py-1 text-[10px] font-semibold text-violet-200">
                92
              </div>
              <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {[88, 76, 71].map((score, index) => (
              <div key={score} className="flex flex-1 items-center gap-2 rounded-xl border border-white/8 bg-zinc-900/80 p-2">
                <div className={`h-12 w-9 rounded-md ${index === 0 ? "bg-violet-500/40" : "bg-white/10"}`} />
                <div className="min-w-0 flex-1">
                  <div className="h-2 w-16 rounded bg-white/30" />
                  <div className="mt-1.5 h-1.5 w-10 rounded bg-white/15" />
                </div>
                <span className="text-[11px] font-semibold text-violet-200">{score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
