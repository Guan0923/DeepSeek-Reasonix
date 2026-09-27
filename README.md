# Reasonix Website

This branch contains only the public Reasonix website and documentation portal.

- Website source: `site/`
- Website validation: `.github/workflows/site-ci.yml`
- Production publication: `.github/workflows/pages.yml`

Product clients live on `main-v2` and `studio`. Shared APIs, identity, telemetry,
and registry services live on `platform`.

## Local development

```sh
cd site
npm ci
npm test
npm run dev
```

Production publication is manual and accepted only from the `website` branch.
