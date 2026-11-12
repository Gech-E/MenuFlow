# MenuFlow — Decisions, assumptions and open questions

Phase 0 proposal, 2026-11-06. Status labels distinguish user requirements from recommendations; approval of planning does not mean a feature is implemented.

## Confirmed requirements

| ID | Decision | Source / consequence |
|---|---|---|
| C01 | Next.js/React frontend, NestJS modular monolith, PostgreSQL/Prisma, strict TypeScript | User brief; no stack substitution proposed |
| C02 | pnpm monorepo; one canonical Prisma schema and versioned migrations | User brief; Turborepo optional |
| C03 | Initial Ethiopia market, ETB, English and Amharic | User brief; design allows additional currencies/locales |
| C04 | Anonymous guests; backend roles and tenant isolation | User brief; QR is not unrestricted authorization |
| C05 | Voluntary, unselected tips and exact server-calculated money | User brief; never trust client totals |
| C06 | Initial cash recording; no fake successful digital payment | User brief; future provider interface only |
| C07 | Complete one phase, report evidence, obtain approval before next phase | User brief; Phase 0 contains documentation only |
| C08 | No live subscription provider or production/infrastructure mutation without explicit approval | User brief; local setup does not authorize deployment |
| C09 | Use `https://github.com/Gech-E/MenuFlow.git`; commit each completed verified feature; professional README | User follow-up; preserve remote history, commit coherent validated units and keep status truthful |

## Proposed architecture decisions

| ID | Proposal and reason | Tradeoff / validation | Decision point |
|---|---|---|---|
| A01 | Shared-schema tenancy with tenant/branch-aware services, composite FKs and transaction-local RLS | Lower operating burden than per-tenant databases; needs pooled-connection and bypass-role tests | Approve design before Phase 2 |
| A02 | Same-origin web/API ingress; opaque server-side staff/guest cookie sessions | Straightforward revocation; requires CSRF and Origin enforcement, server session storage | Phase 1 routing; Phase 2 auth |
| A03 | Staff opens sessions and physically approves each device admission | Prevents a copied QR from exposing/ordering into a live session; adds waiter interaction | Before Phase 2 schema / Phase 4 UI |
| A04 | Separate bill-host capability, ordinary guests see only own orders | Prevents accidental group-bill exposure; explicit host transfer/recovery needed | Before Phase 2 schema |
| A05 | PostgreSQL bigint minor units, API money strings, integer bps and half-up rounding | Avoids binary floating errors; shared conversion/limits tests required | Before Phase 2 money columns |
| A06 | Session row lock and revision boundary for orders, cancellation, checkout and payment | Simple correct concurrency; hot tables serialize briefly, no network calls inside locks | Before Phase 5 implementation |
| A07 | Immutable line snapshots, invoice revisions, durable idempotency and outbox | Supports replay/reconciliation; more storage and cleanup policy needed | Phase 2 model; Phases 5–6 behavior |
| A08 | REST authoritative, WebSockets as recoverable notifications | Resilient reconnects; polling and idempotent consumers add explicit code | Phase 5 |
| A09 | Redis/BullMQ only when a real job/rate-limit/realtime need appears | Fewer initial moving parts; add before multi-replica or asynchronous production workloads | Phases 3/5/8 as needed |
| A10 | Item states authoritative, derived order header, whole-line cancellation | Supports partial preparation/serving without two competing state machines; no partial-quantity cancellation initially | Before Phase 5 |
| A11 | Exact framework versions chosen after compatibility checks | Avoids unverified version assumptions; installation and lockfile are Phase 1, not Phase 0 | Phase 1 |

## Open product and operational decisions

Recommended defaults are reviewable proposals. A deferred decision blocks only its dependent implementation; it does not justify bypassing a phase gate.

