# Zero-cost hosting decision

Decision and consultation date: 2026-08-24. Gate: **ZERO-COST DEPLOYMENT READY**,
not deployed. Fixed additional monthly infrastructure cost: **R$ 0**.

## Decision

Use Vercel Hobby with the Node.js runtime, Fluid Compute, the generated
`*.vercel.app` hostname, and one Express application exported by root `app.js`.
This decision applies only while Kizuna is operated as a personal/non-commercial
project and remains within Hobby limits. Current repository evidence describes a
foundation-stage project and no monetization; the operator must reassess before
commercial use. Vercel Hobby Terms permit only personal/non-commercial use.

No service, account plan, payment method, domain, database, Redis, scheduler, or
paid add-on was created in NEWS 01B.5A.

## Current official platform facts

All sources below were consulted on 2026-08-24.

| Fact | Vercel official source | Architectural relevance |
| --- | --- | --- |
| Hobby is free and has no billing cycle; included Fluid usage is 4 CPU-hours, 360 GB-hours memory, and 1,000,000 invocations | [Hobby Plan](https://vercel.com/docs/plans/hobby), [Fluid pricing](https://vercel.com/docs/functions/usage-and-pricing) | No fixed cost or Hobby on-demand compute charge; usage exhaustion can stop service |
| Hobby is personal/non-commercial only and can be changed or discontinued | [Terms of Service, Hobby Plan](https://vercel.com/legal/terms) | Hard eligibility/revisit gate |
| Express deploys with zero configuration as one Vercel Function and scales up/down | [Express on Vercel](https://vercel.com/docs/frameworks/backend/express) | Same routes/middleware/error boundary; no per-route rewrite |
| Functions scale to zero; warm instances can be reused and Fluid may run concurrent invocations in one instance | [Functions](https://vercel.com/docs/functions), [Fluid Compute](https://vercel.com/docs/fluid-compute) | Process state is opportunistic and possibly shared concurrently, never durable/global |
| Fluid Hobby Node functions default/max at 300 seconds, 2 GB/1 vCPU; bundle limit 250 MB; body/response payload limit 4.5 MB | [Function limits](https://vercel.com/docs/functions/limitations) | Provider 15/20-second deadlines and 2 MiB discovery boundary fit with margin |
| Node 22.x is supported; Node runtime supports all Node APIs | [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Node runtime](https://vercel.com/docs/functions/runtimes/node-js) | `crypto`, `dns.promises`, `net`, custom `https.Agent`, Axios, Cheerio, RSS Parser, and Zod remain supported |
| Environment variables are encrypted at rest and scoped by deployment environment | [Environment Variables](https://vercel.com/docs/environment-variables) | Both secrets remain server-only and production-scoped |
| Runtime logs exist on all plans; Hobby retention is currently one hour | [Runtime Logs](https://vercel.com/docs/logs/runtime) | Existing structured logs suffice initially; no paid observability added |

The 4.5 MB platform response limit is above the provider's 2 MiB serialized
discovery ceiling. Article request JSON is capped locally at 16 KiB. Article HTML
is outbound input only and capped after decompression at 2 MiB.

Discovery starts all enabled sources concurrently. Each source has one shared
15-second operation deadline, including Crunchyroll fallback; normalization is
bounded to 100 items per source and a 2 MiB output. Its network upper bound is
therefore approximately 15 seconds plus bounded parse/serialization and cold
start overhead. Extraction has a 20-second outbound deadline plus bounded
Cheerio parsing of at most 2 MiB. The 300-second Fluid limit has ample margin.

## Compatibility result

| Requirement | Result | Evidence |
| --- | --- | --- |
| Express / one app factory | PASS | `app.js` and `server.js` both use `createApp()` |
| Node 22 | PASS | package engine `22.x`; officially supported |
| HMAC / timing-safe compare | PASS | Node `crypto`; offline articleRef and auth tests |
| DNS validation | PASS | full Node API; public-address test suite |
| Pinned HTTPS agent | PASS | Node `https.Agent.lookup`; transport tests preserve pinning/TLS hostname |
| Axios/Cheerio/RSS/Zod | PASS | ordinary Node dependencies and offline suite |
| Article extraction | PASS | fresh-instance extraction fixture succeeds |
| Function duration | PASS | 15/20-second app deadlines vs 300-second Fluid limit |
| Response size | PASS | 2 MiB app ceiling vs 4.5 MB platform payload limit |
| Secret environment | PASS | production-scoped encrypted environment variables |
| Static/CDN behavior | PASS | one dynamic Express Function; all responses set `no-store` |

No Edge runtime, CORS, public frontend, platform scheduler, storage, distributed
semaphore, or platform-specific retry was added.

## Limited alternative comparison

| Criterion | Vercel Hobby (chosen) | Render Free (alternative) |
| --- | --- | --- |
| Fixed monthly cost | R$ 0 within Hobby inclusion | R$ 0 instance price |
| Eligibility | Personal/non-commercial only | Officially for hobby/testing; docs say not for production |
| Idle behavior | Scale-to-zero; Fluid warm reuse/concurrency is opportunistic | Spins down after 15 minutes; wake takes about one minute |
| Duration | 300 seconds with Fluid | Web responses may run far beyond provider deadlines |
| State | Instance-local and disposable | Instance-local and lost on spin-down/restart |
| Express | Official zero-config single Function | Native Node/Express or Docker Web Service |
| Memory | 2 GB / 1 vCPU | Instance-dependent; free compute is smaller and not needed for correctness |
| Outbound HTTPS | Full Node runtime | Supported; counts toward included outbound bandwidth |
| Secrets/logs | Environment scopes; Hobby runtime logs | Environment variables; log streams |
| Cost over limit | Hobby has no on-demand compute pricing | Docs state supplementary outbound bandwidth can be billed |
| Background BullMQ caller fit | Strong: cold start is outside browser read path | Functional, but ~one-minute wake requires a larger caller timeout |

Render sources, consulted 2026-08-24:
[Free services](https://render.com/docs/free),
[Web Services](https://render.com/docs/web-services), and
[Docker](https://render.com/docs/docker).

Render Free is not selected because its official non-production guidance,
minute-scale wake, shared 750-hour workspace quota, and possible outbound
bandwidth billing are weaker against the approved zero-cost operational rule.

## Revisit triggers

Reopen hosting before any of these occurs: commercial use, Hobby ineligibility
or quota exhaustion, material scheduling impact from cold starts, meaningful
cross-instance upstream amplification, more than one Kizuna discovery worker,
need for globally coherent operational state, or approval of paid infrastructure.
