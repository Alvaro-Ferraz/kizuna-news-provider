# Security boundary

Kizuna News Provider is a machine-only process. It is not a browser backend and
does not inherit Kizuna identity.

- Internal routes require an independent bearer secret from
  `KIZUNA_NEWS_PROVIDER_SECRET` (minimum 32 printable characters).
- Better Auth sessions, cookies, user JWTs, and Kizuna application credentials
  are neither parsed nor accepted.
- CORS is absent. Browser preflight receives no special handling and no
  `Access-Control-Allow-*` headers.
- Only `/health` is public, minimal, and dependency-free.
- Request JSON is capped at 16 KiB and strictly validated. Discovery output is
  runtime-validated, capped at 100 items per source and 2 MiB overall.
- Source display names and provider identities are server-owned. Article source
  URLs must be HTTPS and match the source registry allowlist.
- Logs and error responses exclude bearer values, raw provider payloads,
  library error messages, response HTML, and stack traces.
- Health state is process-local memory; reading it never starts discovery.

## Deployment expectations

Terminate TLS at a trusted private ingress, restrict network reachability to the
Kizuna backend and operators, inject secrets through the deployment platform,
and rotate the provider secret independently. Do not expose internal routes via
a public browser origin.

## Deliberately deferred debt

NEWS 01B.3 owns direct-feed migration, conditional GET, provider-aware retry,
per-host concurrency, and circuit breaking. Upstream fetch response-size and XML
limits also remain to be hardened.

NEWS 01B.4 owns signed `articleRef`, SSRF-safe extraction, DNS resolution and
rebinding controls, redirect-hop validation, private/reserved address rejection,
article response byte bounds, content-type enforcement, and safe text parsing.
No arbitrary-URL extraction endpoint may be mounted before those controls exist.
