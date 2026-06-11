# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report privately via [GitHub Security Advisories](https://github.com/zubairahmad054/carbon-intensity-forecast/security/advisories/new)
("Report a vulnerability"). You'll get a response within a few days.

## Scope

Things worth reporting:

- Anything that lets an unauthenticated caller write to the database
  (`POST /api/ingest` is the only write endpoint and is bearer-token protected
  in production via `INGEST_TOKEN`)
- Injection through API query parameters (`/api/schedule`, `/api/intensity/history`)
- Leakage of connection strings or tokens through error responses or logs

Out of scope: the public read-only API returning public grid data (that's the
point of the project), rate limiting on the free-tier deployment, and the
accuracy of the forecasts themselves.

## Supported versions

Only the latest deployment from `main` is supported — the live service
auto-deploys from it.
