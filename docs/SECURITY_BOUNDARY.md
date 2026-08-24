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
- V1 RSS traffic uses fixed HTTPS endpoints and exact host allowlists. Every DNS
  answer must be public, one validated address is pinned for the TLS request,
  and every manual redirect hop is revalidated (maximum three).
- One shared outbound client enforces two requests globally, one per host, an
  eight-second request timeout inside a 15-second provider deadline, at most
  three total attempts, status-aware retry/`Retry-After`, and a 1 MiB
  decompressed RSS ceiling.
- RSS bytes are fetched before parsing. HTML content types, DTD/entity input,
  malformed/unexpected XML, excessive item counts, and oversized fields fail or
  degrade with stable codes. Raw XML and rich `content:encoded` never leave the
  adapter.
- Disposable memory cache state holds validators, freshness, the last valid
  normalized items, and in-flight coalescing. Repeated failures open a short
  process-local circuit; restart safely loses this optimization.

## Deployment expectations

Terminate TLS at a trusted private ingress, restrict network reachability to the
Kizuna backend and operators, inject secrets through the deployment platform,
and rotate the provider secret independently. Do not expose internal routes via
a public browser origin.

## Deliberately deferred debt

Discovery-side direct feeds, DNS/pinning, redirect validation, conditional GET,
freshness, provider-aware retry, concurrency, circuit breaking, decompressed
response bounds, and XML hardening are implemented in NEWS 01B.3.

NEWS 01B.4 still owns signed `articleRef`, independent article URL validation,
article DNS/pinning and redirect controls, private/reserved address rejection,
article response bounds, HTML parser hardening, clean `contentText`, optional
structured text blocks, and provider-specific article selectors. Discovery
controls do not authorize article fetching, and no arbitrary-URL extraction
endpoint may be mounted before those separate controls exist.
