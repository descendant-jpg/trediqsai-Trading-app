---
name: Anthropic model availability on this account
description: Claude 3 / 3.5 model names are NOT available here; list the models API before hardcoding any model id.
---

Model ids from general knowledge (and from user-supplied specs) are frequently wrong for
this account. `claude-3-haiku-20240307`, `claude-3-5-haiku-latest`, and similar Claude 3.x
names all return HTTP 404 `not_found_error` from the Anthropic API.

**Why:** A directive asked for "the lightweight `claude-3-5-haiku` (or `claude-3-haiku`)
model". Both were wired in and both 404'd at runtime, turning a working endpoint into a
502. The typecheck and unit tests passed the whole time — a bad model id is only visible
against the live API.

**How to apply:** Before hardcoding a model id, list what the key can actually reach:

```
curl -sS https://api.anthropic.com/v1/models \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01"
```

Then pick the closest available model in the class the task calls for (Haiku for cheap
one-liners, Sonnet/Opus for reasoning) rather than the literal string in the request, and
always exercise the endpoint against the real API — a green test suite with a mocked SDK
proves nothing about model availability.

Keep the id overridable by env var so a future model rename is a config change, not a
code change.
