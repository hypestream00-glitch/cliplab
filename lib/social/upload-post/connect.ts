import { publicBaseUrl } from "@/lib/env/app-url";
import { ensureUploadPostProfile } from "@/lib/social/upload-post/profiles";
import { uploadPostJson } from "@/lib/social/upload-post/http";
import { recordSocialUsage } from "@/lib/social/upload-post/usage";

type JwtResponse = {
  success?: boolean;
  access_url?: string;
  duration?: string;
};

const ALLOWED_CONNECT_HOSTS = new Set(["app.upload-post.com"]);

export function uploadPostAccountsRedirectUrl() {
  return `${publicBaseUrl()}/studio/accounts?connected=1`;
}

/** Official hosted connect URL is `https://app.upload-post.com/connect?token=...`. Never log the token. */
export function assertUploadPostAccessUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Upload-Post retornou URL de conexão inválida.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Upload-Post retornou URL de conexão inválida.");
  }
  if (!ALLOWED_CONNECT_HOSTS.has(parsed.hostname.toLowerCase())) {
    throw new Error("Upload-Post retornou URL de conexão inválida.");
  }
  if (parsed.pathname !== "/connect" && !parsed.pathname.startsWith("/connect/")) {
    throw new Error("Upload-Post retornou URL de conexão inválida.");
  }
  if (!parsed.searchParams.get("token")) {
    throw new Error("URL de conexão sem token.");
  }
  return parsed;
}

export async function generateUploadPostConnectUrl(workspaceId: string) {
  const profile = await ensureUploadPostProfile(workspaceId);
  const json = await uploadPostJson<JwtResponse>({
    method: "POST",
    path: "/uploadposts/users/generate-jwt",
    json: {
      username: profile.username,
      redirect_url: uploadPostAccountsRedirectUrl(),
      language: "pt",
      connect_title: "Conectar redes sociais",
      connect_description: "Autorize suas contas sociais. CortaClip não pede senha nem app de desenvolvedor.",
      redirect_button_text: "Voltar ao CortaClip",
      show_calendar: false,
    },
  });
  if (!json.access_url) {
    throw new Error("Upload-Post não retornou URL de conexão.");
  }
  const accessUrl = assertUploadPostAccessUrl(json.access_url).toString();
  await recordSocialUsage({ workspaceId, kind: "connect", reference: profile.username });
  return { accessUrl, duration: json.duration ?? "48h", username: profile.username };
}
