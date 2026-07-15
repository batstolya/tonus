# Chat Session Ownership Hardening Plan

1. Add failing shared-helper tests for owner lookup, Telegram stale-session
   replacement, and owner-scoped history.
2. Implement the shared ownership helpers and safe oversized-input stop.
3. Apply the helpers to `chat-health` and `telegram-bot`; scope all relevant
   reads and updates by authenticated owner.
4. Add client header/CORS coverage, exact npm dependency pins, and a frozen
   transitive `deno.lock` gate required by the release wrapper.
5. Add separate two-user production smokes for browser and Telegram ownership,
   positive safe-stop controls, CORS where applicable, and row cleanup proof.
6. Run focused tests, the complete repository gate, independent security
   reviews, and an exact-SHA detached-checkout gate.
7. Publish a stacked draft PR. Deploy only functions whose independent review
   and black-box smoke contract are complete; retain sanitized receipts.
