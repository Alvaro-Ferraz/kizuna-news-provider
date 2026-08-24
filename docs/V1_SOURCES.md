# V1 discovery sources

NEWS 01B.3 implements discovery only. These fixed endpoints are code-owned and
cannot be replaced through environment variables or caller input. No adapter
fetches article pages, returns article bodies, or exposes raw RSS/XML.

| Key | Display name | Method | Feed | Identity | Language / locale | Validators and freshness | Fallback |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `ann` | Anime News Network | `DIRECT_RSS` | `https://www.animenewsnetwork.com/news/rss.xml?ann-edition=us` | RSS GUID, then canonical source URL | `en` / `en-US` | `Last-Modified`; advertised `Cache-Control: max-age=14400` is honored; 10-minute local fallback freshness if no signal | none |
| `animecorner` | Anime Corner | `DIRECT_RSS` | `https://animecorner.me/feed/` | RSS GUID, then canonical source URL | `en` / `en-US` | ETag, Last-Modified, and Cache-Control when advertised; otherwise 10-minute local freshness | none |
| `animetrending` | Anime Trending | `DIRECT_RSS` | `https://anitrendz.net/news/feed/` | RSS GUID, then canonical source URL | `en` / `en-US` | ETag, Last-Modified, and Cache-Control when advertised; otherwise 10-minute local freshness | none; canonical URL removes the known happy-path redirect |
| `crunchyroll` | Crunchyroll | `DIRECT_RSS` | `https://cr-news-api-service.prd.crunchyrollsvc.com/v1/pt-BR/rss` | RSS GUID across locales, then canonical source URL | `pt` / `pt-BR` | no validators were observed; 10-minute disposable local freshness | `https://cr-news-api-service.prd.crunchyrollsvc.com/v1/en-US/rss` (`en` / `en-US`) only after a primary failure |

## Provider behavior

### Anime News Network

The old Google News site query and HTML fallback are disabled. The adapter uses
the official news-only RSS feed, keeps its direct ANN URL and GUID, converts the
short description to bounded plain text, and maps RSS categories to source
tags. Images remain nullable and are not derived from article requests.

The observed four-hour cache signal is honored rather than forcing an upstream
GET on every Kizuna command. After freshness expires, `If-Modified-Since` is
sent when a validator exists. A `304` reuses the matching memory entry; a `304`
without such an entry is the explicit `PROVIDER_NOT_MODIFIED_WITHOUT_CACHE`
failure.

### Anime Corner

The old homepage fallback is disabled. Descriptions may be short or absent and
`excerpt` is therefore nullable. Feed-provided images are validated as HTTPS;
missing/invalid images never invalidate an article and no page is fetched to
enrich them. ETag and Last-Modified values are retained in disposable memory.

### Anime Trending

The configured URL now includes the canonical trailing slash, so discovery
requires no happy-path redirect. The description supplies at most a
600-character plain-text excerpt. Rich `content:encoded` is never used as
article text; it may only be inspected for optional feed image metadata. Items
without images remain valid.

### Crunchyroll

The old Google News query and both HTML fallbacks are disabled. The adapter
requests only `pt-BR` while it is healthy. `en-US` is requested only after an
appropriate primary failure and marks the source degraded with `FALLBACK_USED`
and `LOCALE_FALLBACK_USED`. GUID is the cross-locale identity, so a Portuguese
variant wins deterministically when variants with the same GUID are compared.
The short description supplies `excerpt`; `content:encoded` is ignored as body
content. Feed media may supply an optional HTTPS image.

The separate Kizuna policy audit classifies automated Crunchyroll acquisition
as blocked pending express permission/licensing. This technical adapter does
not supersede that policy gate and must not be treated as authorization to
enable production ingestion.

## HTTP, cache, and failure semantics

- HTTPS only; exact feed/article host allowlists; caller-selected feed URLs are
  impossible.
- All DNS answers are checked against loopback, private, carrier-grade NAT,
  link-local, metadata, documentation/reserved, multicast, IPv4-mapped, and
  private/link-local IPv6 ranges. One accepted address is pinned while normal
  TLS hostname validation remains enabled.
- Redirects are manual, at most three, and repeat URL/host/DNS validation at
  every hop.
- One request may receive at most 1 MiB after Axios decompression. RSS timeout
  is eight seconds per attempt inside a 15-second provider operation deadline.
- Retry is limited to three total attempts for transient network failures, 429,
  and selected 5xx responses. Backoff is exponential with jitter;
  `Retry-After` is honored only inside the remaining deadline. 403, most 4xx,
  invalid content type, oversize, and XML/parser errors are not retried.
- At most two external requests run globally and one per host. Primary and
  fallback requests use the same limit. Concurrent calls for one source share
  one in-flight operation.
- Memory cache entries contain only normalized articles, ETag/Last-Modified,
  warnings, and freshness. Restart discards them. A stale last-valid entry may
  be returned as explicit degraded `STALE_CACHE_USED`; it is never silently
  presented as a fresh empty result.
- Three consecutive provider failures open a one-minute process-local circuit.
  Partial source failure does not abort other sources; if every enabled source
  fails, the established `502 ALL_SOURCES_FAILED` boundary remains unchanged.

## XML and normalized fields

The bounded HTTP client obtains all bytes before `rss-parser.parseString` runs;
`parseURL` is not used. DTD and entity declarations are rejected, only RSS roots
are accepted, and no external resource resolution occurs. At most 100 items are
processed. Titles, GUIDs, URLs, excerpts, tags, and the complete discovery
envelope retain the NEWS 01B.2 contract bounds; excerpts target 600 characters.

Titles preserve editorial case and punctuation after entity/whitespace cleanup.
Dates come only from provider fields; invalid values become `null`, never the
current time. Exact identities are suppressed only inside one provider. Equal
titles from different providers remain separate for future Kizuna story
grouping.

## Known limitations

Cache, source health, semaphores, and circuits are process-local and reset on
restart. Live feed structure and validators may change; fixture tests establish
the supported shape, not an eternal upstream contract. Article extraction,
signed `articleRef`, article SSRF/redirect/DNS controls, article byte limits,
HTML selectors, `contentText`, and structured blocks remain NEWS 01B.4.
