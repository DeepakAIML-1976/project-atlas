# Project Atlas

A consent-first enterprise digital twin workspace for Oil & Gas EPC teams, with web and mobile companions.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (binds to `PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — shared API contract; regenerate clients after edits.
- `lib/db/src/schema/atlas.ts` — workspace, twin, evidence, activity, and review records.
- `artifacts/api-server/src/routes/atlas*.ts` — authenticated Atlas features.
- `artifacts/atlas-web` and `artifacts/atlas-mobile` — web and mobile clients.

## Architecture decisions

- A person must confirm permission to use a source and separately consent to profile analysis. Analysis also requires a fresh explicit request; suggestions are evidence-linked and never auto-applied.
- Consequential decisions always require human review, regardless of the selected autonomy ceiling.
- Live enterprise connectors, meeting attendance, autonomous execution, and SSO/SCIM are outside the first release.

## Product

Signed-in workspace onboarding, twin calibration, private evidence sources, meetings and actions, reviewed decisions, memory search, knowledge links, and governance activity. Web and mobile share the same API and records.

## User preferences

- Never seed or invent mock product records. Keep missing information blank and ask the person to provide it or upload a source.

## Gotchas

- Profile analysis currently reads notes, plain text, and Markdown; PDF and DOCX may be stored privately but are not yet parsed for suggestions.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
