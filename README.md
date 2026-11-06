# Personal site template

Static starter for a one-page site. Tracked files use fictional placeholders only.

## Local identity

Copy `site.config.example.js` to `site.config.js` and replace the sample values. `site.config.js` is gitignored. The page keeps the built-in placeholders when that file is absent.

Do not commit contact details, autobiography, or private preferences. To extend the privacy check, list extra forbidden strings in the gitignored file `privacy.denylist.local`, one per line. Lines starting with `#` are ignored.

## Checks

```bash
node --test --test-concurrency=1 tests/privacy.test.mjs
```

## Publishing

The repository name is unchanged so existing host routes keep working. This template does not add a deploy workflow. Review any live publication separately.
