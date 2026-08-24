# Zero-cost Vercel deployment runbook

This runbook prepares NEWS 01B.5A only. It does not create Kizuna configuration,
run discovery, add a scheduler, or start NEWS 01C. Do not enable a paid plan,
paid add-on, custom domain, database, Redis, or Vercel Cron.

## Eligibility gate

Vercel Hobby is free but its Terms restrict it to personal or non-commercial
use. Before every production creation or material usage change, confirm that
Kizuna still meets that condition. Stop if the project is commercial, the
dashboard requests a plan upgrade/payment, or the account is not on Hobby. Do
not add a card or silently fall back to paid infrastructure.

Official eligibility source, consulted 2026-08-24:
[Vercel Terms, Hobby Plan](https://vercel.com/legal/terms).

## Pre-deploy

1. Confirm `git status`, `git remote -v`, and `git log -5 --oneline`; review the
   complete diff and deploy only the intended clean revision.
2. Use Node 22 and npm, then run:

   ```text
   npm ci
   npm run lint
   npm test
   npm run build
   docker build --pull --tag kizuna-news-provider:<revision> .
   ```

3. Confirm ordinary tests report zero live provider traffic. Do not run a live
   discovery merely to validate serverless hosting.
4. Generate two different high-entropy printable secrets, each 32–512
   characters. Never place them in a file, shell history, Git, build argument,
   log, issue, or chat transcript.

## Create the Vercel project

Use the Vercel dashboard only after the eligibility gate passes:

1. Import the `kizuna-news-provider` repository into the eligible Hobby account.
2. Use the repository root as **Root Directory**; this is not a monorepo.
3. Keep npm and the repository `package-lock.json`. The `engines.node` value
   selects Node 22.x.
4. Use the normal framework detection. Root `app.js` exports one lazy handler
   backed by the same Express `createApp()` as Docker/local; `vercel.json`
   explicitly enables Fluid Compute. Do not create one function per route.
5. Do not configure a custom domain, Vercel Cron, storage, or add-ons. Use the
   generated `*.vercel.app` production hostname.

Official deployment sources, consulted 2026-08-24:
[Express on Vercel](https://vercel.com/docs/frameworks/backend/express),
[Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions),
and [Fluid Compute](https://vercel.com/docs/fluid-compute).

## Production environment

Configure these variables for **Production only** unless a separately reviewed
branch needs isolated non-production values:

| Variable | Required | Secret | Rule |
| --- | --- | --- | --- |
| `NODE_ENV` | yes | no | `production` |
| `ENABLED_SOURCES` | yes | no | `ann,animecorner,animetrending,crunchyroll` |
| `KIZUNA_NEWS_PROVIDER_SECRET` | yes | yes | future Kizuna-to-provider machine Bearer |
| `KIZUNA_NEWS_ARTICLE_REF_SECRET` | yes | yes | provider-only signing key, distinct from Bearer |

Do not define `PORT`; Vercel invokes the exported handler and does not use the
Docker listener. Do not use `NEXT_PUBLIC_*`. Production secrets should not be
copied to arbitrary Preview deployments. A preview without them builds but its
first runtime invocation fails closed during configuration.

Vercel encrypts environment variables at rest and scopes them to Production,
Preview, or Development. Changes apply only to new deployments. See
[Environment Variables](https://vercel.com/docs/environment-variables),
consulted 2026-08-24.

## Post-deploy smoke

Record the generated hostname, Vercel project name, deployment ID, Git revision,
Node version, and Hobby plan without recording secrets. From an authorized
operator environment, set `API_URL` and the machine secret only in the current
process, then run:

```text
npm run smoke:deployment
```

The default smoke performs only:

- `GET /health` -> 200 and `{"status":"ok"}`;
- internal call without Bearer -> 401;
- authenticated `GET /internal/v1/sources/health` -> 200.

It must not perform discovery. Confirm `Cache-Control: no-store`, no CORS
headers, and structured logs with no secrets, URLs, article references, content,
HTML, or RSS. Runtime logs are available on Hobby, with a current one-hour
retention limit; no paid observability service is required. See
[Runtime Logs](https://vercel.com/docs/logs/runtime), consulted 2026-08-24.

## Rollback and rotation

Use Vercel's previous known-good deployment/rollback action, then rerun the
non-provider smoke. A rollback or cold start resets cache, source health,
metrics, circuits, semaphores, and in-flight work by design.

Coordinate machine-secret rotation with the future Kizuna caller; the current
contract has no dual-key window. Rotating only the article-ref secret invalidates
outstanding references (normal TTL: 72 hours), so run discovery afterward to
issue new references.

The platform does not replace application retry policy. Provider code owns
bounded source retries; future Kizuna BullMQ owns command retries. Do not depend
on an automatic platform replay of ordinary HTTP requests.

## Docker/Render fallback

Docker remains supported. The former paid Render Blueprint moved to
`deploy/fallback/render.yaml` and is explicitly non-current. Do not sync it while
the zero-cost constraint is active. If Hobby eligibility or limits stop fitting,
revisit the ADR; Render Free is only an alternative after reviewing its sleep,
quota, bandwidth billing, and non-production guidance.
