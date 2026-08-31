export function isDevMockMode() {
  return process.env.NODE_ENV !== "production";
}

export const CLIP_DURATION_PRESETS = {
  "15-30": { min: 15, max: 30 },
  "30-60": { min: 30, max: 60 },
  "60-90": { min: 60, max: 90 },
  "90+": { min: 60, max: 90 },
} as const;

export const NAV_PATHS = {
  studio: "/studio",
  create: "/studio/create",
  projects: "/studio/projects",
  clips: "/studio/clips",
  editor: "/studio/editor",
  templates: "/studio/templates",
  publishing: "/studio/publishing",
  calendar: "/studio/publishing/calendar",
  queue: "/studio/publishing/queue",
  accounts: "/studio/accounts",
  metrics: "/studio/metrics",
  live: "/studio/live",
  championships: "/studio/championships",
  team: "/studio/team",
  api: "/studio/api",
  settings: "/studio/settings",
} as const;
