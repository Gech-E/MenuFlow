# MenuFlow implementation plan

Status: Phase 0 planning proposal; implementation has not started.

Review date: 2026-11-06 (Africa/Nairobi).

Companion documents: [PRD](PRD.md), [architecture](ARCHITECTURE.md), [database design](DATABASE_DESIGN.md), [decisions](DECISIONS.md), [gap analysis](GAP_ANALYSIS.md).

## 1. Delivery rules and current baseline

Complete one phase at a time. At the end of **every phase**, report evidence, unresolved issues, and the proposed next phase, then wait for the user's approval. Approval of Phase 0 does not authorize all later phases, production deployment, live infrastructure changes, or a live subscription payment provider.

The user's follow-up designates `https://github.com/Gech-E/MenuFlow.git`, requests a professional README, and requires a commit after each successful feature. Include the README in Phase 0 as truthful project documentation; this is not permission to scaffold the application early. Inspect and preserve remote history before connecting the local workspace. Commit each verified, coherent feature with its tests, documentation, and migrations within the currently approved phase, then push using normal fast-forward history. Never force-push, overwrite remote work, or claim a push succeeded without verification. If remote access is blocked, preserve the local commit and report the exact blocker. The Phase 0 documentation package and README form a documentation commit, not an implemented application feature.

Phase 0 is the explicitly requested documentation-only exception to the requirement for working software in completed implementation phases. No application scaffolding, dependency installation, database creation, migration, or deployment belongs in Phase 0.

Repository inspection found an empty workspace with no application code, manifest, lockfile, database schema, tests, or Git repository. The following local command versions were observed during inspection; they are **not yet the project's selected or tested versions**:

| Tool | Observed state | Next action |
| --- | --- | --- |
| Node.js | `v24.22.2` available | Check compatibility and select a supported project version in Phase 1. |
| pnpm | `11.25.0` available | Verify supported Node combination and pin `packageManager`. |
| Git | `2.56.0.windows.2` available | Connect the supplied repository for the Phase 0 documentation delivery after inspecting remote history. |
| Docker | Command not on PATH | Resolve the local container runtime before claiming Compose verification. |

No application start, build, lint, migration, or test command exists today. Docker availability is a future foundation verification blocker, not a failure of the documentation phase.

The initial design assumptions are reviewable proposals in [DECISIONS.md](DECISIONS.md). In particular, confirm staff-approved guest admission, bill-host access, one active dining session per table, cash-only full settlement, the financial calculation policy, and tip allocation before their dependent implementation begins. No document establishes an Ethiopian tax rate or fiscal-compliance claim.

## 2. Shared completion gate

For Phases 1–8, complete the applicable user journey with real backend behavior, integrated frontend, migrations, input validation, backend authorization, error handling, and updated documentation. A screen alone is not a completed feature. Local seed data must be explicitly identified and confined to local development and tests.

Each phase must include:

1. A clean installation and reproducible build using the committed lockfile.
2. Lint and strict TypeScript checks for changed applications and shared packages.
3. Tests appropriate to the behavior and failure modes introduced; exercise the actual database for database guarantees.
4. Migration verification from a clean database and from the previous phase's schema when migrations changed.
5. Loading, empty, success, failure, and permission-denied behavior for changed interfaces.
6. Keyboard and responsive checks for changed interfaces, and automated accessibility checks where practical.
7. No known critical security issue in the implemented scope; unresolved failures documented as blockers rather than reported as passes.
8. A phase report and an explicit approval gate before further implementation.

Test evidence must identify the command, relevant runtime/database versions, outcome, and significant limitations. A skipped test is not a passing test. External-service unavailability must be reported accurately; mocks can test adapters but cannot establish a working integration.

## 3. Phase 0 — Repository inspection and planning

**Scope:** Inspect the workspace and instructions; document product requirements, architecture, entity relationships, workflows, API contracts, permissions, threats, decisions, milestones, and gaps. Add the professional README and version-control delivery requested by the follow-up, while leaving all application scaffolding for Phase 1.