| ID | Decision to resolve | Recommended initial default | Owner / deadline |
|---|---|---|---|
| P01 | Public signup or invitation-only pilot; contact verification/email provider | Verified owner signup with abuse limits; restrict pilot onboarding if delivery is not configured | Product owner, before Phase 2 |
| P02 | Staff effort versus guest convenience for admission | Staff physically approves a device challenge; never autojoin from static QR | Product owner, before Phase 2 schema |
| P03 | Who may see group bill and consent to group tip | One staff-designated host; transfer audited and revokes prior access | Product owner, before Phase 2 schema |
| P04 | Single or split payment, partial tender, refunds and post-payment corrections | One full cash settlement/session; no split/partial/refund UI in first release; define manual escalation procedure | Product owner/accounting lead, before Phase 2 ledger model |
| P05 | Actual tax rates, inclusive/exclusive pricing, discount/service tax treatment, receipt requirements | Exclusive per-line half-up engine proposal; no jurisdictional rate hardcoded; validate with local accountant | Business/accounting adviser, before Phase 6 and any real-money use |
| P06 | Service charge and discount limits | Service charge off until configured; owner/manager grants and reasons; deterministic discount allocation | Business owner, before Phase 6 |
| P07 | Tip eligibility, maximums, allocation, staff visibility and payout policy | Voluntary eligible pre-tax discounted subtotal; 100% assigned waiter snapshot, otherwise unallocated; no payout automation | Business owner/staff policy owner, before Phase 6 |
| P08 | Early checkout with pending items, reopening and cancellation after acceptance | Require all noncancelled items served before checkout; manager reopening invalidates quote/tip; manager-approved unserved-line cancellation | Operations owner, before Phase 5 |
| P09 | Currency and branch settings | ETB only enabled initially; per-branch currency future-ready; active session currency fixed | Product owner, before Phase 2 |
| P10 | Menu schedule overlaps and special pricing | Branch-local windows; explicit priority; reject equal-priority overlaps for same item; one active price override, no stacking | Product owner, before Phase 3 |
| P11 | Base language, translation completeness and date/number/calendar format | English fallback with Amharic content/UI; Gregorian display/Latin digits initially; Ethiopic font verified | Product/localization owner, before Phase 3 |
| P12 | Sessions/receipts expiry and lost-device recovery | 5-minute pending admission; configurable device expiry; staff recovery; 24-hour read-only receipt access; never auto-settle | Product/security owner, before Phase 4 |
| P13 | Subscription lapse versus security suspension | Lapse blocks new orders/sessions but permits completion/settlement; security suspension requires incident recovery | Platform owner, before Phase 7; initial tenant guards in Phase 2 |
| P14 | QR rotation effect on admitted diners | Revoke future resolution/admissions only; separate audited active-session revocation | Operations owner, before Phase 4 |
| P15 | Hosting, domain, storage region, email, monitoring and operating budget | Select managed PostgreSQL, object storage and long-lived API/worker hosting after requirements review | Technical/business owner, before Phase 8; local equivalents in Phase 1 |
| P16 | Retention/export/deletion and fiscal records | Minimize guest personal data; immutable financial records with approved retention; redact instead of deleting ledger history | Business/privacy/accounting owner, before Phase 6/production |
| P17 | Availability/support and disaster recovery | Pilot targets: 99.5% monthly availability, 15-minute RPO, 4-hour RTO, measured restore drill | Operations owner, before Phase 8 |
| P18 | Platform MFA, staff session durations and emergency access | MFA mandatory for platform admins; proposed 30-minute staff idle/12-hour absolute expiry | Security/operations owner, before Phase 2 auth design |
| P19 | Zero-payable bill and all-cancelled visit handling | Explicit zero-balance close with audit/receipt; empty/no-liability visit can be voided; never fake cash received | Accounting/operations owner, before Phase 6 |
| P20 | Repository license and contribution/branch policy | Do not invent an open-source license; use descriptive commits after checks, respect existing branch protections | Repository owner, before external reuse/contributions |

## Financial and operational assumptions

The first pilot does not handle split tables, merged sessions, table transfers, offline order acceptance, stock inventory counts, delivery or card storage. These require additional workflows and tests if selected. Internet loss preserves unsent cart state and provides clear retry/service guidance; it never presents an unsent order as confirmed.

Archiving a menu item or disabling a staff membership retains historical names/prices/actors. A waiter assignment change does not retroactively change finalized tips. Manager discounts after preparation do not erase fulfilled items. All financial changes require reasons, scope and immutable evidence.

## Phase 0 approval scope

Approval authorizes Phase 1 foundation work only. It does not authorize production deployment, paid infrastructure, live providers or all later phases. The most consequential design choices to review now are A01–A05 and P02–P04. Other choices have explicit deadlines so they can be settled before dependent work.

Commit policy: commit each successful feature as a coherent unit after its required checks, including its documentation and migrations. Commit this Phase 0 planning package and README as documentation, without calling them implemented application features. Push to the supplied repository when accessible, using its existing history and a normal fast-forward flow; never force-push to hide divergence. If access fails, retain the local work and report the exact blocker without claiming synchronization.
