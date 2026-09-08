# BiedBot Edge development contract

Read docs/RELEASE_STATUS.md, docs/GESPREKSLOGICA_MAPPING.md and docs/CODEX_HANDOFF.md first.

The latest user-supplied deterministic state-machine section is authoritative. Do not resurrect the legacy fabricated-market-research prompts. Preserve max two probes / three concessions / handoff, truthful company identity, latest confirmed price and safety caps.

Run `npm run check`, `npm test`, `npm run test:dom`, and `npm run test:browser`. Never rename a blocked or mock-only test as a passing live test. Preserve old results and report scope.

Never silently enable real contacts, payments, an API key, hosted endpoints or subscriptions. Do not add account farms, proxies, fingerprint spoofing or CAPTCHA evasion. Do not delete release gates merely to make UI green. Build the integration and gather actual acceptance evidence.

Keep price decisions deterministic, money integer, side effects outboxed before dispatch, uncertain dispatch stopped, not blindly retried. Latest seller messages, opt-out and terminal handoff override queued work.

No publisher secrets in dealer files. No database changes to an original BiedBot deployment: this is an independent rebuild until a specific original repository is provided/identified. Do not claim any external Codex or background run was started when only a local script ran.
