# Telegram Link Token RLS Hardening Plan

1. Reproduce cross-user token access with synthetic users and verified cleanup.
2. Add a failing migration contract test.
3. Add the append-only RLS and least-privilege migration.
4. Add a two-user production smoke and fake-network unit coverage.
5. Run the repository gate, linked schema check, migration dry-run, and review.
6. Apply the migration, run the protected live smoke, and retain sanitized
   evidence without credentials or fixture identifiers.
