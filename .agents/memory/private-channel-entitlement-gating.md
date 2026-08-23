---
name: Private channel entitlement gating
description: Rules for granting access to paid external Telegram channels.
---

Private Telegram channel actions must be shown only for an authenticated user with a current entitlement. A cancelled recurring store subscription loses channel access immediately, even if its nominal expiration date is still in the future; an explicitly configured lifetime purchase remains valid. Cached entitlement state must never authorize an external private link.

**Why:** The product requirement is to keep paid channels private after cancellation or lapse. A cached tier or delayed store webhook can otherwise leave an external channel link visible after access should be removed.

**How to apply:** Treat live RevenueCat entitlement data and server-granted/manual lifetime access as separate allow paths. Explicitly reject absent, expired, and cancelled recurring entitlements before exposing channel actions; preserve configured lifetime entitlements.