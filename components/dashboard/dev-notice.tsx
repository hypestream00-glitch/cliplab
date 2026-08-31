export function DevNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-5 text-amber-200">
      {children}
    </p>
  );
}
