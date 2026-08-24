# Security boundary

Kizuna News Provider is a machine-only process. It is not a browser backend and
does not inherit Kizuna identity.

- Internal routes require an independent bearer secret from
  `KIZUNA_NEWS_PROVIDER_SECRET` (minimum 32 printable characters).
- Discovery signs stateless article references with the separately rotatable
  `KIZUNA_NEWS_ARTICLE_REF_SECRET`; the HMAC token never replaces machine auth.
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
- Article extraction accepts only a signed opaque reference. It repeats exact
  article-host, HTTPS, DNS/public-address, pinning, and redirect validation at
  every hop; caller-selected destinations are impossible.
- Article requests have a 15-second attempt timeout inside a 20-second total
  deadline, two attempts only for transient failures, three redirects, and a
  2 MiB decompressed HTML ceiling. HTML/XHTML are the only accepted types.
- Extraction admits at most two operations globally and one request per host,
  coalesces identical in-flight references, fails excess work with `429`, and
  uses a separate three-failure/one-minute process-local circuit.
- Cheerio parses only the main response and loads no subresources. Provider
  selectors remove executable/noise elements and produce at most 80,000 plain
  text characters plus text-only semantic blocks. Raw HTML is never returned,
  persisted, cached, or logged.

## Deployment expectations

Terminate TLS at a trusted private ingress, restrict network reachability to the
Kizuna backend and operators, inject secrets through the deployment platform,
and rotate the provider secret independently. Do not expose internal routes via
a public browser origin.

## Remaining debt

Discovery-side direct feeds, DNS/pinning, redirect validation, conditional GET,
freshness, provider-aware retry, concurrency, circuit breaking, decompressed
response bounds, and XML hardening are implemented in NEWS 01B.3.

NEWS 01B.4 resolves signed `articleRef`, independent article URL validation,
article DNS/pinning and redirect controls, private/reserved address rejection,
article response bounds, HTML-to-text parsing, structured blocks, extraction
capacity/circuit controls, and four provider-specific selector fixtures.

The service is still not production-ready. NEWS 01B.5 owns hosting/runtime
measurement, deployment configuration, telemetry, operational secret handling,
and bounded live smoke. Provider policy remains an independent gate: current
Kizuna audit evidence blocks automated Crunchyroll acquisition and requires
review/clarification before automated ANN article retrieval. Technical
capability is not authorization to send production traffic.
