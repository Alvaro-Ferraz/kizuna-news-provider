# Serverless state model

NEWS 01B.5A treats process replacement, scale-to-zero, and concurrent instances
as normal. PostgreSQL will be Kizuna's durable truth and BullMQ will own future
scheduling/admission. The provider remains a command-only hostile-input adapter
with no database, Redis, Valkey, Durable Object, filesystem state, or cron.

## State audit

| State | Current implementation | Cross-instance? | Correctness dependency? | Cold/multiple-instance behavior | Acceptable / change |
| --- | --- | --- | --- | --- | --- |
| RSS cache | Per-app `Map`, normalized max 100 items/feed | No | No | Cold app performs a full bounded fetch; instances may fetch independently | Yes; registry now constructs a provider per app factory |
| ETag/Last-Modified | Stored with each RSS cache entry | No | No | Missing validator produces a normal unconditional GET | Yes; optimization only |
| Source health | Per-app `SourceHealthStore`, one record/source | No | No | Resets to `unknown`; snapshots can differ between requests | Yes; documented instance-local/best-effort |
| Extraction metrics | Per-app counters/source | No | No | Reset/fragment and cannot be aggregated as service metrics | Yes; structured platform logs complement them |
| Discovery circuit | Per RSS provider, threshold 3/cooldown 60s | No | No | Fresh instance starts closed and retains deadlines/retries | Yes; local defense only |
| Extraction circuit | Per extraction service/source, threshold 3/cooldown 60s | No | No | Fresh instance starts closed | Yes; local defense only |
| Global/per-host HTTP semaphores | Process-local clients, limits 2/1 | No | No | Bounds only the current instance; platform may run other instances | Yes with caller admission below |
| Extraction capacity | Per-app semaphore, capacity 2 | No | No | Bounds only the current app; excess local work returns 429 | Yes with bounded caller concurrency |
| Discovery coalescing | One in-flight promise per app/source and whole run | No | No | Equal same-instance work coalesces; other instances may duplicate it | Yes |
| Extraction coalescing | Per-app map keyed by articleRef digest | No | No | Equal same-instance work coalesces; other instances may duplicate it | Yes |

Cache/circuit loss can increase upstream requests or remove stale fallback data,
but cannot fabricate state or invalidate a successful response. A provider
failure on a cold fetch remains an explicit failed `SourceOutcome`; it is not a
correctness dependency on an old cache entry.

## Stateless article references

An `articleRef` is a versioned canonical JSON payload plus HMAC-SHA256. It embeds
provider-owned identity, allowlisted canonical URL, locale, issuance and expiry,
and is verified with timing-safe comparison. It does not contain or depend on a
slug, discovery cache entry, health record, circuit, metric, or app instance.

A reference issued by instance A is valid on fresh instance B when both use the
same `KIZUNA_NEWS_ARTICLE_REF_SECRET`. Rotation intentionally invalidates old
references. Extraction repeats provider enablement, HTTPS/host, DNS, public-IP,
redirect, pinning, content type, timeout, and decompressed-size checks after
token verification.

## Admission and authoritative outcomes

Future Kizuna BullMQ is the primary global workload admission controller:

- discovery worker concurrency **must be 1** and emits one discovery command,
  not one HTTP request per source;
- extraction uses bounded low worker concurrency, selected in NEWS 01C.2;
- provider semaphores and coalescing are instance-local defense in depth;
- `DiscoveryRunResponse.sources` is authoritative for that run;
- `/internal/v1/sources/health` is never a source of truth or scheduling input.

This design accepts bounded duplicate upstream work if caller admission is
misconfigured or two requests land on different instances. It does not add a
distributed lock or shared cache merely to optimize disposable state.

## Request and lifecycle semantics

`GET /health` proves only that the function/app can execute. Every request has
its own validated/generated request ID, and logs do not depend on process
lifetime for correlation. All responses use `Cache-Control: no-store`; internal
JSON is never edge-cacheable. Graceful SIGTERM remains in `server.js` for Docker
fallback but is not a correctness mechanism in serverless.

Vercel may reuse one instance and Fluid Compute may execute requests concurrently
inside it, or it may start another instance and later remove all instances.
Code must be correct under every case. The provider does not rely on platform
request replay and defines no platform-specific retry.

## Revisit conditions

Revisit shared state only when evidence shows significant amplification, global
admission cannot remain in Kizuna, multiple callers require coordination,
instance-local diagnostics become operationally insufficient, or paid hosting
becomes acceptable. Hosting can move back to the preserved Docker artifact
without changing the private HTTP contract.
