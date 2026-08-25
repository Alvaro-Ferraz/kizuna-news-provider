# Article extraction boundary

NEWS 01B.4 implements a private, transient HTML-to-text boundary for the
supported providers. It does not implement summaries, translation, classification,
anime matching, story grouping, persistence, queues, a Kizuna client, frontend,
or deployment.

## Lifecycle and article reference

Discovery schema version 2 adds one required opaque `articleRef` to every valid
V1 `SourceArticle`. The token format is:

```text
base64url(canonical-json-payload).base64url(hmac-sha256-signature)
```

The fixed-order payload contains `version`, `providerKey`, nullable
`providerArticleId`, `canonicalSourceUrl`, nullable `locale`, `issuedAt`, and
`expiresAt`. It contains no HTML, excerpt, title, selector, caller input, or
secret. Version 1 references live for 72 hours, verification allows 60 seconds
of clock skew, and any correctly signed payload declaring more than seven days
is rejected. Input is bounded to 4 KiB before decoding. Signature comparison is
timing-safe.

`KIZUNA_NEWS_ARTICLE_REF_SECRET` is mandatory, has no default, contains at least
32 printable bytes, and is independent from `KIZUNA_NEWS_PROVIDER_SECRET`.
References are stateless and remain valid after discovery cache eviction or
process-local cache loss. The caller treats them only as opaque strings.

## Outbound security and HTTP limits

After signature/schema/expiry/provider validation, extraction repeats the
following checks immediately before every connection and redirect hop:

- absolute HTTPS URL, no URL credentials, and exact provider article-host
  allowlist;
- DNS resolution where every answer must be public;
- rejection of loopback, unspecified, private, carrier-grade NAT, link-local,
  metadata, documentation/reserved, multicast, IPv4-mapped private IPv6,
  IPv6 loopback, unique-local, and link-local ranges;
- pinning one validated address into the HTTPS agent while preserving the
  original hostname for Host, SNI, and certificate verification;
- manual redirects, maximum three, with the same checks repeated at every hop.

Article HTTP settings are a 15-second per-attempt timeout inside a 20-second
operation deadline, at most two attempts, and a 2 MiB body ceiling counted
after Axios gzip/deflate/Brotli decompression. Canonical pages accept only
`text/html` and `application/xhtml+xml`. A recognized Crunchyroll Next.js shell
may additionally request `application/json` from the fixed, server-owned
Crunchyroll News API host. Its locale and full story slug are derived from the
already verified canonical URL; caller input cannot select the host, route
family, or content type. The same DNS validation, address pinning, redirect
checks, deadline, retries, concurrency, and 2 MiB ceiling apply. `429`, selected
`5xx`, and transient network failures may retry; `Retry-After` is honored only
when it fits the total deadline. `403`, `404`, invalid URL/DNS/content type,
oversize, and deterministic parser failures do not retry.

At most two extraction operations run globally and the shared article client
allows one external request per host. Excess distinct work fails immediately
with `EXTRACTION_CAPACITY_EXCEEDED`; equal in-flight references coalesce. Three
consecutive transient availability failures open a separate one-minute
extraction circuit and do not contaminate RSS discovery state. Only timeout,
operation deadline, network/transport, and selected upstream `5xx` failures
count. Deterministic reference, policy, URL/DNS/redirect, content-type/size,
layout, empty-content, parser, `403`/`404`, and rate-limit outcomes do not count.
Process-local metrics keep attempts, successes, failures, last success, last
error, and last duration per provider.

## Provider selectors

All V1 paths fail closed when their specific roots disappear; a generic article
fallback is deliberately not used.

