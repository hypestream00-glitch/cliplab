export type MetaDiscoveredPage = {
  id: string;
  name: string;
  picture?: string;
  tasks: string[];
  canCreateContent: boolean;
  pageAccessToken: string;
  instagram?: {
    id: string;
    username: string;
    name: string;
    avatarUrl?: string;
    accountType?: string;
  };
};

export type MetaDiscovery = {
  facebookUserId: string;
  userAccessToken: string;
  userExpiresAt?: string;
  scopes: string[];
  pages: MetaDiscoveredPage[];
};

export type MetaProviderMeta = {
  facebookUserId?: string;
  pageId?: string;
  igUserId?: string;
  tasks?: string[];
  accountType?: string;
  canCreateContent?: boolean;
};

export function mapInstagramContainerStatus(statusCode: string): "QUEUED" | "UPLOADING" | "PROCESSING" | "PUBLISHED" | "FAILED" {
  if (statusCode === "IN_PROGRESS") return "PROCESSING";
  if (statusCode === "FINISHED") return "PROCESSING";
  if (statusCode === "PUBLISHED") return "PUBLISHED";
  if (statusCode === "ERROR" || statusCode === "EXPIRED") return "FAILED";
  return "PROCESSING";
}

export function mapFacebookVideoStatus(status: {
  video_status?: string;
  uploading_phase?: { status?: string };
  processing_phase?: { status?: string; error?: { message?: string } };
  publishing_phase?: { status?: string };
}): { status: "UPLOADING" | "PROCESSING" | "PUBLISHED" | "FAILED"; error?: string } {
  const processingError = status.processing_phase?.error?.message;
  if (processingError) return { status: "FAILED", error: processingError };
  if (status.publishing_phase?.status === "complete") return { status: "PUBLISHED" };
  if (status.uploading_phase?.status === "in_progress") return { status: "UPLOADING" };
  if (status.processing_phase?.status === "in_progress" || status.video_status === "processing") return { status: "PROCESSING" };
  if (status.video_status === "ready" || status.publishing_phase?.status === "complete") return { status: "PUBLISHED" };
  if (status.video_status === "error") return { status: "FAILED" };
  return { status: "PROCESSING" };
}
