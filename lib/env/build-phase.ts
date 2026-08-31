/** True while Next.js is compiling, not while serving requests. */
export function isNextBuildPhase() {
  const phase = process.env.NEXT_PHASE;
  return phase === "phase-production-build" || phase === "phase-development-build";
}
