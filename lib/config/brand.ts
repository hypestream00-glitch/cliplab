export const brand = {
  name: "CortaClip",
  shortName: "CC",
  tagline: "Transforme vídeos longos em clips prontos para publicar",
  description: "CortaClip transforma vídeos longos em clips prontos para publicar usando inteligência artificial.",
  url: "https://cortaclip.com",
  supportEmail: "suporte@cortaclip.com",
} as const;

export type Brand = typeof brand;

export function brandMetadataBase() {
  const raw = (process.env.APP_URL ?? process.env.AUTH_URL ?? brand.url).trim();
  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return url;
  } catch {
    /* fall through */
  }
  return new URL(brand.url);
}

export function defaultClipTitle() {
  return `Clipe ${brand.name}`;
}
