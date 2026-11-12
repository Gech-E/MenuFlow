# MenuFlow application audit

Baseline inspected on 2026-11-12: GitHub main at `ae835d0`. The earlier local planning files describe an empty workspace. The GitHub source contains an existing Next.js App Router, React, TypeScript, Tailwind and Supabase application. This audit and the current README govern implementation. The earlier NestJS and Prisma plans are historical.

| Priority | Area | Verified baseline finding | Acceptance check |
|---|---|---|---|
| P0 | Tenant authorization | Legacy menu/order policies use an unqualified restaurant ID inside membership subqueries. Direct order updates grant more authority than a status transition needs. | Separate two authenticated tenants, deny cross-tenant reads/writes, enforce roles in the database, forbid direct total/payment changes. |
| P0 | Customer admission | Public RPC accepts a restaurant slug and caller-selected table number. QR links contain only a number. | Rotatable table locator plus a separate admission credential, with scoped tracking and host-only group checkout. |
| P0 | Financial integrity | The RPC reads item prices twice and has no request key. Staff can change status freely. Served totals are treated as sales in the demo. | Single server-calculated price snapshot, idempotent order/settlement, valid transitions, separate recorded cash and tips. |
| P0 | Public UI | Root renders seeded items and localStorage orders. The live route mixes available items across tenants and always submits to demo. | Real tenant menus with genuine empty states. Remove demo routing and local-only order confirmation. |
| P1 | Restaurant operations | Manual membership provisioning, one staff role, item creation and availability only. | Owner signup, scoped invitations, settings, categories, menu changes, variants/extras and QR lifecycle persist. |
| P1 | Billing and tracking | No dining-session ownership, group bill, receipt, cash ledger or secure customer status lookup. | Two-device order-to-cash journey and retried payment generate one receipt. |
| P1 | UI/accessibility | Staff and customer pages are large client components with several placeholder-only inputs. No mobile, keyboard or accessibility verification exists. | Label controls, preserve user inputs on failure, verify mobile and staff workflows with Playwright. |
| P1 | QA and operations | No lockfile, ESLint configuration, test harness or CI. Initial migration creates a demo restaurant; setup guide relies on manual provisioning. | Clean build, lint, strict typecheck, upgrade/data preservation tests, local and CI instructions, documented release blockers. |

The legacy application already provides useful Supabase Auth, decimal database pricing, table QR rendering and periodic order refresh. Retain those capabilities and replace unsafe paths incrementally. The original migration remains in history. New migrations must preserve existing orders and memberships and keep legacy sample data out of the published experience.

## Implementation checklist

- [x] Inventory remote code, migration, policies, UI, configuration and Git history.
- [ ] Upgrade tenant, staff and catalog data paths.
- [ ] Upgrade table admission, ordering, status, billing and settlement.
- [ ] Connect staff and customer interfaces to persistent data.
- [ ] Verify migration, tenant isolation, retry/concurrency and end-to-end customer journeys.
- [ ] Record the deployment configuration, verification results and outstanding release checks.
