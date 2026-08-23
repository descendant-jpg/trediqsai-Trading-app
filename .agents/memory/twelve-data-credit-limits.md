---
name: Twelve Data credit limits
description: Provider quota constraint for the live stock marquee's batch quote request.
---

The configured Twelve Data access allows eight API credits per minute. Keep the marquee batch at eight symbols (AAPL, MSFT, NVDA, AMZN, GOOGL, META, TSLA, and QQQ); adding a ninth symbol exceeds the limit.

**Why:** Direct provider verification returned HTTP 429 for a nine-symbol request and reported an eight-credit current-minute limit. The corrected eight-symbol request later returned HTTP 200.

**How to apply:** Do not treat quota errors as a client parser or CORS failure. Poll no more than once per minute and ensure every request sharing this API key stays within the eight-credit limit; use higher-capacity access before expanding the batch.