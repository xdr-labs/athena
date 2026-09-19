# Rick Engineering KB

This fork turns Athena into a central, self-hosted knowledge layer for multiple
XDR Labs and Data Relay projects.

## Authority model

GitHub and each project's OpenSpec remain authoritative.

Athena/Wiki.js is a **derived retrieval layer**. A page under
`projects/<project>/canonical-source-of-truth` must never redefine product
behavior. If Wiki.js disagrees with OpenSpec, OpenSpec wins.

## Data flow

```text
Project repository
  ├─ code / tests / E2E
  ├─ OpenSpec current specs
  ├─ OpenSpec decision archive
  └─ knowledge/CANONICAL_SOURCE_OF_TRUTH.md
                    |
                    v
           one-way GitHub sync
                    |
                    v
              Athena / Wiki.js
                    |
          keyword + pgvector search
                    |
             ChatGPT / Cursor
```
## Security hardening in this fork

- MCP defaults to `wiki.read`.
- Mutation tools are not registered without `wiki.write`.
- Search accepts a project/path prefix.
- Known vulnerable transitive dependencies are overridden to fixed versions.
- CI runs `bun audit`.
- GitHub Actions in the main CI workflow are commit-SHA pinned.
- Wiki.js/Postgres/indexer remain private behind the reverse proxy by default.

## Project namespaces

Canonical pages use:

```text
projects/data-relay-link/...
projects/data-relay-control/...
projects/dp-os-upgrade/...
projects/detection-scenario-platform/...
projects/<future-project>/...
```

The number of projects is not tied to a SaaS source-count quota.
## Adding a project

1. Add or generate `knowledge/CANONICAL_SOURCE_OF_TRUTH.md` in the project repo.
2. Add one entry to `knowledge-sources.json`.
3. Run `scripts/sync-github-knowledge.ts`.
4. Verify the generated Wiki page and project-scoped retrieval.

Do not dump an entire repository into the KB by default. Code remains in GitHub
and is queried there when implementation detail is needed. The KB should carry
current contract, decisions, rationale, architecture, and qualified operational
knowledge.

## Current POC

The first source is Data Relay Link from
`datarelay-labs/data-relay-link`.

POC acceptance requires:

- dependency audit: zero known vulnerabilities
- unit/regression tests: pass
- GitHub canonical source sync: pass
- project-scoped semantic retrieval: pass
- read-only MCP client cannot mutate Wiki pages
- browser Wiki remains usable by a human
- backup/restore path validated before production exposure
