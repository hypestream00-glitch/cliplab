import { readFileSync } from "node:fs";
import { liveProcessEnvBag, lookupEnvInBag } from "@/lib/env/server";

function parseProcEnviron(): Record<string, string> {
  if (process.platform === "win32") return {};
  try {
    const raw = readFileSync("/proc/self/environ", "utf8");
    const out: Record<string, string> = {};
    for (const entry of raw.split("\0")) {
      if (!entry) continue;
      const eq = entry.indexOf("=");
      if (eq <= 0) continue;
      out[entry.slice(0, eq)] = entry.slice(eq + 1);
    }
    return out;
  } catch {
    return {};
  }
}

/** Copy Linux process environ into process.env when Next inlined an empty value. Node runtime only. */
export function hydrateProcessEnvFromProc() {
  const proc = parseProcEnviron();
  const live = liveProcessEnvBag();
  for (const [key, value] of Object.entries(proc)) {
    if (!value.trim()) continue;
    const current = live[key];
    if (typeof current !== "string" || !current.trim()) {
      process.env[key] = value;
    }
  }
  return Object.keys(proc).length > 0;
}

export function procLookup(name: string) {
  return lookupEnvInBag(parseProcEnviron(), name);
}