**Acceptance criteria:**

- Existing files and dependency manifests are inventoried without overwriting working code. The empty-repository finding and unavailable Docker command are recorded.
- `PRD.md`, `ARCHITECTURE.md`, `DATABASE_DESIGN.md`, `IMPLEMENTATION_PLAN.md`, and `DECISIONS.md` exist, with a separate gap analysis for traceability.
- The root README explains the product, proposed stack/structure, current documentation-only status, documentation links, verified inspection commands, approval process, and known setup prerequisites. It does not advertise unimplemented features or runnable application commands.
- The architecture locates every required module in a modular monolith and identifies the backend as the authorization and financial authority.
- The data model describes tenant ownership, compound relationships, money representation, guest admission, order snapshots, settlement, audit records, and concurrency constraints.
- The documents distinguish user requirements, proposed defaults, unresolved business decisions, and implemented facts.
- Every later phase has measurable acceptance criteria and an approval gate. No application implementation is reported as complete.
- Review and commit the coherent documentation package, then push to the supplied remote if accessible. Record the commit and verified push outcome; if remote access fails, report it separately rather than treating synchronization as complete.

**Verification:** Review document consistency, relative links, requirement coverage, and repository contents. Application tests are not applicable because there is no application yet. Do not create placeholder tests to make this phase appear executable.

**Exit gate:** Present the Phase 0 review and request approval for Phase 1 only. Resolve or explicitly carry forward the open decisions with their latest responsible decision point.

## 4. Phase 1 — Project foundation

**Dependencies:** Phase 0 approval; a usable local container runtime for the required PostgreSQL/Compose verification; network access for dependency retrieval. Installing or changing system software is a distinct operation if required by the host environment.

**Scope:** Establish pnpm workspaces, Next.js App Router, NestJS, strict TypeScript, Tailwind, shadcn/ui, Lucide, shared packages, Prisma integration, configuration validation, formatting, linting, Docker Compose, and initial CI/health endpoints. Update the Phase 0 README with the verified local setup and architecture as implemented. Add TanStack Query, React Hook Form, and Zod in the foundation or the first working form that needs them. Use Turborepo only if it improves dependency-aware builds; record the choice.

**Acceptance criteria:**

- Pin a coherent, supported set of Node, pnpm, Next.js, React, NestJS, Prisma, and PostgreSQL versions after checking their official compatibility guidance. Commit the lockfile and record the selected versions; do not silently use whatever is newest.
- A clean checkout installs reproducibly, starts both applications, and builds successfully. Shared packages are imported through workspace boundaries without duplicating Prisma schemas.
- Compose starts PostgreSQL with an explicit health check and persistent development volume. Redis is optional until a feature needs it; document the readiness consequences when enabled.
- The frontend has a real application shell, design tokens, semantic navigation, and a working API connectivity/health flow. It contains no fabricated operational dashboard metrics.
- The API exposes proposed `GET /api/v1/health/live` and `GET /api/v1/health/ready` endpoints. Liveness does not depend on PostgreSQL; readiness succeeds only when required dependencies are usable and returns a non-success response when they are unavailable. Responses expose no credentials or infrastructure internals.
- Missing or malformed required configuration prevents startup with useful, redacted diagnostics. `.env.example` contains placeholders; real environment files are ignored.
- Swagger/OpenAPI generation is configured, with production exposure explicitly controlled.
- A small PostgreSQL/Prisma compatibility check verifies transactions, a parameterized transaction-local setting, and the selected pooling approach on the pinned versions. Record any required SQL escape hatches and version-specific retry/error mapping for Phase 2; this is not a claim that tenant isolation exists yet.
- CI runs install, lint, type checks, build, and available foundation tests. The pipeline fails on errors and contains no production deployment credentials.

