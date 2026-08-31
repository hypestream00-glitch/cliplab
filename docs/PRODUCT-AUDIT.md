# CLIPLAB — Product Audit (Módulo 5)

Auditoria do produto existente. Sem novas redes, sem novo editor, sem Stripe real nesta rodada.

Estados usados neste documento:

- **DONE** — verificado no código e ligado a persistência/backend
- **PARTIAL** — funciona, com ressalva honesta
- **CONFIG REQUIRED** — depende de credencial de ambiente
- **APPROVAL REQUIRED** — credencial existe, falta aprovação externa
- **NOT IMPLEMENTED** — recuso fingir; marcado na UI

## Rotas

| ROTA | FUNÇÃO | STATUS | BACKEND | PERSISTÊNCIA | PROBLEMAS | AÇÃO NECESSÁRIA |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | Landing | DONE | estático | n/a | — | manter |
| `/login` | Auth + login DEMO identificado | DONE | Auth.js | sessão JWT | — | manter |
| `/register` | Cadastro | DONE | Prisma User | sim | — | manter |
| `/forgot-password` | Recuperação | PARTIAL | tokens | sim | e-mail depende de provedor | CONFIG se sem SMTP |
| `/reset-password` | Reset | DONE | tokens | sim | — | manter |
| `/verify-email` | Verificação | PARTIAL | tokens | sim | e-mail | CONFIG se sem SMTP |
| `/onboarding` | Onboarding | DONE | User | sim | — | manter |
| `/studio` | Dashboard | DONE | Prisma counts/snapshots | sim | views DEMO excluídas do total real | DONE |
| `/studio/create` | Novo projeto + upload | DONE | FFmpeg + storage | sim | URL ingest não suportado (erro explícito) | manter |
| `/studio/projects` | Lista, busca, filtro, paginação, arquivar, excluir | DONE | Prisma | sim | — | DONE |
| `/studio/projects/[id]` | Status pipeline, clipes, rename, delete | DONE | jobs reais | sim | — | DONE |
| `/studio/projects/[id]/clips` | Clipes do projeto | DONE | Prisma | sim | — | manter |
| `/studio/clips` | Lista, filtro, busca, paginação | DONE | Prisma | sim | — | DONE |
| `/studio/clips/[id]` | Preview, render, download, delete confirm | DONE | media/render | sim | download exige arquivo | manter |
| `/studio/editor` | Lista para editar | DONE | Prisma | sim | — | manter |
| `/studio/editor/[clipId]` | Editor + save persistido | DONE | EditorProject | sim | — | manter |
| `/studio/templates` | Templates | DONE | Prisma | sim | — | manter |
| `/studio/library` | Uploads / clipes / renders | DONE | Prisma + `/api/media` | sim | criada nesta rodada | DONE |
| `/studio/publishing` | Composer + status real | DONE | workers | sim | sucesso só após provider | manter |
| `/studio/publishing/calendar` | Mês a partir do banco + cancelar | DONE | SocialPublication | sim | — | DONE |
| `/studio/publishing/queue` | Fila + retry/cancel | DONE | jobs | sim | — | DONE |
| `/studio/publishing/autopilot` | Autopilot opt-in | DONE | AutopilotRule | off por padrão | — | manter |
| `/studio/accounts` | OAuth oficiais + DEMO badge | DONE | SocialAccount.mock | sim | redes extras = não disponível | DONE |
| `/studio/accounts/meta` | Meta helper | DONE | Meta OAuth | sim | — | manter |
| `/studio/metrics` | Overview sem inventar views | DONE | snapshots reais | sim | DEMO fora do total | DONE |
| `/studio/metrics/accounts` | Contas + range real | DONE | metricSnaps filtrados | sim | — | DONE |
| `/studio/metrics/accounts/[id]` | Detalhe sem gráfico fake | DONE | snapshots | sim | sem “melhor horário” inventado | DONE |
| `/studio/metrics/content` | Posts publicados | DONE | post metrics | sim | mock = DEMO | DONE |
| `/studio/live` | Live clipping | PARTIAL | plano | — | gated por plano | manter |
| `/studio/live/channels` | Canais | PARTIAL | LiveChannel | sim | — | manter |
| `/studio/live/[channelId]` | Canal | PARTIAL | — | sim | — | manter |
| `/studio/championships` | Campeonatos | PARTIAL | já existia | sim | fora do escopo desta rodada | manter |
| `/studio/championships/new` | Novo campeonato | PARTIAL | — | sim | — | manter |
| `/studio/championships/[id]` | Detalhe | PARTIAL | — | sim | — | manter |
| `/studio/team` | Membros + convite persistido | PARTIAL | WorkspaceInvitation | sim | sem e-mail de convite | marcado na UI |
| `/studio/api` | API keys | DONE | ApiKey | sim | — | manter |
| `/studio/settings` | Hub | DONE | — | — | — | manter |
| `/studio/settings/profile` | Perfil | DONE | User | sim | — | DONE |
| `/studio/settings/workspace` | Nome workspace | DONE | Workspace | sim | — | DONE |
| `/studio/settings/billing` | Planos | CONFIG REQUIRED | Stripe opcional | créditos no banco | sem Stripe = sem pagamento fake | DONE |
| `/studio/settings/integrations` | Flags de env | DONE | env | n/a | sem secrets | manter |
| `/studio/settings/status` | System Status | DONE | ping DB/FFmpeg/env | n/a | sem secrets | DONE |
| `/studio/settings/notifications` | Prefs | DONE | User.notificationPrefs | sim | — | DONE |
| `/studio/settings/security` | Senha | DONE | passwordHash | sim | 2FA NOT IMPLEMENTED | DONE |
| `/admin` | Admin | DONE | role SUPER_ADMIN | sim | — | manter |
| `/admin/users` | Usuários | DONE | Prisma | sim | — | manter |
| `/admin/workspaces` | Workspaces | DONE | Prisma | sim | — | manter |
| `/admin/jobs` | Jobs | DONE | ProcessingJob | sim | — | manter |
| `/admin/billing` | Billing admin | PARTIAL | invoices | sim | Stripe | CONFIG REQUIRED |

