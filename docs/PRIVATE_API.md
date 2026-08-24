# Private API contract

This document describes discovery schema version 2 and article-extraction
schema version 1 of the Kizuna News Provider boundary.
All responses are JSON. Internal routes send `Cache-Control: no-store` and do
not support browser CORS.

## Authentication

Every `/internal/v1` request requires:

```http
Authorization: Bearer <KIZUNA_NEWS_PROVIDER_SECRET>
```

The secret is independent from Better Auth, browser cookies, Kizuna user
sessions, and human API keys. Missing, malformed, or wrong credentials receive
`401 UNAUTHORIZED` and `WWW-Authenticate: Bearer`.

## `GET /health`

Public function/application-liveness probe. It proves that the deployed app can
execute; it does not prove that one permanent instance exists or that upstream
providers are healthy. It performs no provider request, cache access, or
dependency check.

```json
{"status":"ok"}
```

## `POST /internal/v1/discovery-runs`

Runs every enabled V1 provider. The body may be absent or an empty JSON object.
Other fields are rejected. A partial provider failure still returns `200` with
per-source outcomes; failure of every enabled source returns
`502 ALL_SOURCES_FAILED`.

`DiscoveryRunResponse`:

```text
{
  schemaVersion: 2,
  serviceVersion: string,
  fetchedAt: ISO-8601 UTC instant,
  articles: SourceArticle[],
  sources: SourceOutcome[]
}
```

`SourceArticle`:

```text
{
  schemaVersion: 2,
  providerKey: "ann" | "animecorner" | "animetrending" | "crunchyroll",
  sourceDisplayName: string,
  providerArticleId: string | null,
  providerSlug: string | null,
  articleRef: opaque signed string,
  title: string,
  excerpt: string | null,
  publishedAt: ISO-8601 UTC instant | null,
  sourceUrl: absolute HTTPS URL,
  imageUrl: absolute HTTPS URL | null,
  tags: string[],
  language: canonical BCP-47 tag | null,
  locale: canonical BCP-47 tag | null,
  discoveryMethod: "DIRECT_RSS" | "GOOGLE_NEWS_RSS" | "DIRECT_HTML" | "OTHER",
  discoveredAt: ISO-8601 UTC instant
}
```

Discovery was deliberately bumped from schema version 1 to 2 because adding a
required `articleRef` to the strict `SourceArticle` shape is a breaking contract
change. No Kizuna client exists yet. `providerSlug` is temporary legacy
metadata, not identity or a Kizuna URL.
Invalid or absent dates become `null`. HTML is reduced to plain text. Exact
duplicates are removed only within one provider using `providerArticleId`, then
the exact normalized `sourceUrl`; equal titles from distinct providers remain.
All four enabled V1 adapters emit `DIRECT_RSS`; the wider discovery-method enum
is retained for schema compatibility with the NEWS 01B.2 contract.

Contract limits are 500 characters for `title`, 2,000 for `excerpt`, 2,048 for
URLs, 500 for `providerArticleId`, 200 for `providerSlug`, 20 tags per article,
and 100 characters per tag. Each source contributes at most 100 articles and
the complete serialized discovery response is capped at 2 MiB. Filtering or
truncation marks that source as degraded with a stable warning.

Stable discovery warnings include `INVALID_ITEM_DROPPED`,
`INVALID_DATE_DROPPED`, `DUPLICATE_ITEM_DROPPED`, `ITEM_LIMIT_REACHED`,
`EXCERPT_TRUNCATED`, `FALLBACK_USED`, `LOCALE_FALLBACK_USED`,
`STALE_CACHE_USED`, `CIRCUIT_OPEN`, and `RESPONSE_SIZE_LIMIT`. The list is
bounded and never contains an upstream message or payload.

`SourceOutcome`:

```text
{
  providerKey: ProviderKey,
  sourceDisplayName: string,
  outcome: "healthy" | "degraded" | "failed",
  articleCount: integer,
  durationMs: integer,
  warnings: string[],
  errorCode: string | null
}
```

## `GET /internal/v1/sources/health`

Reads the current process/instance-local, best-effort operational snapshot
written by discovery runs. It never contacts a provider. On serverless, the
snapshot can reset or differ between consecutive calls and must never be used as
global health or application truth. `DiscoveryRunResponse.sources` is the
authoritative outcome for that discovery command.