**Tests/evidence:** Clean install/build; web-to-API smoke test; API liveness/readiness integration tests including a database outage; invalid-environment startup check; Compose startup and restart; transaction compatibility evidence; CI definition validation and actual execution when a repository runner is available.

**Exit gate:** Demonstrate local web, API, and database connectivity. If Docker or another dependency blocks that demonstration, report the blocker and do not mark Phase 1 complete. Request Phase 2 approval.

## 5. Phase 2 — Database and authentication

**Dependencies:** Phase 1 approval; accepted tenant/identity model and schema-affecting guest-admission, bill-host, currency, and settlement-scope decisions; transactional and connection-pool behavior established; decisions on invitation delivery and account recovery.

**Scope:** Implement the accepted initial schema and migrations, tenant ownership constraints, authorization infrastructure, staff authentication, session lifecycle, roles and branch scopes, owner onboarding, staff invitations, and isolated test fixtures. Add future domain entities according to the accepted database design; later feature phases may refine them through new migrations.

**Acceptance criteria:**

- Prisma has one canonical schema and one ordered migration history. A clean migration and upgrade from the foundation database succeed. Database access uses separate migration and least-privilege runtime roles.
- Onboarding creates the owner membership and restaurant consistently, with no partially created tenant on failure. Branch access is explicitly assigned rather than inferred from an arbitrary request header.
- Passwords are hashed with an approved Argon2id configuration; opaque staff session tokens are stored as hashes. Production cookies are HTTP-only and secure. Login rotates session state; logout, password reset, role removal, and account disabling revoke or invalidate the relevant access.
- Backend guards enforce role, tenant, branch, resource relationship, and current membership state. Platform administration is a separate capability; a platform admin is not implicitly a restaurant employee.
- State-changing cookie-authenticated requests validate CSRF protection and allowed origin. Credentialed CORS uses an explicit allowlist.
- Tenant-scoped data access uses parameterized context in the same database transaction as the query. RLS fails closed when context is absent and is tested under the real non-owner runtime role. Compound foreign keys prevent cross-tenant relationships independently of request checks.
- Invitation and reset tokens expire, are single-use, and cannot grant a role above the inviter's authority. The final owner cannot be accidentally removed. Authentication errors do not reveal whether another user's email exists.
- Authentication pages and onboarding are integrated with real API responses, validation, loading, and error states. No successful-login bypass exists outside isolated tests.

**Tests/evidence:** Password/session unit tests; onboarding transaction rollback; login/logout/reset/invitation API tests; two-tenant fixtures; foreign-tenant identifiers in paths, bodies, nested writes, and relation reads; branch restrictions; absent-context RLS; pooled-connection context leakage; revoked session; CSRF/origin; rate limiting; privileged-role escalation denial; frontend login/onboarding E2E.

**Exit gate:** Demonstrate successful authorized access and failed unauthorized access using separate tenants and roles. Request Phase 3 approval.

## 6. Phase 3 — Restaurant and menu management

**Dependencies:** Phase 2 approval; menu ownership and branch override decisions; accepted image-storage configuration and scheduling semantics.

**Scope:** Restaurant profile/branding, branches, hours, tables, staff-management UI, menu categories/items/variants/modifiers, translations, images, availability, daily specials, schedules, tax/service-charge configuration, and responsive management screens. QR issuance remains Phase 4.

**Acceptance criteria:**

