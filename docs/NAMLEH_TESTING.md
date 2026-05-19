# Namleh Testing Profile

This checkout is the isolated Namleh test track for gstack. Keep it separate from `namleh-codex` while we test day-to-day fit.

## Current Scope

- Upstream PR #1592 code/test commits are applied.
- Upstream PR #1594 code/test commits are applied.
- PR #1594 release-only `VERSION` and `CHANGELOG.md` commits were skipped because PR #1592 already changed that release metadata.
- Namleh-specific generated skills target `.namleh-gstack/` locally and `~/.codex/skills/namleh-gstack` globally.
- Namleh generated commit guidance may include the normal Codex `Co-Authored-By` trailer.
- Namleh state can live in `~/.gstack-namleh` instead of the normal `~/.gstack` profile.
- `./bin/namleh-gstack-profile` creates the ignored `.namleh-gstack/skills/gstack` runtime sidecar.

## Test Setup

```bash
./bin/namleh-gstack-profile
export GSTACK_HOME="$HOME/.gstack-namleh"
bun run gen:skill-docs --host namleh-codex
```

The generated output is ignored by git at `.namleh-gstack/`.

## Boundaries

- Do not install this into the production Namleh Codex plugin yet.
- Do not wire it into Namleh MCP registration until the workflow proves useful.
- Do not store credentials in gstack config. Namleh credentials stay in Vault.
- Do not force-push `main`.
- Codex co-author trailers are allowed for Namleh commits.
