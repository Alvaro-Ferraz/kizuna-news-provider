# Deployment runbook

This runbook deploys NEWS 01B.5 only. It does not authorize spend, create Kizuna
configuration, or start NEWS 01C. The preferred target is the single-instance
Render Docker Web Service declared in `render.yaml`.

## Pre-deploy

1. Confirm the repository and revision with `git status`, `git remote -v`, and
   `git log -5 --oneline`. Review every local change; never deploy an accidental
   dirty tree.
2. Use Node 22 (`.nvmrc`) and run:

   ```text
   npm ci
   npm run lint
   npm test
   npm run build
   docker build --pull --tag kizuna-news-provider:<revision> .
   ```

3. Confirm ordinary tests report zero network traffic and the image runs as
   user `node`. Test it with a read-only filesystem and non-production secrets.
4. Confirm the Kizuna API's Render region. `render.yaml` chooses Oregon, which
   cannot be changed after service creation. Edit it before creation if the API
   uses another region.
5. Review the live Render checkout price and get explicit authorization before
   syncing a paid Blueprint.
6. Generate two different high-entropy printable secrets, each 32–512
   characters. Do not store them in a file, shell history, Dockerfile, build
   argument, log, issue, or chat transcript.

Required production configuration:

| Environment variable | Required | Secret | Value/owner |
| --- | --- | --- | --- |
| `NODE_ENV` | yes | no | literal `production` |
| `PORT` | yes | no | injected by Render; do not hardcode in the service |
| `ENABLED_SOURCES` | yes | no | `ann,animecorner,animetrending,crunchyroll` |
| `KIZUNA_NEWS_PROVIDER_SECRET` | yes | yes | machine bearer, later shared only with the Kizuna API |
| `KIZUNA_NEWS_ARTICLE_REF_SECRET` | yes | yes | provider-only signing key, distinct from machine bearer |

## Deploy on Render

1. In Render, choose New > Blueprint and connect this repository. Merely
   committing `render.yaml` does not create a service.
2. Review the proposed resource before confirming: Docker Web Service, Starter,
   Oregon (or the pre-reviewed Kizuna API region), exactly one instance, no disk,
   and health path `/health`.
3. Enter the two secret values prompted by `sync: false`. Render supplies
   `PORT`; leave Docker `CMD` unchanged (`node server.js`).
4. Require repository CI checks to pass. Confirm the deployment built the
   intended commit and became healthy before routing any caller.
5. Record the deploy ID, image/build revision, region, plan and provider URL in
   the private operations record. Do not add the URL or secret to frontend or
   `NEXT_PUBLIC_*` configuration.

## Post-deploy smoke and canary

Run `npm run smoke:deployment` from an authorized operator environment with
`API_URL` and `KIZUNA_NEWS_PROVIDER_SECRET` supplied to the process. By default
it performs only:

- public `GET /health` -> 200;
- authenticated-route call without bearer -> 401;
- `GET /internal/v1/sources/health` with bearer -> 200.

It does not contact providers unless `ALLOW_LIVE_DISCOVERY_SMOKE=true` is also
set. Any live canary needs a separate explicit approval and the source-policy
limits in `SELF_HOST_READINESS.md`; do not run Crunchyroll automated discovery
or ANN article extraction without resolving their recorded policy gates. Record
only provider/outcome/count/duration/attempt/cache/error metadata.

Confirm startup logs contain the expected version, port, environment and four
provider keys, but no secrets or URLs. Observe platform memory, CPU, restart
count and response latency through at least one bounded canary window before
NEWS 01C sends recurring work.

## Rollback

1. Stop or disable NEWS 01C caller traffic if it exists in the future.
2. Select Render's previous known-good deploy/rollback action. Do not rebuild an
   old Git tree with new dependencies when an immutable previous deploy exists.
3. Restore the previous environment configuration if the failure was a config
   or secret change, then rerun the non-provider smoke.
4. Expect cache, source health, circuit breakers, metrics and in-flight work to
   reset. They are disposable. Article references remain valid across restart
   only when the article-ref secret is unchanged.
5. If rollback health fails, leave integration traffic off and diagnose from
   safe structured logs rather than repeatedly calling upstream sites.

## Secret rotation

The machine secret is eventually present on Render and the Kizuna API. Rotate
it as one coordinated operation; the current V1 contract accepts a single
secret and has no dual-key grace window, so plan a brief caller pause or an
ordered deploy with rollback values ready.

Only the provider holds the article-ref secret. Changing it invalidates all
outstanding signed references, whose normal TTL is 72 hours. Rotate during a
controlled window, allow discovery to issue new references afterward, and do
not attempt to migrate or log old tokens.

## Provider failure operations

Use authenticated source health and structured logs to distinguish degraded,
failed, circuit-open, cache-stale, timeout, rate-limit, layout, and capacity
outcomes. `/health` staying green during one source failure is intentional.
Do not add replicas to work around upstream slowness; that amplifies traffic.
First pause callers, observe deadlines/attempts/cache status, and vertically
scale only if local CPU or memory is the demonstrated constraint.

## Upstream updates

Never auto-merge AniNewsAPI. Fetch upstream metadata, compare against the
recorded base version/commit, review license/security/contract impact, port only
the intended changes, and rerun the complete offline and container gates. Any
new source requires a separate policy, host allowlist, parser, fixture, contract
and extraction review.
