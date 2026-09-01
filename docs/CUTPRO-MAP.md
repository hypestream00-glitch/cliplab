# Mapa público Cut.Pro → CortaClip

Investigação via páginas públicas (2026-08-29). `/studio` e `/studio/metrics/accounts` redirecionam para `/auth?step=login`. Nenhuma tela autenticada foi acessada.

## Rotas públicas observadas

| Rota | Título | Função | Auth |
|---|---|---|---|
| `/` | Cortes no automático | Landing: paste URL, upload, stats | Não |
| `/en/pricing` | Plans | Free/Basic/Plus/Pro/Business, créditos | Não |
| `/auth?step=login` | Sign in | Google, Apple, e-mail | Gate |
| `/docs/en` | Docs | API, créditos, clipagem, posts, connections | Não |
| `/en/championships` | Championships | Criar/entrar, ranking, prêmios | Parcial |
| `/en/solutions/*` | Soluções | Streamers, agências, etc. | Não |
| `/studio` | — | Redirect login | Sim |
| `/studio/metrics/accounts` | — | Redirect login | Sim |

## Visual público (tokens inferidos, NÃO copiados)

- Fundo quase preto, superfícies cinza muito escuro
- Acento violeta no CTA e destaques
- Tipografia sans geométrica, títulos bold, body cinza médio
- Radius ~8–12px, bordas finas de baixo contraste
- Login: coluna ~380–400px, OAuth branco, CTA violeta full-width
- Docs: sidebar densa, grupos, badges de método

## Produto documentado

Fluxo: analisar URL (grátis) → submit clipping (consome créditos) → poll `queued → downloading → transcribing → video_analysis → analyzing → finalizing → completed` → clips com score → template → render → post.

1 crédito = 1 minuto analisado. Publicação multi-plataforma. Connections com followers/posts/likes. Live Twitch/Kick/YouTube. Campeonatos. API key + MCP. Workspaces agência com brand kit por cliente.

## Comparação CLIPLAB

- IMPLEMENTADO: auth, workspaces, créditos, projetos, clipes, editor UI, contas mock, publicação, métricas, live, campeonatos, team, API keys, billing UI, admin, seed
- PARCIAL: OAuth (mock connect, sem PKCE/callback), editor (undo/redo/captions incompletos), clips bulk, autopilot (schema só), settings notifications
- AUSENTE no produto interno visível: estratégias de clipagem nomeadas, bulk download zip, MCP server, Apple login
- PRECISA REFEITO: densidade visual genérica (azul/Geist cardoso) vs preto/violeta observado
