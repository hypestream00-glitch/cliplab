export type SocialBackend = "upload-post" | "native" | "mock";

export function socialBackend(): SocialBackend {
  const value = (process.env.SOCIAL_PROVIDER ?? "upload-post").trim().toLowerCase();
  if (value === "native") return "native";
  if (value === "mock") return "mock";
  return "upload-post";
}

export function isUploadPostPrimary() {
  return socialBackend() === "upload-post";
}

export function isNativeSocialPrimary() {
  return socialBackend() === "native";
}