- Authorized owners/managers can manage their restaurant and permitted branches; prohibited actions fail on the API even if requests bypass the UI.
- Tables have unique labels within a branch. Archiving a table or menu item preserves order-history references; deleting an active table/session is rejected.
- Category/item/variant/modifier CRUD persists to PostgreSQL. Required modifier groups and minimum/maximum selections are validated consistently, including inactive or sold-out options.
- Schedules use the branch's configured IANA timezone, handle overnight windows, and apply a documented precedence rule for opening hours, menu schedules, specials, and manual unavailability.
- English and Amharic content can be entered, displayed, and saved without data loss. Missing translation fallback is consistent, and long text/Ethiopic glyphs do not break layouts. Adding another locale does not require schema duplication.
- Images pass server-side type, size, and decoded-image validation; unauthorized or unfinished objects cannot be published as menu assets. Asset keys are scoped to the tenant, and cleanup of abandoned uploads is defined.
- Tax and service-charge settings are validated and versioned; no unconfirmed legal tax rate is silently applied. Published prices and schedules can be previewed with real data.
- Management screens support keyboard operation, tablet/desktop layouts, empty states, validation errors, failed uploads, and retry without losing entered data.

**Tests/evidence:** CRUD API tests; permissions and cross-tenant assets; modifier boundaries; schedule/timezone/overnight tests; translation fallback; malicious/oversized upload cases; database relation tests; owner menu-edit E2E and responsive/accessibility checks.

**Exit gate:** Demonstrate a complete restaurant/menu editing journey backed by the API and database. Request Phase 4 approval.

## 7. Phase 4 — QR codes and customer menu

**Dependencies:** Phase 3 approval; explicit acceptance of the guest-admission and bill-host rules; published menu and table records.

**Scope:** QR issuance/download/print, public menu, table resolution, QR rotation/revocation, server-controlled dining sessions, staff-approved guest admission, guest session cookies, mobile menu browsing, item details, cart, and authoritative quote validation. Order persistence is Phase 5.

**Acceptance criteria:**

- A QR resolves to a restaurant/table and published menu only. Possession of a photographed QR does not reveal another guest's orders, active-session details, consolidated bill, or receipt.
- Staff open a session; a guest requests admission and gains access only after approval for that session. The database rejects concurrent attempts to open two active sessions for one table.
- Admission is device-scoped, expires appropriately, and cannot be replayed into a later dining session. QR rotation/revocation affects new admission and follows the documented policy for existing approved guests.
- Ordinary guests can access only their authorized information. A separately assigned bill-host capability is required for later consolidated bill/checkout/tip operations. Recovery on a new device requires staff authorization.
- QR downloads and print layouts contain the correct URL and readable table label. A revoked code displays a useful recovery path without leaking internal identifiers.
- Customers can browse categories, specials, availability, search/filter results, and item details in English/Amharic; add quantities/modifiers/instructions; edit/remove items; and restore a local cart safely.
- The API recomputes quotes from current menu data. Manipulated totals, unavailable items, wrong-tenant variants, invalid modifier combinations, and expired schedules are rejected or surfaced for explicit customer review.
- Cart state does not represent an accepted order or reserve inventory. The UI explicitly reports that placement is unavailable until the order workflow is implemented; it does not show fabricated order success.

**Tests/evidence:** QR rotation/revocation; concurrent session opening; unauthorized guest and copied-QR access; admission replay; bill-host permission checks; quote tampering; mobile viewport and accessibility tests; cart recovery; real menu browsing E2E.

**Exit gate:** Demonstrate QR-to-menu-to-approved-session-to-valid-cart/quote flow, with ordering accurately deferred. Request Phase 5 approval.

## 8. Phase 5 — Ordering, kitchen, waiter, and service requests

**Dependencies:** Phase 4 approval; accepted order/item state machine, cancellation/void rules, assignment policy, and realtime delivery design.

**Scope:** Durable order submission, price snapshots, additional orders, safe cancellation, live kitchen queue, waiter assignments/dashboard, item preparation/serving, service requests, WebSockets, outbox processing, and recovery after connection loss.

**Acceptance criteria:**

