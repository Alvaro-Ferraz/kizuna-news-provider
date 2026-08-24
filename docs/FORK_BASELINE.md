# Fork baseline

> NEWS 01B.2 update (2026-08-24): the audited public AniNewsAPI product surface
> has been removed from runtime. Only private discovery/source-health routes and
> minimal public liveness remain. The 13 upstream fetchers are still preserved;
> only the four approved V1 identities can be enabled by the private registry.

## Snapshot

| Field | Value |
| --- | --- |
| Project | Kizuna News Provider |
| Upstream repository | `https://github.com/Shineii86/AniNewsAPI.git` |
| Upstream branch | `main` |
| Initial fork base | `22cee66e01cc5158cb96b69794f2351487fba7e4` |
| Upstream version | `5.1.0` |
| Fork date | 2026-08-24 |
| License | MIT; upstream `LICENSE` and copyright preserved |
| Supported runtime | Node.js `>=20.x` |
| Local baseline runtime | Node.js `v22.23.2`; npm `11.2.0` |
| Package manager | npm with lockfile version 3 |
| Language/framework | JavaScript and Express |
| Current source count | 13 |

The upstream commit was confirmed on `upstream/main` before this baseline was
created. The fork intentionally starts from that commit rather than a later
revision.

## Source policy

Planned V1 sources:

- `ann` - Anime News Network
- `animecorner` - Anime Corner
- `animetrending` - Anime Trending
- `crunchyroll` - Crunchyroll

Every other upstream registry entry remains in the repository for later review
and is planned as disabled/future. Runtime source enablement is intentionally
deferred because NEWS 01B.1 does not redesign the provider boundary.

## Deterministic baseline

`npm test` uses the Node.js built-in test runner. A required bootstrap replaces
`fetch`, `http.get`, `http.request`, `https.get`, and `https.request` with
fail-fast guards before test files load. The baseline tests prove that package
metadata and the source registry load, the complete thirteen-source registry is
preserved, the four V1 keys exist, and utility-module imports initiate no
network access.

The upstream live integration script is preserved at
`scripts/live-smoke.js`. It is excluded from ordinary tests and CI and exits
before requests unless `ALLOW_LIVE_PROVIDER_TESTS=true` is supplied explicitly.
It was not run while establishing this baseline.

The existing `npm run build` script is an upstream no-op because this JavaScript
service has no compilation step. CI nevertheless runs it to detect an upstream
script regression. Docker remains an optional packaging verification.

## Known architecture debts retained from upstream

This baseline is not production-ready. It deliberately retains:

- the public multipurpose API and broad CORS behavior;
- public refresh and cache-clear behavior;
- the existing memory/JSON-disk cache and TTL behavior;
- unstable process-local slugs;
- title-based cross-source deduplication;
- unsafe article HTML output;
- incomplete SSRF, redirect, DNS, response-size, and XML controls;
- unbounded RSS behavior;
- provider errors swallowed as empty arrays;
- health/source observations that can trigger external fetching;
- divergent Vercel-function and standalone Express behavior;
- the `server.js` import-time listening side effect;
- upstream landing pages and creator branding.

These debts are recorded, not accepted as production behavior. They are scoped
to NEWS 01B.2 through NEWS 01B.4.

## Upstream synchronization

Upstream changes never flow automatically to production. Use a reviewed branch:

```sh
git fetch upstream
git checkout -b chore/review-upstream-<date>
git log --oneline HEAD..upstream/main
git diff HEAD...upstream/main
```

After reviewing license, changelog, fetchers, security-sensitive behavior, and
the complete diff, merge or cherry-pick deliberately, run CI, and submit the
normal review. Do not force-push or auto-merge upstream.

## Roadmap

- NEWS 01B.1 - fork baseline
- NEWS 01B.2 - private service boundary
- NEWS 01B.3 - V1 providers
- NEWS 01B.4 - article extraction hardening
- NEWS 01B.5 - self-host readiness
- NEWS 01C - Kizuna integration

NEWS 01B.1 through NEWS 01B.4 are complete. Discovery uses the four bounded V1
direct-feed adapters and now issues signed, cache-independent references for
the separate hardened text-only extraction command. NEWS 01B.5 self-host
readiness remains the next phase; no deployment or Kizuna integration is part
of this baseline document.
