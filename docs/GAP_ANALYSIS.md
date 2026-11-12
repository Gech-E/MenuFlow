# MenuFlow — Phase 0 repository inspection and gap analysis

Inspection date: 2026-11-06 (Africa/Nairobi). Status: planning only; no application implementation.

## Evidence and boundaries

- Inspected `C:\Users\Gech\Desktop\MenuFlow` with a hidden-file inventory and `rg --files --hidden`, excluding dependencies and Git internals.
- The initial directory contained zero entries. There were no applications, manifests, lockfiles, Prisma schemas, migrations, tests, environment files, CI workflows, infrastructure definitions, or local instructions.
- `git rev-parse --show-toplevel` and `git status --short` reported that this directory is not a Git repository. No history, remotes, or existing implementation could be assessed.
- Checked ancestor `AGENTS.md` paths through the drive root; none were present.
- Read the attached project brief. Its Phase 0-only instruction and approval gate govern this delivery.
- No services, cloud accounts, or live databases were inspected or changed. No dependencies were installed.
- The user subsequently supplied `https://github.com/Gech-E/MenuFlow.git` and requested verified-feature commits plus a professional README. A normal local Git request could not resolve GitHub; the connected GitHub tool also returned a transport error. An elevated read-only Git request succeeded: both HEAD and full-ref queries returned no refs (exit code 0), indicating an empty remote with no branches/commits to preserve. This extends the original local-only inspection.
- Git initialization and publishing the Phase 0 documentation are repository administration authorized by the follow-up, not the start of application scaffolding. Synchronization evidence is reported in the phase delivery message.

The empty directory is a greenfield starting point, not evidence of an existing application's defects. The documents added in this phase are proposals, not working features.

## Local tooling observations

| Tool | Observed result | Implication |
|---|---|---|
| Node.js | `v24.22.2` | Available; project compatibility remains to be verified in Phase 1 |
| pnpm | `11.25.0` | Available; workspace version must be pinned in Phase 1 |
| Git | `2.56.0.windows.2` | Available; repository initialization remains Phase 1 work |
| npm | Command found | Not selected as the project package manager |
| Docker | No command found on PATH | Compose-based local verification requires Docker installation/configuration or a documented equivalent development environment |
| PostgreSQL / Redis / object storage | Not connected or tested | No claims about availability, credentials, health, or persisted data |

These workstation versions are observations, not selected production versions. The current Prisma documentation differs from its versioned documentation; select and test one supported toolchain before using version-specific transaction APIs.

## Requirement coverage and gaps

| Area | Existing implementation | Required work | Planned phases |
|---|---|---|---|
| Product and architecture | None | Requirements, workflows, permissions, data model, decisions, delivery gates | 0 |
| Monorepo and development environment | None | pnpm, Next.js, NestJS, strict TS, shared config, lint/format, Docker, CI, health | 1 |
| Data and identities | None | Root Prisma schema, migrations, tenants, users, memberships, sessions, RBAC, isolation | 2 |
| Restaurant operations | None | Onboarding, profile, hours, branches, staff invitations, settings | 2–3 |
| Menu and tables | None | CRUD, variants/modifiers, translations, availability, schedules, images, table management | 3 |
| Public browsing and safe access | None | Responsive menu, QR lifecycle, guest admission, carts, authoritative pricing validation | 4 |
| Ordering and fulfillment | None | Idempotent transactional orders, item state machine, kitchen/waiter UI, realtime recovery | 5 |
| Service | None | Assignments, assistance requests, acknowledgment/completion | 5 |
| Bills, tips and cash | None | Exact arithmetic, invoices, full cash settlement, receipts, tip allocations and audit | 6 |
| Reporting and platform operations | None | Verified analytics, tenant administration, subscription metadata | 7 |
| Production operations | None | Monitoring, backups/restore, deployment configuration, load/security/release evidence | 8 |

## Deliverables and review

Read the professional [README](../README.md) for the project entry point, [PRD](PRD.md) for scope and workflows, [Architecture](ARCHITECTURE.md) for API/security design, [Database design](DATABASE_DESIGN.md) for entities and invariants, [Implementation plan](IMPLEMENTATION_PLAN.md) for phase acceptance criteria, and [Decisions](DECISIONS.md) for proposed defaults and unresolved approvals.

Phase 0 verification consists of repository inspection and documentation consistency checks. Unit, integration, API, browser, financial, and security tests cannot run because there is no application or test harness. The implementation plan defines the evidence required later. No feature or production-readiness claim is made.

The consolidation check inspected seven Markdown files, resolved all 30 relative document links, found balanced code fences and no replacement/control-character errors, and confirmed Phases 0–8 with nine approval gates. Manual cross-document review aligned role grants, guest admission/host permissions, CSRF bootstrap, order state aggregation, checkout eligibility and settlement uniqueness. Diagram source is included; rendered Mermaid layout has not been browser-verified.

## Commands usable now

Run from the workspace in PowerShell:

```powershell
Get-ChildItem -Force
rg --files --hidden -g '!node_modules' -g '!.git'
Get-Content -LiteralPath .\docs\PRD.md
node --version
pnpm --version
git --version
Get-Command docker -ErrorAction SilentlyContinue
```

There is no application start, migration, build, or test command yet. See the implementation plan for the proposed future command contract.