- The server validates menu, variant, modifier, schedule, currency, quantity, price version, guest, and dining-session state at submission. A changed quote requires customer review; the server does not trust client totals.
- An accepted order, immutable price/modifier/tax snapshots, idempotency result, audit event, and outbox event commit atomically. A failure leaves no partial order.
- Retrying an identical request with the same scoped idempotency key returns the same result. A different payload under that key returns a conflict. Timeout recovery lets the customer discover the accepted result without creating another order.
- Concurrent submissions, availability changes, checkout locks, and kitchen transitions obey the documented transaction and lock order. No order is accepted after the session has entered checkout.
- Kitchen and waiter APIs enforce the documented state machine and permissions at both order and item levels. Invalid transitions, stale versions, and unauthorized serving/cancellation return clear conflicts. Partial preparation/serving remains visible rather than falsely marking the whole order complete.
- Authorized guests see their own order progress; authorized staff see only their branch/assignment scope. WebSocket subscriptions and every sensitive event are authorized; reconnect performs an authoritative REST refresh. Disconnection does not discard orders or pretend an unacknowledged request succeeded.
- Service requests have a real lifecycle from requested to acknowledged to completed, attribution, rate limits, and duplicate suppression. Requests go to staff with the correct table/branch scope.
- Outbox delivery and background processing tolerate retries without duplicate operational effects. Redis/BullMQ are introduced where needed; Redis failure does not lose committed PostgreSQL orders.

**Tests/evidence:** State-machine tables; stale updates; parallel order creation; idempotent retry and conflict; response-loss recovery; transaction rollback; checkout/order race; cross-tenant WebSocket subscription; revocation while connected; outbox crash/retry; service-request duplicate/concurrency tests; customer-to-kitchen-to-waiter E2E on two tenants.

**Exit gate:** Demonstrate accepted, prepared, served, tracked, and cancelled orders with real persisted state. Request Phase 6 approval.

## 9. Phase 6 — Billing, voluntary tipping, and cash settlement

**Dependencies:** Phase 5 approval; explicit financial-policy review covering currency precision, inclusive/exclusive tax, rounding, discount allocation, taxable service charges, eligible tip base, receipt requirements, adjustments, and tip allocation. Confirm the MVP full-bill cash-only settlement boundary.

**Scope:** Running bill, consolidated order lines, authorized adjustments, tax/service charges, checkout, optional tips, invoice revisions, cash recording, receipts, transaction history, audit, and safe session closure. A provider interface may exist, but unsupported digital methods cannot return paid.

**Acceptance criteria:**

- All amounts use integer minor units with bounded integer arithmetic and exact string serialization where required. Server totals are reproducible from immutable snapshots and the recorded financial-policy version; floating-point arithmetic cannot alter amounts.
- Running bills include chargeable lines once, exclude cancelled/voided amounts according to policy, and separate subtotal, discounts, tax, service charges, voluntary tip, and grand total.
- No tip is preselected. The customer can explicitly choose none, 5%, 10%, 15%, or a validated custom amount. The default eligible base is discounted pre-tax food/drink subtotal, excluding mandatory charges, subject to the accepted configuration rules. Changing the bill invalidates a stale tip/checkout confirmation.
- Only the explicit bill host can read the consolidated customer bill and confirm tip/checkout; ordinary guests retain their own order access. Cashiers cannot silently add a voluntary tip.
- Checkout is allowed only when all noncancelled chargeable items have been served; the server rechecks that condition at settlement. Checkout locks the session against further ordering and new admissions. Unresolved kitchen items cannot disappear into a closed session. Reopening checkout is authorized, audited, and creates a fresh confirmation/revision.
- Authorized cashiers record one full settlement against the current invoice revision. The same request cannot settle twice; conflicting retries and stale totals fail safely. Receipt creation, payment confirmation, tip allocation, audit, session closure, and outbox effects have a documented atomic boundary.
- A zero-payable bill follows an explicit authorized zero-balance closure with retained lines, adjustment history, audit, and receipt; it never creates fictional received cash. An empty or fully cancelled no-liability session follows the accepted void/closure rule.
- A receipt is available only after committed payment confirmation or an explicit authorized zero-balance closure. A lost response can be recovered by querying the durable settlement result. Receipt numbering is unique under concurrency and follows the accepted business/fiscal policy.
- Tips are separated from restaurant sales and associated with the assigned waiter snapshot or an explicit unallocated pool, according to the approved policy. Staff reassignment after payment cannot rewrite historical allocation.
- A digital-payment adapter remains disabled until trusted server verification and approved provider integration exist. No browser redirect, test fixture, or user-supplied status can mark a production payment paid.

