---
name: DepositSafe authentication behavior
description: Non-obvious Clerk behavior and Build 01 access boundaries.
---

Clerk's development tenant may render social sign-in controls even when the product scope is email/password only; DepositSafe hides the entire social block in the app appearance and CSS.

**Why:** Build 01 explicitly excludes social login, and leaving the default Google row visible contradicts the product scope.

**How to apply:** Preserve the email/password-only auth presentation until the authentication requirements are intentionally expanded.