---
name: Stripe runtime constraints
description: Native connection fields, bundled SDK resources and safe webhook ownership decisions
---

The native Stripe connection service may expose both sandbox and LIVE connections even when the Agent inventory lists only sandbox. Native settings use `secret`, `publishable` and `account_id`, not the template's `secret_key`.

**Why:** LIVE access was confirmed through the native service after the inventory gave an incomplete picture. Choosing the first connection or old field names would either select the wrong environment or falsely report no access.

**How to apply:** Select by verified account ID and key-mode prefix, fetch credentials afresh, and never print credentials. Use inventory for discovery, not as proof that the native runtime lacks a second connection.

Keep stripe-replit-sync external to the API bundle and treat its webhook management as destructive unless ownership is established.

**Why:** Version 1.0.0 resolves migrations relative to its installed module; bundling silently skips the sibling SQL directory. Its managed webhook creation also deletes untracked stripe-sync endpoints, which can belong to another project.

**How to apply:** Preserve installed SDK resource paths, refuse orphan cleanup without ownership review, reconcile existing endpoint subscriptions explicitly, and initialize schema in development. Production schema changes go through Replit Publish, not runtime DDL.

A temporary development URL is not proof of reliable external webhook delivery.

**Why:** A genuine sandbox hosted Checkout completed and produced a paid Stripe event, but external delivery to the development endpoint remained pending. Signed replay of that genuine event proved reconciliation and the paid UI, not automatic delivery.

**How to apply:** Distinguish card payment, signed replay, automatic delivery and production readiness in reports. Verify external delivery against the stable published URL before declaring live payment readiness; never use a real charge merely to test configuration.