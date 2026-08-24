# Private API contract

This document describes schema version 1 of the Kizuna News Provider boundary.
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

Public process-liveness probe. It performs no provider request, cache access, or
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
  schemaVersion: 1,
  serviceVersion: string,
  fetchedAt: ISO-8601 UTC instant,
  articles: SourceArticle[],
  sources: SourceOutcome[]
}
```

`SourceArticle`:

```text
{
  schemaVersion: 1,
  providerKey: "ann" | "animecorner" | "animetrending" | "crunchyroll",
  sourceDisplayName: string,
  providerArticleId: string | null,
  providerSlug: string | null,
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

`providerSlug` is temporary legacy metadata, not identity or a Kizuna URL.
Invalid or absent dates become `null`. HTML is reduced to plain text. Exact
duplicates are removed only within one provider using `providerArticleId`, then
the exact normalized `sourceUrl`; equal titles from distinct providers remain.

Contract limits are 500 characters for `title`, 2,000 for `excerpt`, 2,048 for
URLs, 500 for `providerArticleId`, 200 for `providerSlug`, 20 tags per article,
and 100 characters per tag. Each source contributes at most 100 articles and
the complete serialized discovery response is capped at 2 MiB. Filtering or
truncation marks that source as degraded with a stable warning.

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

Reads the process-local snapshot written by discovery runs. It never contacts a
provider.

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
    lastErrorCode: string | null
  }]
}
```

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

Stable codes currently include `UNAUTHORIZED`, `INVALID_REQUEST`,
`INVALID_JSON`, `UNSUPPORTED_MEDIA_TYPE`, `PAYLOAD_TOO_LARGE`,
`ALL_SOURCES_FAILED`, `NOT_FOUND`, and `INTERNAL_ERROR`. Provider/library errors
and stack traces never cross the boundary.

## Future: `POST /internal/v1/article-extractions`

**NOT IMPLEMENTED — NEWS 01B.4.** No route is mounted in this phase. Its future
input will be a provider-issued, signed `articleRef`; arbitrary caller-supplied
URLs will not be accepted. SSRF-safe DNS, redirect, address-range, byte-limit,
and content parsing controls must land before this route exists.
