# Repository

Placeholder repository. Do not commit contact details, personal history, or private preferences.

`.env` and `privacy.denylist.local` are ignored. The denylist is one forbidden string per line. Lines starting with `#` are ignored.

## Checks

```bash
node --test --test-concurrency=1 tests/privacy.test.mjs
```
