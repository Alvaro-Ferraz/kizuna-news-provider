# NEWS 01B.5 self-host readiness

> Superseded hosting note (2026-08-24): NEWS 01B.5A introduced the approved
> zero-additional-fixed-cost constraint. Its Render Starter recommendation is
> superseded by the Vercel Hobby decision recorded in Kizuna ADR-031 and
> [DEPLOYMENT.md](DEPLOYMENT.md). The measurements and Docker evidence below
> remain historical evidence; no Render Starter resource was created.

Decision date: 2026-08-24. Evidence base: upstream fork commit `4f6ed12` plus
the NEWS 01B.5 working tree. Gate: **SELF-HOST READY** for a single, always-on
Docker process. This gate covers the provider only; NEWS 01C still owns Kizuna
integration, persistence, queues, scheduling, and product routes.

No cloud resource, custom domain, secret, or paid plan was created in this
phase. The checked-in `render.yaml` is a reviewed deployment input, not proof
that a Render service exists.

## Hosting decision

Use one Render Docker Web Service on the Starter instance type, in Oregon,
without autoscaling, disk, database, or Redis. Render is already part of the
Kizuna production topology, supports Docker web services and HTTP health
checks, and performs replacement deploys with a bounded SIGTERM window. The
process must remain at exactly one instance while health history, RSS validators,
circuit state, and in-flight coalescing are memory-local.

The deployment unit is the repository Dockerfile. `render.yaml` selects
`starter`, `numInstances: 1`, `/health`, a 30-second platform shutdown delay,
and deployment only after repository checks pass. Render supplies `PORT`; the
application fails startup in production if it or either secret is absent.

Point-in-time comparison, consulted 2026-08-24:

| Criterion | Render Docker Web Service | Vercel Express Function | Generic always-on Docker PaaS/VM |
| --- | --- | --- | --- |
| Process persistence / cold start | One paid always-on instance; replacement only on deploy/restart | Reused when warm, but explicitly scales to zero and may cold-start | Compatible only if configured as one continuously running replica |
| Request duration | Persistent HTTP process; provider's own 15/20-second deadlines dominate | Current Hobby maximum is 300 seconds, so duration alone fits | Must allow at least the provider deadlines plus transport margin |
| Memory and cache behavior | 512 MiB Starter signal; one instance keeps cache/health/circuits coherent | 2 GiB/1 vCPU Hobby shape, but state is fragmented across function instances | Vendor-specific; coherent with exactly one replica |
| Concurrency / outbound network | Normal Node process; provider semaphores remain authoritative | Platform concurrency can share or split instances, duplicating upstream work | Normal container networking if unrestricted HTTPS egress exists |
| Health and logs | Native HTTP health path, service logs and platform metrics | Invocation health/log model, not a durable instance health model | Must supply HTTP probes and centralized container logs |
| Graceful shutdown | Documented SIGTERM/SIGKILL deploy lifecycle with configurable delay | Function lifecycle is platform-managed; no equivalent persistent-process contract | Must deliver SIGTERM and allow at least 25 seconds |
| Docker / reproducibility | First-class Dockerfile build and the same artifact model as local | Express is transformed into a Function; the Docker artifact is not used | Native fit when it builds or pulls the checked Dockerfile |
| Cost / operational familiarity | Starter documented at USD 7/month, 512 MiB, 0.5 CPU; Kizuna already uses Render | Hobby includes usage, but resource shape/state model is a poor match | Vendor-specific and adds another operational surface |
| Future scaling | Vertical first; horizontal requires shared-state decision | Automatic scaling is easy but conflicts with current state semantics | Vertical first; horizontal has the same architecture prerequisite |
| Result | **Preferred** | Not selected | **Fallback** |

Render's free web service is suitable only for a disposable demonstration: its
documented 15-minute idle spin-down and roughly one-minute wake conflict with
the always-on operational model. It is not the production recommendation.

