export const PLAN_CODES = ["FREE", "BASIC", "PLUS", "CREATOR", "PRO", "BUSINESS"] as const;
export const PRODUCT_PLAN_CODES = ["FREE", "CREATOR", "PRO"] as const;

export type PlanCode = (typeof PLAN_CODES)[number];
export type ProductPlanCode = (typeof PRODUCT_PLAN_CODES)[number];

export type PlanLimits = {
  code: PlanCode;
  name: string;
  credits: number;
  monthlyMinutes: number;
  maxVideoDurationSeconds: number;
  maxClipsPerProject: number;
  maxConcurrentGeneration: number;
  maxConcurrentExports: number;
  maxStorageBytes: number;
  maxFileSizeBytes: number;
  maxAccounts: number;
  analyticsRetentionDays: number;
  teamMembers: number;
  apiAccess: boolean;
  liveClipping: boolean;
  championships: boolean;
  priority: boolean;
  maxResolution: "720p" | "1080p" | "4k";
};

const FREE_LIMITS: PlanLimits = {
  code: "FREE",
  name: "Free",
  credits: 0,
  monthlyMinutes: 60,
  maxVideoDurationSeconds: 60 * 60,
  maxClipsPerProject: 5,
  maxConcurrentGeneration: 1,
  maxConcurrentExports: 1,
  maxStorageBytes: 2 * 1024 * 1024 * 1024,
  maxFileSizeBytes: 500 * 1024 * 1024,
  maxAccounts: 1,
  analyticsRetentionDays: 7,
  teamMembers: 1,
  apiAccess: false,
  liveClipping: false,
  championships: false,
  priority: false,
  maxResolution: "720p",
};

const CREATOR_LIMITS: PlanLimits = {
  code: "CREATOR",
  name: "Creator",
  credits: 0,
  monthlyMinutes: 600,
  maxVideoDurationSeconds: 3 * 60 * 60,
  maxClipsPerProject: 20,
  maxConcurrentGeneration: 4,
  maxConcurrentExports: 4,
  maxStorageBytes: 100 * 1024 * 1024 * 1024,
  maxFileSizeBytes: 5 * 1024 * 1024 * 1024,
  maxAccounts: 5,
  analyticsRetentionDays: 90,
  teamMembers: 3,
  apiAccess: false,
  liveClipping: false,
  championships: true,
  priority: false,
  maxResolution: "1080p",
};

const PRO_LIMITS: PlanLimits = {
  code: "PRO",
  name: "Pro",
  credits: 0,
  monthlyMinutes: 1800,
  maxVideoDurationSeconds: 6 * 60 * 60,
  maxClipsPerProject: 40,
  maxConcurrentGeneration: 8,
  maxConcurrentExports: 8,
  maxStorageBytes: 500 * 1024 * 1024 * 1024,
  maxFileSizeBytes: 10 * 1024 * 1024 * 1024,
  maxAccounts: 15,
  analyticsRetentionDays: 180,
  teamMembers: 8,
  apiAccess: true,
  liveClipping: true,
  championships: true,
  priority: true,
  maxResolution: "1080p",
};

export const PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  FREE: FREE_LIMITS,
  BASIC: { ...CREATOR_LIMITS, code: "BASIC", name: "Creator" },
  PLUS: { ...CREATOR_LIMITS, code: "PLUS", name: "Creator" },
  CREATOR: CREATOR_LIMITS,
  PRO: PRO_LIMITS,
  BUSINESS: { ...PRO_LIMITS, code: "BUSINESS", name: "Pro" },
};

export type FeatureKey = keyof Omit<PlanLimits, "code" | "name">;

export function productPlanCode(code: string): ProductPlanCode {
  if (code === "PRO" || code === "BUSINESS") return "PRO";
  if (code === "FREE") return "FREE";
  return "CREATOR";
}

export function getPlanLimits(code: string): PlanLimits {
  const product = productPlanCode(code);
  return PLAN_LIMITS[product];
}

export function productPlanName(code: string) {
  return getPlanLimits(code).name;
}

export function clampExportResolution(planCode: string, requested: "720p" | "1080p"): "720p" | "1080p" {
  if (getPlanLimits(planCode).maxResolution === "720p") return "720p";
  return requested;
}

export function clampClipCount(planCode: string, requested: number) {
  const max = getPlanLimits(planCode).maxClipsPerProject;
  return Math.min(Math.max(1, requested), max);
}

export const PLAN_PRICING = {
  FREE: { monthlyLabel: "Grátis", cta: "Começar" },
  CREATOR: { monthlyLabel: "R$ 59,90", cta: "Fazer upgrade" },
  PRO: { monthlyLabel: "R$ 149,90", cta: "Fazer upgrade" },
} as const;
