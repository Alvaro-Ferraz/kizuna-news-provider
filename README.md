# Kizuna News Provider

Private backend-to-backend news discovery service for Kizuna. This fork is based
on [AniNewsAPI](https://github.com/Shineii86/AniNewsAPI) by Shinei Nouzen and
retains its MIT license and attribution in [NOTICE.md](NOTICE.md).

**Status:** NEWS 01B.5A — **ZERO-COST SERVERLESS DEPLOYMENT READY** for Vercel
Hobby while the project remains eligible for personal/non-commercial use. It is
not yet deployed or wired into Kizuna; that integration is NEWS 01C. No paid or
production resource was created during this phase.

The runtime surface is intentionally small:

- `GET /health` — public process liveness only;
- `POST /internal/v1/discovery-runs` — authenticated discovery command;
- `POST /internal/v1/article-extractions` — authenticated extraction from one
  signed, opaque `articleRef`;
- `GET /internal/v1/sources/health` — authenticated in-memory health snapshot.

There is no landing page, browser API, CORS support, public news/search/RSS
endpoint, arbitrary-URL extractor, or cache-clear endpoint.

The four V1 sources use bounded direct RSS discovery. ANN and Crunchyroll no
longer use Google News, Anime Trending uses its canonical trailing-slash feed,
and Crunchyroll tries `pt-BR` before its bounded `en-US` fallback. See
[docs/V1_SOURCES.md](docs/V1_SOURCES.md) for exact source and cache semantics.

## Local setup

Requires Node.js 22. The container pins Node.js `22.23.2-alpine3.24`.

```bash
npm ci
cp .env.example .env
```

Set `KIZUNA_NEWS_PROVIDER_SECRET` and the independently rotatable
`KIZUNA_NEWS_ARTICLE_REF_SECRET` to distinct printable secrets of at least 32
characters. No runtime default exists. In production, `ENABLED_SOURCES` is also
mandatory and may contain only `ann`, `animecorner`, `animetrending`, and
`crunchyroll`.

```bash
npm start
```

`npm start` reads environment variables from the process; it does not load
`.env` automatically. Never commit the secret or reuse a Kizuna user/session
credential.

The same `createApp()` factory powers the local/Docker listener and the
serverless entry in `app.js`. Serverless production does not require `PORT`;
both secrets and explicit `ENABLED_SOURCES` remain mandatory. Docker remains a
supported local and future container-hosting fallback.

## Checks

```bash
npm run lint
npm test
npm run build
```

Ordinary tests prohibit external network access. `npm run test:live` is a
separate, explicit provider-network smoke test and requires
`ALLOW_LIVE_PROVIDER_TESTS=true` plus the machine secret.

Use `npm run benchmark:local` for the labelled local/synthetic benchmark,
`npm run smoke:deployment` against a deployed candidate, and
`npm run validate:live` only for an explicitly authorized, bounded provider
check. The last command never runs in CI or the ordinary suite.

See [docs/PRIVATE_API.md](docs/PRIVATE_API.md) for the wire contract,
[docs/ARTICLE_EXTRACTION.md](docs/ARTICLE_EXTRACTION.md) for extraction limits
and selector versions,
[docs/SECURITY_BOUNDARY.md](docs/SECURITY_BOUNDARY.md) for trust boundaries and
known debt, [docs/V1_SOURCES.md](docs/V1_SOURCES.md) for discovery behavior, and
[docs/FORK_BASELINE.md](docs/FORK_BASELINE.md) for fork history. Hosting choice,
capacity evidence, environment inventory, deployment procedure, rollback, and
the live-check limitation are recorded in
[docs/SELF_HOST_READINESS.md](docs/SELF_HOST_READINESS.md). The zero-cost hosting
decision and current platform limits are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md),
the state audit is in [docs/SERVERLESS_STATE_MODEL.md](docs/SERVERLESS_STATE_MODEL.md),
and operator steps are in [docs/DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md).