Primary references: [Render web services](https://render.com/docs/web-services),
[Docker on Render](https://render.com/docs/docker),
[health checks](https://render.com/docs/health-checks),
[deploy lifecycle](https://render.com/docs/deploys),
[free limitations](https://render.com/docs/free), and
[Blueprint schema](https://render.com/docs/blueprint-spec). Current Vercel
behavior was checked against [Express on Vercel](https://vercel.com/docs/frameworks/backend/express),
[Functions](https://vercel.com/docs/functions),
[Fluid Compute](https://vercel.com/docs/fluid-compute), and
[function limits](https://vercel.com/docs/functions/limitations). Pricing is a
point-in-time assumption, not a contractual quote; confirm the Render dashboard
before authorizing spend.

## Runtime and container evidence

The production image pins `node:22.23.2-alpine3.24`, installs the lockfile with
`npm ci --omit=dev --ignore-scripts`, copies only the private runtime and four
V1 adapters, and runs as Alpine's `node` user (UID/GID 1000). It contains no
test suite, docs, scripts, legacy public API, frontend, or non-V1 adapters. It
has no writable-volume requirement and passed with Docker `--read-only`.

Observed locally on Windows 11 / Docker Desktop 28.4.0 / Node 22.23.2:

| Evidence | Result | Label |
| --- | --- | --- |
| Image build | success; production dependency audit during build reported 0 vulnerabilities | LOCAL |
| Image size | 62,757,985 bytes (about 59.8 MiB) | LOCAL |
| Idle container memory | 34.39 MiB observed; host limit was not a production limit | LOCAL |
| Container cold start to `/health`, 5 samples | 960 / 1,070 / 1,180 ms min/median/max | LOCAL |
| Read-only root filesystem | passed | LOCAL |
| Runtime identity | `uid=1000(node) gid=1000(node)` | LOCAL |
| Missing production secrets | exit 1 with safe `CONFIGURATION_INVALID` log | LOCAL |
| SIGTERM | admission stopped, graceful exit code 0, not OOM-killed | LOCAL |
| Health/auth/CORS | 200 public health; 401 without bearer; 200 with bearer; no CORS header | LOCAL |

`npm run benchmark:local` uses fixtures and does not contact providers. Five
bare-process cold starts measured 668/678/687 ms min/median/max. Thirty
synthetic discovery/extraction loops measured median 0.84/1.32 ms. In that
benchmark process RSS moved from 83.50 MiB to 98.77 MiB and heap from 26.93 MiB
to 28.52 MiB. These are development-machine signals, not production SLOs or
capacity guarantees.

A 512 MiB Starter instance therefore has substantial observed headroom over
the 34.39 MiB idle container measurement. The phase does not claim a peak-load
memory bound: upstream bodies are capped at 1 MiB for RSS and 2 MiB for an
article, discovery concurrency is 2 globally/1 per host, and extraction
capacity is 2. Monitor before increasing traffic or replica count.

## Memory-local state audit

| State | Bound and lifecycle | Correctness impact on restart/eviction |
| --- | --- | --- |
| RSS cache | At most one entry per configured feed URL: ANN 1, Corner 1, Trending 1, Crunchyroll 2; normalized article arrays capped at 100 items; HTTP freshness capped at 24 hours | Disposable optimization. Next run refetches; no durable truth is lost |
| Discovery in flight | One whole-run promise plus one provider promise per enabled provider | Same-process requests coalesce; restart may duplicate a bounded upstream operation |
| Article extraction in flight | Capacity 2; map contains only active identities and deletes them in `finally` | No result cache or durable state; restart aborts active work and callers retry later |
| Source health/metrics | Exactly one record per enabled V1 provider | Observability resets on restart; not application truth |
| Circuit breakers | Exactly one discovery and extraction state record per enabled provider; threshold 3, cooldown 60 seconds | Restart closes circuits; deadlines/retries still bound each operation |
| Host semaphores | Lazily one per allowlisted V1 feed/article host | Finite allowlist bounds the map; restart only resets concurrency counters |

No runtime path reads or writes an application cache directory. Render's
ephemeral filesystem is sufficient. Horizontal scaling is deliberately off:
multiple instances would independently cache, count health, open circuits, and
coalesce work. If NEWS 01C later needs multiple replicas, those behaviors must
first move to shared infrastructure or be declared intentionally per-instance.

## Failure, concurrency, and observability model

RSS operations have an overall 15-second deadline, at most 3 attempts with
bounded jittered backoff, at most 3 redirects, 1 MiB decompressed-body limit,
global concurrency 2 and per-host concurrency 1. Article operations have a
20-second deadline, at most 2 attempts, at most 3 redirects, a 2 MiB body limit,
global concurrency 2, per-host concurrency 1, and extraction capacity 2.
Provider failures remain isolated; partial discovery succeeds, while an
all-source failure returns 502. Same discovery/extraction work coalesces only
inside the current process.

Logs are one-line JSON with UTC timestamp, service, event, request ID where
available, provider, operation, outcome, duration, attempt count, cache status,
selector version, and safe error code. Field names matching secrets, auth,
tokens, article references, URLs, queries, cookies, HTML/XML/RSS or content are
redacted. Fatal process errors log only their class before bounded shutdown.
Do not add article titles, URLs, references, extracted text, raw responses, or
secret values to logs.

`GET /health` is intentionally a liveness/readiness signal for the process, not
an upstream fan-out. Render should probe it. Provider detail remains behind
bearer authentication at `GET /internal/v1/sources/health`.

## Environment inventory

| Variable | Production rule | Owner / rotation |
| --- | --- | --- |
| `NODE_ENV` | Must be `production` | Blueprint literal |
| `PORT` | Required; Render injects it; bind is `0.0.0.0` | Platform |
| `ENABLED_SOURCES` | Required exact comma list; recommended all four V1 keys | Deployment config |
| `KIZUNA_NEWS_PROVIDER_SECRET` | Required printable 32–512 chars; must differ from article-ref secret | Shared only with the future Kizuna API caller; rotate by overlapping deployment coordination in NEWS 01C |
| `KIZUNA_NEWS_ARTICLE_REF_SECRET` | Required printable 32–512 chars and independent | Provider-only signing key; rotation invalidates outstanding 72-hour references, so coordinate or accept that bounded effect |

Store secrets only in Render secret environment variables (`sync: false` in
the Blueprint prompts for them at first creation). Never put them in Git,
Docker build arguments, logs, browser code, Vercel public environment, or
provider URLs. A custom hostname is optional for NEWS 01C; TLS termination at
Render's public ingress is required regardless.

## Bounded live validation

The explicit check was invoked only for ANN, Anime Corner, and Anime Trending.
Crunchyroll was excluded because automated acquisition is policy-blocked. ANN
article extraction was also excluded pending source-policy review. The intended
article extraction cap was one current item each for Corner and Trending.

The execution environment denied every upstream connection with
`PROVIDER_NETWORK_ERROR`. Two discovery invocations occurred while separating
the sandbox failure from the attempted elevated rerun; each provider recorded
3 bounded upstream attempts per invocation. No article was obtained, so zero
live article extractions occurred and no title, URL, article reference, body,
HTML, or feed payload was printed or persisted. Testing stopped at that point.

This is labelled **LIVE / ENVIRONMENT-BLOCKED**, not a provider success result.
It does not invalidate container/self-host mechanics, but it leaves selector
drift and current provider reachability for the post-deploy canary. Do not call
the providers again merely to improve this report. The first authorized
deployment should run `npm run smoke:deployment` with discovery disabled, then
one separately approved canary discovery; extraction remains subject to the
same source-policy restrictions.

## Deploy, canary, rollback, and scale

1. Confirm the Kizuna API Render region. The Blueprint chooses Oregon and the
   region is immutable after service creation; change the file before creation
   if the existing API is elsewhere.
2. Review the current Starter checkout price. Creating/syncing the Blueprint is
   the purchase boundary and requires explicit user authorization.
3. Generate two independent high-entropy secrets. Enter them in Render when
   prompted by the `sync: false` fields. Do not set `PORT` manually.
4. Connect the repository as a Render Blueprint and review the diff before
   selecting Deploy. Confirm Docker runtime, Starter, one instance, no disk,
   Oregon, and `/health`.
5. Require CI green. Confirm build digest, startup JSON, `/health` 200, non-root
   runtime, and stable memory before allowing NEWS 01C traffic.
6. From an authorized backend location, run `API_URL=https://...` plus the
   machine secret with `npm run smoke:deployment`. It checks liveness, the 401
   boundary, and authenticated source health without contacting providers.
7. Run the separately approved provider canary described above. Record only
   outcome/count/duration/attempt/cache/error metadata.
8. In NEWS 01C, configure only the Kizuna API with the provider base URL and
   machine secret. Keep timeouts below the provider's operation deadlines plus
   a small transport margin, and do not introduce public/browser access.

Rollback is a Render rollback to the last known-good image/config, followed by
the non-provider smoke. If the new secret caused failure, restore the previous
secret pair consistently with the Kizuna caller. A rollback resets all
memory-local cache, health, circuits, and in-flight work by design. If errors,
timeouts, memory, or restart rate remain elevated, stop NEWS 01C traffic before
retrying deploys.

Do not add a second instance as an incident response. First determine whether
the bottleneck is upstream latency/rate limiting, extraction capacity, or local
CPU/memory. Vertical scaling is the first compatible capacity change. Horizontal
scaling requires a new decision about shared cache/health/circuits/coalescing.

## Remaining NEWS 01C prerequisites

- Provision the reviewed Render service and capture its real URL/deploy ID.
- Pass the post-deploy smoke and the policy-compliant provider canary from a
  network that allows direct HTTPS egress.
- Decide the provider hostname/custom-domain lifecycle and secret rotation
  procedure with the Kizuna API deployment.
- Add the Kizuna API client, scheduling/queue/persistence/idempotency and product
  routes only in NEWS 01C; none are authorized by this phase.