## Checklist do módulo

| # | Item | Status |
| --- | --- | --- |
| 1 | Inventário de rotas | DONE |
| 2 | Botões principais (sidebar, CRUD, publish, metrics, settings) | DONE |
| 3 | Sidebar rotas reais + ativo | DONE |
| 4 | Dashboard persistido, views reais, DEMO separado | DONE |
| 5 | Novo projeto persiste após refresh | DONE |
| 6 | Projects list/rename/archive/delete/search/filter/page | DONE |
| 7 | Upload validação + erro visível | DONE |
| 8 | Processamento via status de job (não timer fake) | DONE |
| 9 | Clips ações + confirmação de delete | DONE |
| 10 | Editor save persistido | DONE |
| 11 | Render job + download | DONE |
| 12 | Library | DONE |
| 13 | Social accounts DEMO / CONFIG / CONECTAR / CONECTADO | DONE |
| 14 | Composer sem sucesso falso | DONE |
| 15 | Calendário do banco + mês + cancelar | DONE |
| 16 | Publication status real + CANCELED | DONE |
| 17 | Metrics sem números inventados | DONE |
| 18 | Filtros de listas/métricas | DONE |
| 19 | Search com debounce | DONE |
| 20 | Paginação projects/clips/library | DONE |
| 21 | Settings persistem | DONE |
| 22 | Workspace/equipe sem fingir e-mail | PARTIAL |
| 23 | Notificações reais + lidas + prefs | DONE |
| 24 | Billing sem Stripe = CONFIGURAÇÃO NECESSÁRIA | CONFIG REQUIRED |
| 25 | Auth + login DEMO identificado | DONE |
| 26 | Erros inline/toast existentes + redirects com `error=` | DONE |
| 27 | Loading/pipeline existente | PARTIAL |
| 28 | Empty states | DONE |
| 29 | Confirmações destrutivas | DONE |
| 30 | Overflow calendário/tabelas | PARTIAL |
| 31 | Labels/aria em sino, busca, delete | PARTIAL |
| 32 | Ownership via workspaceId + media authorize | DONE |
| 33 | Zod no create project e mutations existentes | DONE |
| 34 | `SocialAccount.mock` + badge DEMO | DONE |
| 35 | `lib/features/availability.ts` | DONE |
| 36 | System Status | DONE |
| 37 | Logger redact ampliado | DONE |
| 38 | Dead code: não removido em massa | PARTIAL |
| 39 | Testes unitários ownership/features/prefs | DONE |
| 40 | E2E smoke login/dashboard/create/library/status | DONE |
| 41 | E2E social config necessária | DONE |
| 42 | Sem novas redes | DONE |
| 43 | Sequência lint → typecheck → test → build | DONE após QA |
| 44 | Validação final sequential | DONE após QA |
| 45 | Este documento | DONE |

## Ainda depende de credencial

- OpenAI (`OPENAI_API_KEY`) — sem ela transcrição/análise = MOCK explícito
- TikTok, Meta (Instagram/Facebook), X, YouTube OAuth
- Stripe
- Redis (fila local se ausente)
- SMTP para convite/reset

## Ainda depende de aprovação externa

- TikTok Content Posting
- Instagram/Facebook App Review
- X write/API tier
- YouTube upload/analytics scopes

## Ainda não implementado (honesto)

- 2FA
- Checkout Stripe real sem chaves
- Ingest por URL (YouTube/Twitch/Kick) — erro explícito
- LinkedIn, Twitch, Kick, Bluesky, etc. como OAuth
- E-mail transacional de convite de equipe
- Gráfico “melhor horário” (removido por ser inventado)
