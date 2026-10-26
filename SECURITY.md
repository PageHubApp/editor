# Security policy

## Reporting a vulnerability

Email **security@pagehub.dev** with a description and, if you can, a minimal reproduction.
Please don't open a public issue for a vulnerability. You will get an acknowledgement within
three working days, and we will agree a disclosure date with you once the fix is ready.

## Supported versions

The project is pre-1.0. Only the latest published version of each package receives fixes.

## Scope

In scope:

- the template renderer and its sandbox (`@pagehub/engine`): escaping, the Liquid runtime, resource limits;
- `checkContentOnly` and the sanitizer, which keep untrusted markup out of rendered pages;
- the CLI and dev server: the address they bind to, and path traversal through the file API;
- the published-site runtime script (`@pagehub/site-runtime`).

Out of scope: vulnerabilities in third-party dependencies with no exploitable path through this
code (report those upstream), and issues that need a malicious site author to already control the
site's own source.
