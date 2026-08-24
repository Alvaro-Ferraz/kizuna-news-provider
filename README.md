# Kizuna News Provider

Private backend-to-backend news discovery service for Kizuna. This fork is based
on [AniNewsAPI](https://github.com/Shineii86/AniNewsAPI) by Shinei Nouzen and
retains its MIT license and attribution in [NOTICE.md](NOTICE.md).

**Status:** NEWS 01B.2 — private service boundary complete. It is not yet wired
into the Kizuna application. Direct-feed provider hardening is NEWS 01B.3 and
safe article extraction is NEWS 01B.4.

The runtime surface is intentionally small:

- `GET /health` — public process liveness only;
- `POST /internal/v1/discovery-runs` — authenticated discovery command;
- `GET /internal/v1/sources/health` — authenticated in-memory health snapshot.

There is no landing page, browser API, CORS support, public news/search/RSS
endpoint, cache-clear endpoint, or mounted article-extraction route.

## Local setup

Requires Node.js 20 or newer.

```bash
npm ci
cp .env.example .env
```

Set `KIZUNA_NEWS_PROVIDER_SECRET` to an independent, printable secret of at
least 32 characters. In production, `ENABLED_SOURCES` is also mandatory and may
contain only `ann`, `animecorner`, `animetrending`, and `crunchyroll`.

```bash
npm start
```

`npm start` reads environment variables from the process; it does not load
`.env` automatically. Never commit the secret or reuse a Kizuna user/session
credential.

## Checks

```bash
npm run lint
npm test
npm run build
```

Ordinary tests prohibit external network access. `npm run test:live` is a
separate, explicit provider-network smoke test and requires
`ALLOW_LIVE_PROVIDER_TESTS=true` plus the machine secret.

See [docs/PRIVATE_API.md](docs/PRIVATE_API.md) for the wire contract,
[docs/SECURITY_BOUNDARY.md](docs/SECURITY_BOUNDARY.md) for trust boundaries and
known debt, and [docs/FORK_BASELINE.md](docs/FORK_BASELINE.md) for fork history.