```text
{
  schemaVersion: 1,
  serviceVersion: string,
  sources: [{
    providerKey: ProviderKey,
    sourceDisplayName: string,
    status: "unknown" | "healthy" | "degraded" | "failed",
    lastAttemptAt: ISO instant | null,
    lastSuccessAt: ISO instant | null,
    lastOutcome: "healthy" | "degraded" | "failed" | null,
    lastArticleCount: integer | null,
    consecutiveFailures: integer,
    lastDurationMs: integer | null,
    lastErrorCode: string | null,
    lastWarningCodes: string[],
    freshUntil: ISO instant | null,
    discoveryAttempts: integer,
    upstreamAttemptCount: integer,
    successes: integer,
    failures: integer,
    cacheHitCount: integer,
    notModifiedCount: integer,
    lastAttemptCount: integer
  }]
}
```

Provider HTTP/parse errors use stable codes such as `PROVIDER_TIMEOUT`,
`PROVIDER_RESPONSE_TOO_LARGE`, `PROVIDER_INVALID_CONTENT_TYPE`,
`PROVIDER_INVALID_XML`, `PROVIDER_DNS_REJECTED`, and
`PROVIDER_REDIRECT_REJECTED`. Library messages and response content never cross
the boundary.

## Errors

```text
{
  error: {
    code: string,
    message: string,
    requestId: string
  }
}
```

Stable codes include `UNAUTHORIZED`, `INVALID_REQUEST`,
`INVALID_JSON`, `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`,
`ALL_SOURCES_FAILED`, `NOT_FOUND`, and `INTERNAL_ERROR`. Provider/library errors
and stack traces never cross the boundary.

## `POST /internal/v1/article-extractions`

Extracts one article from a provider-issued reference. The request must be JSON
and has exactly one field:

```json
{"articleRef":"opaque.signed.value"}
```

The caller cannot supply a URL, provider, hostname, selector, timeout, redirect
count, or any other operational value. Machine Bearer authentication and a
valid, unexpired `articleRef` are both required.

Synthetic response shape:

```json
{
  "schemaVersion": 1,
  "serviceVersion": "0.1.0",
  "extractedAt": "2026-08-24T12:00:00.000Z",
  "article": {
    "providerKey": "ann",
    "providerArticleId": "synthetic-id",
    "sourceUrl": "https://www.animenewsnetwork.com/news/example/.1",
    "finalUrl": "https://www.animenewsnetwork.com/news/example/.1",
    "canonicalUrl": "https://www.animenewsnetwork.com/news/example/.1",
    "title": "Synthetic article title",
    "author": null,
    "publishedAt": "2026-08-24T10:00:00.000Z",
    "language": "en",
    "selectorVersion": "ann-v1",
    "contentText": "First synthetic paragraph.\n\nSecond synthetic paragraph.",
    "blocks": [
      {"type":"paragraph","text":"First synthetic paragraph."},
      {"type":"paragraph","text":"Second synthetic paragraph."}
    ],
    "warnings": ["AUTHOR_NOT_FOUND"]
  }
}
```

The API never echoes `articleRef` and never returns HTML, DOM, image URLs,
embedded content, scripts, styles, link destinations, or subresource data.
Nullable metadata remains `null`; invalid dates never become the current time.

Stable extraction errors include `INVALID_ARTICLE_REF`,
`INVALID_ARTICLE_REF_VERSION`, `ARTICLE_REF_EXPIRED`,
`ARTICLE_PROVIDER_NOT_ENABLED`, `ARTICLE_URL_REJECTED`,
`ARTICLE_DNS_REJECTED`, `ARTICLE_REDIRECT_REJECTED`, `ARTICLE_TIMEOUT`,
`ARTICLE_RESPONSE_TOO_LARGE`, `ARTICLE_UNSUPPORTED_CONTENT_TYPE`,
`ARTICLE_HTTP_ERROR`, `ARTICLE_CIRCUIT_OPEN`, `ARTICLE_LAYOUT_UNSUPPORTED`,
`ARTICLE_CONTENT_EMPTY`, `ARTICLE_EXTRACTION_FAILED`, and
`EXTRACTION_CAPACITY_EXCEEDED`. Invalid references use `422`, capacity uses
`429`, upstream/parser failures use `502`, and the bounded timeout uses `504`.
No upstream body, URL, DNS detail, library message, stack, token, or secret is
included in the error envelope.
