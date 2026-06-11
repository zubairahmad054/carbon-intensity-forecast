## What & why

<!-- What does this change, and what problem does it solve? -->

## How

<!-- Anything non-obvious about the approach. -->

## Checks

- [ ] `pnpm exec tsc --noEmit` passes
- [ ] `python -m py_compile scripts/*.py` passes (if Python touched)
- [ ] Preserves the architecture ground rules in [CONTRIBUTING.md](../CONTRIBUTING.md)
      (one time grid, forward-signal spine, training/serving decoupled, graceful degradation)
- [ ] New DB changes arrive as a new `db/migrations/NNN_*.sql` file (never edit applied ones)