| Source | Selector version | Article root candidates | Title | Author | Date | Provider noise removed | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ANN current | `ann-v2` | `#content-zone .KonaBody .meat` | `#page_header` | scoped page-title author | scoped page-title time | encyclopedia/sidebar/share/related/forum modules plus common noise | current fixture supported; `ann-v1` retained |
| Anime Corner | `animecorner-v1` | `article .entry-content`, scoped single-post entry | entry/post `h1` | author name/`rel=author` | scoped time/entry date | Jetpack related, sharedaddy, ad/code blocks, tags/author box plus common noise | fixture supported |
| Anime Trending current | `animetrending-v2` | scoped `.td-post-content` | entry/title `h1` | scoped author name | scoped time | sharing, recommendations, ad/post footer modules plus common noise | current fixture supported; `animetrending-v1` retained |
| Crunchyroll historical | `crunchyroll-v1` | owned data attribute, article body, rich text | article/data-attribute `h1` | owned author attribute/byline | scoped time/date attribute | related/share/promo/CTA modules plus common noise | historical fixture retained |
| Crunchyroll current | `crunchyroll-v2` | recognized empty Next.js `#app` shell, then `story.content.body` rich-text components | `story.content.headline` | referenced `rels[].content.component=author` | `story.content.article_date` | images, columns without rich text, cards, banners, Twitter/YouTube embeds, and unknown components | `latest/generalnews`, `announcements/announcement`, and `interviews/interviews` supported; production acquisition remains policy blocked |
| MyAnimeList | `myanimelist-v1` | `.news-container .content.clearfix` | scoped news title | scoped news information | nullable | common noise; provider-specific line-break paragraphs | fixture supported |
| Otaku USA | `otakuusa-v1` | scoped GeekMag post content | page title | scoped post author | validated Article JSON-LD | related posts, author box, top bar plus common noise | fixture supported |
| Anime Herald | `animeherald-v1` | `article .entry-content` | entry title | entry author | entry time | support/share/author modules plus common noise | fixture supported |

Common removal covers scripts, styles, noscript, iframe, SVG, canvas, forms and
controls, object/embed, navigation, footer, aside, advertisements, newsletters,
sharing, related content, recommendations, and comments.

## Text contract

Cheerio parses only the buffered main HTML response and does not execute
JavaScript or load images, CSS, scripts, frames, fonts, or other subresources.
For `crunchyroll-v2`, the extractor does not execute or return Next.js scripts.
It reads the official story JSON through the fixed request described above and
walks only Storyblok `richtext` nodes for paragraphs, headings, lists, and
quotes; embedded blocks and media components are ignored.
The selected DOM is discarded after extracting inner text from headings,
paragraphs, list items, and blockquotes. Anchor text may remain as text, but
`href`, image sources, styles, handlers, and all other markup are omitted.

The response contains `contentText` with blank-line boundaries and text-only
`blocks` of `heading`, `paragraph`, `list`, or `quote`. Content is capped at
80,000 characters and 500 blocks; useful overflow truncates with
`CONTENT_TRUNCATED`. Fewer than 200 useful characters and common challenge/
access-denied text fail with `ARTICLE_CONTENT_EMPTY`.

Title, author, and date use only provider-scoped selectors. Author and date are
nullable and emit `AUTHOR_NOT_FOUND` or `PUBLISHED_AT_NOT_FOUND`. A canonical
link is returned only when it is HTTPS and belongs to the same provider
allowlist. Language prefers a valid document `lang`, then the reference locale;
there is no NLP guess. Invalid dates never become `now`.

Raw HTML is never returned, persisted, cached, or logged. Extracted text is
transient input for a future Kizuna-owned processing phase and is not intended
for direct browser delivery or republication.

## Policy and operational limitations

Technical support does not grant content rights. The current Kizuna policy
audit blocks automated Crunchyroll discovery/article acquisition pending
express permission or compatible licensing. Automated ANN article fetching is
`REVIEW_REQUIRED`; its conditional RSS discovery status does not authorize page
retrieval. No ordinary test or implementation step in NEWS 01B.4 sends live
article traffic. NEWS 01B.5 must not erase these independent policy gates.
