export type DataClass = "REAL" | "LEGACY" | "DEMO" | "FIXTURE" | "MOCK" | "UNKNOWN";

export const SEED_PROJECT_NAMES = ["Live Ranking #482", "Podcast corte 08", "Review setup", "Final da copa"] as const;

export const SEED_CREDIT_DESCRIPTIONS = ["Créditos Plus", "Análise live ranking", "Transcrição podcast"] as const;

export const SEED_SOCIAL_USERNAMES = ["ana.clips", "anademo"] as const;

type ProjectInput = {
  name: string;
  storageKey?: string | null;
  transcriptProvider?: string | null;
  transcriptSourceHash?: string | null;
  transcriptText?: string | null;
};

type ClipInput = {
  storageKey?: string | null;
  summary?: string | null;
  projectClass: DataClass;
};

type AccountInput = {
  mock: boolean;
  username: string;
  provider: string;
  externalAccountId?: string | null;
};

type PublicationInput = {
  mock: boolean;
  provider?: string | null;
  providerPublicationId?: string | null;
  caption?: string | null;
  clipProjectClass?: DataClass;
};

type CreditInput = {
  type: string;
  amount: number;
  description?: string | null;
  reference?: string | null;
};

type SnapshotInput = {
  rawPayload?: unknown;
  accountMock?: boolean;
};

export function classifyProject(project: ProjectInput): DataClass {
  const hash = project.transcriptSourceHash?.trim() ?? "";
  const provider = project.transcriptProvider?.trim() ?? "";
  const text = project.transcriptText ?? "";
  const hasFile = Boolean(project.storageKey);
  if (hash === "seed") return "DEMO";
  if (SEED_PROJECT_NAMES.includes(project.name as (typeof SEED_PROJECT_NAMES)[number]) && !hasFile) return "DEMO";
  if (provider === "MOCK" && !hasFile) return "DEMO";
  if (/\[MOCK\]/.test(text) && !hasFile) return "DEMO";
  if (hasFile) return "REAL";
  return "UNKNOWN";
}

export function isProductionVisibleProject(project: ProjectInput) {
  return classifyProject(project) !== "DEMO" && classifyProject(project) !== "FIXTURE" && classifyProject(project) !== "MOCK";
}

export function classifyClip(clip: ClipInput): DataClass {
  if (clip.projectClass === "DEMO" || clip.projectClass === "FIXTURE" || clip.projectClass === "MOCK") return clip.projectClass;
  if (clip.storageKey) return "REAL";
  if (clip.projectClass === "REAL") return "REAL";
  if (clip.summary?.includes("mock")) return "DEMO";
  return "UNKNOWN";
}

export function classifySocialAccount(account: AccountInput): DataClass {
  if (account.mock) return "MOCK";
  if (SEED_SOCIAL_USERNAMES.includes(account.username as (typeof SEED_SOCIAL_USERNAMES)[number])) return "DEMO";
  if (account.externalAccountId?.startsWith("demo_")) return "DEMO";
  if (account.provider === "UPLOAD_POST") return "REAL";
  return "UNKNOWN";
}

export function classifyPublication(publication: PublicationInput): DataClass {
  if (publication.mock) return "MOCK";
  if (publication.clipProjectClass === "DEMO" || publication.clipProjectClass === "FIXTURE") return "DEMO";
  if (/^Corte \d+ — gerado no CLIPLAB$/.test(publication.caption ?? "") && !publication.providerPublicationId) {
    return "DEMO";
  }
  if (publication.provider === "UPLOAD_POST" || publication.providerPublicationId) return "REAL";
  return "UNKNOWN";
}

export function classifyCreditTransaction(tx: CreditInput): DataClass {
  const description = tx.description ?? "";
  if (SEED_CREDIT_DESCRIPTIONS.includes(description as (typeof SEED_CREDIT_DESCRIPTIONS)[number]) && !tx.reference) {
    return "DEMO";
  }
  if (tx.reference) return "REAL";
  if (tx.amount < 0) return "UNKNOWN";
  return "UNKNOWN";
}

export function isSeedAnalyticsPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as { source?: unknown; mocked?: unknown };
  return record.mocked === true || record.source === "seed";
}

export function classifyMetricSnapshot(snapshot: SnapshotInput): DataClass {
  if (snapshot.accountMock) return "MOCK";
  if (isSeedAnalyticsPayload(snapshot.rawPayload)) return "DEMO";
  const payload = snapshot.rawPayload as { source?: string } | undefined;
  if (payload?.source === "upload-post") return "REAL";
  return "UNKNOWN";
}

export function isUserVisibleNotification(title: string, body: string) {
  const text = `${title} ${body}`;
  if (/DEMO|\/mock|mock\b|Live Ranking|Podcast corte|Review setup|Final da copa|ana\.clips|anademo/i.test(text)) {
    return false;
  }
  if (/OpenAI|429|quota|faturamento da API|whisper/i.test(text)) return false;
  return true;
}

export function snapshotMetricAvailable(
  rawPayload: unknown,
  key: "views" | "likes" | "comments" | "shares" | "followers",
) {
  if (isSeedAnalyticsPayload(rawPayload)) return false;
  if (!rawPayload || typeof rawPayload !== "object") return false;
  const record = rawPayload as { source?: string; available?: Record<string, boolean> };
  return record.source === "upload-post" && record.available?.[key] === true;
}