**Tests/evidence:** Hand-calculated financial fixtures; zero/large/boundary amounts; rounding and discount allocation; mixed tax classes and service-charge bases; voluntary-tip defaults; historical price edits; concurrent checkout/order and cashier settlement; retry after response loss; transaction rollback; permission and tenant isolation; receipt integrity; complete cash-payment E2E.

**Exit gate:** Demonstrate a bill reconciling exactly to its confirmed cash payment and receipt, with tips separately recorded. Resolve financial-policy blockers before real business use. Request Phase 7 approval.

## 10. Phase 7 — Analytics and platform administration

**Dependencies:** Phase 6 approval; accepted definitions for sales, revenue, average order value, business day, completed orders, and treatment of tips/voids.

**Scope:** Daily revenue, counts, average order value, best-selling items, active tables, completed orders, tip summaries, date filters, reports, platform tenant management, configuration, tenant status, and subscription metadata.

**Acceptance criteria:**

- Reports reconcile to immutable settled records, using the branch timezone and documented business-day/date-range boundaries. Unpaid orders and tips are not silently counted as settled restaurant sales.
- Tests distinguish order counts from invoice counts so multiple orders in one session do not distort the chosen average-order-value definition. Cancelled/voided lines and empty date ranges have explicit behavior.
- Owner/manager analytics are tenant- and branch-scoped. Cashiers/waiters receive only approved operational/tip summaries. Raw cross-tenant totals cannot leak through cached responses, exports, or WebSockets.
- Platform admins can manage tenant status and subscription metadata under separate audited permissions. Administrative access does not create an unlogged bypass into guest bills or staff workflows.
- Suspension has a defined policy for existing sessions, settling already incurred charges, public menu visibility, and new orders; it is not an uncontrolled data deletion operation.
- Subscription metadata can represent plan and lifecycle state without implying money has been collected. No live subscription charging or provider integration occurs without explicit user approval.
- Dashboards show only actual stored data and meaningful empty/error states. Filters and reports behave consistently across UI and API.

**Tests/evidence:** Financial reconciliation fixtures; multi-order sessions; timezone boundaries; filtering; unauthorized reports/exports; cache isolation; suspended-tenant journeys; admin audit events; analytics and tenant-management E2E.

**Exit gate:** Demonstrate reconciled reports and least-privilege platform administration. Request Phase 8 approval.

## 11. Phase 8 — Production hardening and release preparation

**Dependencies:** Phase 7 approval; intended hosting/runtime and storage/email/monitoring providers; accepted retention and recovery objectives; deployment ownership; tax/receipt review; a representative staging environment authorized by the user where external infrastructure is needed.

**Scope:** Full security/authorization review, complete automated suite, concurrency/load testing, dependency audit, migration rehearsal, logging/monitoring, backup and restore rehearsal, deployment configuration, incident/runbooks, customer-journey verification, and release-readiness checklist.

**Acceptance criteria:**

