---
name: Companies House search behavior
description: Real public search can return broad partial matches for fabricated multiword names
---

Do not assume a fabricated multiword company name will produce zero Companies House matches.

**Why:** Live development testing with common words and a year produced a large set of partial matches even though the full fabricated name did not exist. A single uncommon token produced a reliable no-match response.

**How to apply:** Preserve explicit company selection and show name/number together; do not silently choose the top hit or treat search ranking as exact identity. For no-match UI tests, use a single unique token without common words, and assert the provider returned no items before expecting the empty state.