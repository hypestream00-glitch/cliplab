"use client";

import { useState } from "react";
import { createPublicationAction } from "@/app/(studio)/studio/publishing/actions";
import { Button } from "@/components/ui/button";
import { DevNotice } from "@/components/dashboard/dev-notice";
import Link from "next/link";
import { captionLimitForPlatforms, PLATFORM_LIMITS, xCaptionLimit } from "@/lib/social/platform-limits";
import { CharacterCountField } from "@/components/publishing/character-count-field";
import { TIKTOK_PRIVACY_LABELS } from "@/lib/ui/status-labels";

type Account = {
  id: string;
  username: string;
  platform: string;
  mock: boolean;
};

type CreatorInfo = {
  username: string;
  nickname: string;
  privacyLevelOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxVideoPostDurationSec: number;
};

export function ComposeForm({
  clipId,
  clipTitle,
  caption,
  hashtags,
  thumbnail,
  accounts,
  creatorInfo,
  creatorError,
  defaultMode = "now",
  error,
  timezone,
  clipVertical,
  unified = false,
  hasVideo = true,
}: {
  clipId: string;
  clipTitle: string;
  caption: string;
  hashtags: string[];
  thumbnail?: string | null;
  accounts: Account[];
  creatorInfo?: CreatorInfo | null;
  creatorError?: string | null;
  defaultMode?: "now" | "schedule" | "queue";
  error?: string;
  timezone: string;
  clipVertical?: boolean;
  unified?: boolean;
  hasVideo?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [selected, setSelected] = useState<string[]>(() => accounts.filter((account) => !account.mock).map((account) => account.id));
  const connectedAccounts = accounts.filter((account) => !account.mock || !unified);
  const tiktokAccounts = connectedAccounts.filter((account) => account.platform === "TIKTOK" && !account.mock);
  const instagramAccounts = connectedAccounts.filter((account) => account.platform === "INSTAGRAM" && !account.mock);
  const facebookAccounts = connectedAccounts.filter((account) => account.platform === "FACEBOOK" && !account.mock);
  const xAccounts = connectedAccounts.filter((account) => account.platform === "X" && !account.mock);
  const youtubeAccounts = connectedAccounts.filter((account) => account.platform === "YOUTUBE" && !account.mock);
  const selectedPlatforms = connectedAccounts.filter((account) => selected.includes(account.id)).map((account) => account.platform);
  const privacyOptions = unified
    ? ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"]
    : (creatorInfo?.privacyLevelOptions ?? []);
  const captionMax = captionLimitForPlatforms(
    accounts.filter((account) => !account.mock).map((account) => account.platform),
  );
  const xMax = xCaptionLimit();
  const officialConnected = accounts.some((account) => !account.mock);
  return (
    <form action={createPublicationAction} className="mb-6 space-y-5 rounded-2xl border bg-card p-5">
      <div className="flex gap-3">
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt="" className="h-28 w-16 rounded-xl object-cover" />
        ) : (
          <div className="h-28 w-16 rounded-xl bg-muted" />
        )}
        <div>
          <p className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">1. Clip</p>
          <p className="text-[15px] font-medium">{clipTitle}</p>
        </div>
      </div>
      <input type="hidden" name="clipId" value={clipId} />
      {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
      {connectedAccounts.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          Nenhuma conta conectada.{" "}
          <Link href="/studio/accounts" className="underline">
            Conectar contas
          </Link>
        </p>
      ) : (
        <fieldset className="space-y-1.5">
          <legend className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">2. Redes</legend>
          {connectedAccounts.map((account) => (
            <label key={account.id} className="flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                name="accountIds"
                value={account.id}
                checked={selected.includes(account.id)}
                onChange={(event) => {
                  setSelected((current) =>
                    event.target.checked ? [...current, account.id] : current.filter((id) => id !== account.id),
                  );
                }}
                className="size-3.5 accent-primary"
              />
              {account.platform} @{account.username}
              {!account.mock ? <span className="text-emerald-300"> ✓ Conectado</span> : null}
            </label>
          ))}
        </fieldset>
      )}
      {!hasVideo ? <p className="text-[12px] text-destructive">Gere o render final antes de publicar.</p> : null}
      {tiktokAccounts.length > 0 && !unified && creatorError ? (
        <p className="text-[12px] text-destructive">{creatorError}</p>
      ) : null}
      {(creatorInfo || (unified && selectedPlatforms.includes("TIKTOK"))) ? (
        <div className="space-y-2 rounded-xl border p-3 text-[13px]">
          <p className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">TikTok</p>
          {privacyOptions.length ? (
            <label className="block">
              Privacidade
              <select name="privacy" className="mt-1 h-8 w-full rounded-md border bg-transparent px-2" defaultValue={privacyOptions.includes("SELF_ONLY") ? "SELF_ONLY" : privacyOptions[0]}>
                {privacyOptions.map((option) => (
                  <option key={option} value={option}>
                  {TIKTOK_PRIVACY_LABELS[option] ?? option}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {(unified || !creatorInfo?.commentDisabled) ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="disableComment" />
              Desativar comentários
            </label>
          ) : null}
          {(unified || !creatorInfo?.duetDisabled) ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="disableDuet" />
              Desativar Duet
            </label>
          ) : null}
          {(unified || !creatorInfo?.stitchDisabled) ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="disableStitch" />
              Desativar Stitch
            </label>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2">
        <p className="text-[11px] tracking-[0.08em] text-muted-foreground uppercase">3. Conteúdo</p>
      <CharacterCountField name="caption" label="Legenda" defaultValue={caption} max={captionMax} />
      <label className="block text-[12px] text-muted-foreground">
        Hashtags
        <input
          name="hashtags"
          defaultValue={hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}
          className="mt-1 h-8 w-full rounded-md border bg-transparent px-2 text-[13px] text-foreground"
        />
      </label>
      </div>
      <div className="flex flex-wrap gap-3 text-[13px]">
        <p className="w-full text-[11px] tracking-[0.08em] text-muted-foreground uppercase">4. Publicação</p>
        {[
          ["now", "Publicar agora"],
          ["schedule", "Agendar"],
          ["queue", "Colocar na fila"],
        ].map(([value, label]) => (
          <label key={value} className="flex items-center gap-1.5">
            <input type="radio" name="mode" value={value} defaultChecked={defaultMode === value} />
            {label}
          </label>
        ))}
      </div>
      <label className="block text-[12px] text-muted-foreground">
        Data e hora
        <div className="mt-1 flex gap-2">
          <input
            type="datetime-local"
            name="scheduledFor"
            className="h-8 flex-1 rounded-md border bg-transparent px-2 text-[13px] text-foreground"
          />
          <select name="timezone" defaultValue={timezone} className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
            <option value="America/Sao_Paulo">America/Sao_Paulo</option>
            <option value="UTC">UTC</option>
            <option value="America/New_York">America/New_York</option>
            <option value="Europe/Lisbon">Europe/Lisbon</option>
          </select>
        </div>
      </label>
      {instagramAccounts.length > 0 && selectedPlatforms.includes("INSTAGRAM") ? (
        <label className="flex items-center gap-2 text-[12px]">
          <input type="checkbox" name="shareToFeed" defaultChecked />
          Instagram: também aparecer no Feed (share_to_feed)
        </label>
      ) : null}
      {xAccounts.length > 0 && selectedPlatforms.includes("X") && !unified ? (
        <p className="text-[12px] text-muted-foreground">
          X: texto + hashtags no limite de {xMax} caracteres (padrão 280; posts longos só se X_LONG_POSTS=true). Vídeo via upload chunked oficial.
        </p>
      ) : null}
      {youtubeAccounts.length > 0 && selectedPlatforms.includes("YOUTUBE") ? (
        <div className="space-y-2 rounded-md border p-2 text-[12px]">
          <p>{unified ? "YouTube" : "YouTube — upload resumable oficial. Não há API separada de Shorts."}</p>
          {clipVertical ? (
            <p className="text-muted-foreground">Formato vertical / candidato a Short. A classificação na prateleira Shorts é decisão do YouTube.</p>
          ) : null}
          <label className="block text-muted-foreground">
            Título ({PLATFORM_LIMITS.YOUTUBE.titleMaxChars} caracteres)
            <input
              name="youtubeTitle"
              defaultValue={clipTitle.slice(0, PLATFORM_LIMITS.YOUTUBE.titleMaxChars)}
              maxLength={PLATFORM_LIMITS.YOUTUBE.titleMaxChars}
              className="mt-1 h-8 w-full rounded-md border bg-transparent px-2 text-[13px] text-foreground"
            />
          </label>
          <CharacterCountField
            name="youtubeDescription"
            label="Descrição"
            defaultValue={caption}
            max={PLATFORM_LIMITS.YOUTUBE.descriptionMaxChars}
            rows={4}
          />
          <label className="block text-muted-foreground">
            Privacidade
            <select name="youtubePrivacy" defaultValue="public" className="mt-1 h-8 w-full rounded-md border bg-transparent px-2">
              <option value="public">Público</option>
              <option value="unlisted">Não listado</option>
              <option value="private">Privado</option>
            </select>
          </label>
          <label className="block text-muted-foreground">
            Tags (até {PLATFORM_LIMITS.YOUTUBE.maxTags})
            <input
              name="youtubeTags"
              defaultValue={hashtags.join(", ")}
              className="mt-1 h-8 w-full rounded-md border bg-transparent px-2 text-[13px] text-foreground"
            />
          </label>
          <p className="text-muted-foreground">
            Thumbnail gerada pelo CortaClip é enviada se a API aceitar. Falha no thumbnail não cancela o upload.
          </p>
        </div>
      ) : null}
      {facebookAccounts.length > 0 && selectedPlatforms.includes("FACEBOOK") && !unified ? (
        <p className="text-[12px] text-muted-foreground">
          Facebook Page Reels são públicos. O upload usa a Reels Publishing API oficial (rupload).
        </p>
      ) : null}
      {officialConnected ? null : (
        <DevNotice>Nenhuma conta real conectada. Contas DEMO não publicam nas redes.</DevNotice>
      )}
      {confirming ? (
        <div className="space-y-2 rounded-xl border border-border p-4 text-[13px]">
          <p className="font-medium">Publicar este clip?</p>
          <p className="text-muted-foreground">
            {clipTitle} · {connectedAccounts.filter((account) => selected.includes(account.id) && !account.mock).map((account) => `${account.platform} @${account.username}`).join(", ") || "conta conectada"}
          </p>
          <input type="hidden" name="confirmRealPublish" value="1" />
          <div className="flex gap-2">
            <Button type="submit">Publicar agora</Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type={officialConnected ? "button" : "submit"}
          disabled={connectedAccounts.length === 0 || !hasVideo || Boolean(!unified && creatorError && tiktokAccounts.length > 0)}
          onClick={officialConnected ? () => setConfirming(true) : undefined}
        >
          Publicar
        </Button>
      )}
    </form>
  );
}