- Run unit, integration, API, E2E, authorization, tenant-isolation, concurrency, and financial suites against the selected release versions. Record actual results and address critical failures before a release-ready claim.
- Review session fixation/revocation, CSRF, CORS, object-level authorization, RLS runtime role, upload handling, logging redaction, WebSocket permissions, rate limits, dependency vulnerabilities, and secret scanning.
- Rehearse migrations against a production-like dataset, including lock duration, compatibility across rolling versions, backup prerequisite, and recovery. A destructive migration requires an explicit operational decision, not an assumed automatic rollback.
- Configure automated encrypted backups and verify a restore into an isolated environment. Measure recovery point and restore time against agreed targets; scheduled backups alone do not prove restorability.
- Structured logs, error monitoring, correlation identifiers, readiness checks, and alerts detect failed orders, delayed outbox processing, settlement conflicts, and dependency outages without exposing session tokens or customer notes.
- Execute customer scan/admission/order/service/bill/tip/cash/receipt journeys plus staff administration, outage recovery, revoked access, concurrent requests, and tenant-suspension scenarios. Verify English and Amharic on mobile and staff tablet/desktop layouts.
- Record load-test dataset, tenant/session mix, latency/error thresholds, and results. Validate proposed performance targets rather than presenting unmeasured expectations as service guarantees.
- Deployment artifacts document TLS, secrets, database roles, scaling assumptions, graceful shutdown, migration jobs, storage policy, and rollback/recovery. No live resources or production deployment are changed by this phase without separate explicit authorization.
- The release checklist names the owner and evidence for every gate, lists accepted residual risks, and clearly separates “prepared for deployment” from “deployed and verified.”

**Tests/evidence:** Full suite and audit reports; security review; migration rehearsal; measured restore; representative load/concurrency results; monitoring alert exercise; deployment-configuration validation; end-to-end videos/screenshots or equivalent reproducible evidence.

**Exit gate:** Present the release-readiness evidence. Ask separately for production deployment authorization if requested; successful preparation is not that authorization. Live subscription billing still requires its own explicit approval.

## 12. Requirement-to-phase traceability

| Requirement area | Primary phase(s) | Evidence that closes the requirement |
| --- | --- | --- |
| Monorepo, stack, environments, CI, health | 1; hardened in 8 | Reproducible clean build and dependency failure checks |
| Authentication, invitations, roles, tenant isolation | 2; reviewed in 8 | Real-session and two-tenant positive/negative tests |
| A: Tenant/onboarding/profile/branches/hours/configuration | 2–3 | Onboarding transaction and authorized management E2E |
| B: Menu, variants, modifiers, images, specials, schedules, translations | 3–4 | Management-to-public-menu flow and schedule/upload tests |
| C: Tables, QR lifecycle, active dining sessions | 3–4 | Unique-session race and copied/revoked-QR tests |
| D: Customer cart, order, cancellation, tracking | 4–5 | Server validation, durable idempotency, customer E2E |
| E: Kitchen queue and state machine | 5 | All valid/invalid transitions and partial fulfillment |
| F: Assignments, waiter workflow, assistance | 5 | Scoped notifications and service lifecycle |
| G: Bills, adjustments, taxes, settlement, receipts | 6 | Exact reconciliation and concurrent settlement tests |
| H: Voluntary tips and staff allocation | 6; summaries in 7 | No-default-tip UI, base calculation, historical allocation |
| I: Cash payments, abstraction, history, audit | 6; operations in 8 | No duplicate payment and no unverified digital success |
| J: Analytics and date filters | 7 | Report-to-ledger reconciliation across timezone boundaries |
| Platform admin and subscription metadata | 7 | Separate permissions and audited tenant operations |
| Redis/BullMQ, outbox, realtime reliability | 5; hardened in 8 | Retry/crash/reconnect behavior without lost writes |
| Accessibility, responsive states, EN/Amharic | 1 onward; complete in 8 | Per-screen checks and full translated E2E journeys |
| Backups, observability, deployment/security readiness | 8 | Measured restore, alert exercise, approved release checklist |

## 13. Risk and dependency register

| Risk/dependency | Impact | Mitigation and latest decision point |
| --- | --- | --- |
| Local Docker unavailable | Cannot verify the required local database/Compose flow | Resolve before Phase 1 completion; report the actual blocker instead of substituting an untested claim. |
| Framework/ORM version drift | Incompatible setup or incorrect transaction assumptions | Pin compatible versions; verify selected Prisma transaction/error APIs and pooling in Phase 1. |
| Staff-approved admission creates operational friction | Customers may wait before ordering | Validate with a café workflow before Phase 4; retain public menu browsing and clear pending/admission states. |
| Shared-table visibility and bill authority unclear | Privacy leak or competing checkout/tip changes | Accept own-order vs bill-host permissions before Phase 4; enforce on REST and realtime paths. |
| RLS context leaks or owner-role bypass | Cross-tenant exposure | Same-transaction context, non-owner runtime role, composite keys, pool isolation tests in Phase 2. |
| Lost mobile response or weak connectivity | Duplicate orders or mistaken success/failure | Durable idempotency, result recovery, visible pending state, REST reconnect refresh in Phase 5. |
| Concurrent checkout, order, and cash settlement | Missing charges or duplicate payments | Session serialization, invoice revisions, uniqueness constraints, bounded retries, race tests in Phases 5–6. |
| Tax, service charge, receipt or retention rules unresolved | Incorrect financial operation or release blocker | Obtain merchant/accountant policy decisions before Phase 6 real use; record no assumed legal rates. |
| Tip allocation disputes | Wrong staff attribution or misleading sales | Agree assignment snapshot/unallocated behavior and audit reassignment before Phase 6. |
| Scope expansion into split bills, refunds, table moves or digital payments | Added ledger and concurrency complexity | Treat as separately approved scope; design seams without fake implementations. |
| Translation quality and font coverage | Unusable Amharic UI/menu | Human review of production copy, font/license choice, fallback and device checks by Phases 3–4. |
| Storage/email/monitoring provider undecided | Upload, invitation delivery or operations blocked | Select providers before dependent implementation; local adapters do not prove production delivery. |
| Hosting lacks durable sockets or background execution | Realtime/outbox interruption | Validate runtime capabilities before deployment design; keep REST recovery and durable outbox. |
| Backup exists but restore is untested | Extended outage or permanent loss | Automated backup plus measured isolated restore before Phase 8 exit. |
| Tenant suspension/deletion rules unclear | Incurred bills stranded or records lost | Define settle-existing/no-new-orders policy and retention before Phase 7. |
| Unbounded ambition obscures release state | Superficial features reported complete | Keep phase approval gates and evidence; report incomplete integrations explicitly. |

## 14. Local commands and evidence reporting

The following **inspection commands are available now**, from the existing workspace in PowerShell:

```powershell
Set-Location 'C:\Users\Gech\Desktop\MenuFlow'
Get-ChildItem -Force
Get-ChildItem -LiteralPath .\docs -File
Get-Content -LiteralPath .\docs\IMPLEMENTATION_PLAN.md
node --version
pnpm --version
git --version
```

The following is a **proposed script contract for Phase 1 and later**, not a runnable instruction set for the current empty application workspace. Final commands must be documented only after implementation and verification:

```text
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:generate
pnpm db:migrate:dev
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:api
pnpm test:security
pnpm test:e2e
```

Do not expose a reset/seed command as a production operation. Local seeding must require an explicit development/test environment, and test runs must use a dedicated database. CI should apply committed migrations rather than generate new ones.

At each exit gate, report the user's requested ten items:

| Report field | Required content |
| --- | --- |
| Phase completed | Name, implemented scope, and any unmet gate |
| Features implemented | Real working behavior; distinguish documentation/design |
| Files created or modified | Concrete paths and purpose; coherent feature commit and verified push outcome |
| Database changes | Migrations/constraints or “none” |
| API endpoints added | Implemented endpoints or “none”; proposals do not count |
| Tests and results | Commands, outcomes, skips, and environment limitations |
| Security considerations | Verified controls and unresolved concerns |
| Known issues or limitations | Blockers, deferred decisions, and incomplete integrations |
| Local commands | Verified commands only, with prerequisites |
| Recommended next phase | Scope and explicit request for approval |

Current milestone: **Phase 0 documentation review. No later phase is authorized or implemented.**
