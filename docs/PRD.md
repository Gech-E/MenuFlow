# MenuFlow — Product requirements

Version: Phase 0 proposal, 2026-11-06. Approval pending. Nothing described here is implemented.

## 1. Purpose and scope

MenuFlow helps Ethiopian cafés and restaurants publish menus, accept table orders, coordinate service, and settle accurate bills. Guests use a mobile browser without an account or installation. Staff use a responsive desktop/tablet interface. Each restaurant is a tenant; branches belong to that tenant.

The first operational release includes modules A–J in the brief across Phases 1–8: tenant onboarding, multilingual menus, tables/QR, dining sessions, ordering, kitchen/waiter workflows, consolidated bills, voluntary tips, recorded cash payments, and basic analytics. ETB is the initial currency. English and Amharic are initial interface/content languages; translations and fonts must support additional locales without redesign.

The release is a modular monolith, with a real PostgreSQL database and backend authorization. Production flows never use fabricated metrics, fake API results, automatic payment success, or local seed data presented as live business data.

Proposed boundaries requiring acceptance: dine-in only; one currency per branch and immutable per dining session; one bill and one full cash payment per session; no split tenders, guest-by-guest settlement, refunds, delivery, inventory quantities, loyalty, payroll payout, or live subscription/digital payment integration in the first release. Whole-line cancellation is supported under the rules below. These are proposed scope decisions, not deletions from agreed scope; see [DECISIONS](DECISIONS.md).

## 2. Actors and permissions

Roles do not replace resource checks. Every staff operation also requires an active membership, an allowed branch, an active tenant policy, and the relevant resource state. Platform roles never imply access to restaurant order details. An owner may explicitly grant a membership multiple operational roles; no implicit cashier or kitchen privilege is assumed.

| Capability | Platform admin | Owner | Manager | Waiter | Kitchen | Cashier | Guest |
|---|---|---|---|---|---|---|---|
| Tenant lifecycle and subscription metadata | Yes | Own profile read | — | — | — | — | — |
| Restaurant profile, branches, hours, tax/tip settings | — | Yes | Assigned branches, limited settings | — | — | — | — |
| Owner transfer and manager grants | — | Yes, last-owner protection | — | — | — | — | — |
| Invite/revoke operational staff | — | Yes | Assigned branches, no elevated roles | — | — | — | — |
| Categories, items, modifiers, specials, schedules | — | Yes | Assigned branches | — | Availability only | — | Published read |
| Table configuration and QR rotation | — | Yes | Assigned branches | — | — | — | — |
| Open table session / approve guest | — | Yes | Yes | Assigned tables | — | — | Request admission |
| View orders | No default | Tenant scope | Assigned branches | Assigned tables | Branch preparation projection | Branch billing projection | Own orders |
| Accept / prepare / ready items | — | With kitchen grant | With kitchen grant | — | Yes | — | — |
| Mark items served | — | With waiter grant | With waiter grant | Assigned tables | — | — | — |
| Cancel submitted own order | — | — | — | — | — | — | Own, before acceptance |
| Approve cancellation/discount/checkout reopening | — | Yes, reason required | Assigned branches, reason required | — | — | Execute approved adjustment only | — |
| Acknowledge / complete assistance | — | Yes | Yes | Assigned tables | — | — | Create/view own |
| View consolidated bill | — | Yes | Assigned branches | Assigned tables | — | Branch scope | Designated bill host |
| Request checkout / choose tip | — | Assist with explicit consent | Assist with explicit consent | Assist with explicit consent | — | Assist with explicit consent | Bill host only |
| Record cash payment and issue receipt | — | With cashier grant | With cashier grant | — | — | Yes | Host reads consolidated receipt |
| Revenue and tip reports | Aggregate platform health only | Yes | Assigned branches | Own allocated tips only | — | Branch transaction history | — |

Managers cannot grant owner/manager roles, change tenant currency or tax policy without an owner-authorized permission, or silently expand their branch scope. Staff invitations are single-use, expire, and never create authority beyond the inviter's grantable scope. Backend permission identifiers and allowed endpoint actions are defined in [Architecture](ARCHITECTURE.md).

## 3. Functional requirements and measurable outcomes

| ID | Requirement | Acceptance outcome | Phase |
|---|---|---|---|
| TEN-01 | Onboard a restaurant with owner and initial branch | Atomic creation; repeat request cannot create duplicate tenants; suspended membership cannot access it | 2 |
| TEN-02 | Maintain branding, branches, local hours, currency and tax configuration | Validated owner/manager changes; branch timezone and effective policy recorded; active bills unaffected | 3, 6 |
| TEN-03 | Staff invitation and access management | Expired/reused invitation fails; revocation invalidates access and sockets; last owner cannot be removed | 2–3 |
| MENU-01 | Categories, items, variants, modifier groups and images | CRUD persists; min/max selection enforced; unsafe images rejected; archived items remain in old receipts | 3 |
| MENU-02 | Availability, sold-out labels, specials and timed menus | Branch-local schedule enforced server-side at submission; conflicts deterministic; unavailable selections rejected | 3–5 |
| MENU-03 | Search/filter and multilingual content | English/Amharic switching; translated names/descriptions; fallback to configured base language; useful empty results | 3–4 |
| QR-01 | Table QR generation, download/print and revocation | New scans use public table locator; revoked code fails safely; no code exposes a session or bill | 4 |
| SES-01 | Staff-controlled dining sessions and admission | One active session/table; approved device grants only scoped access; new diners never inherit old access | 4 |
| ORD-01 | Cart, quantities, modifiers, notes, price review | Exact server quote; rejected changes keep cart intact; quantity/notes/line limits enforced | 4–5 |
| ORD-02 | Submit additional orders and prevent duplicates | Same idempotency key/body produces one order; changed body conflicts; concurrent checkout excludes late orders | 5 |
| ORD-03 | Track and safely cancel orders | Valid item transitions only; customers cancel only wholly submitted own orders; status recovers after reconnect | 5 |
| KIT-01 | Live kitchen queue | Shows table/time/notes; authorized accept, prepare and ready actions persist with actors/timestamps | 5 |
| SRV-01 | Waiter assignments and assistance | Assigned waiter sees requests and ready items; acknowledgment/completion persists; guest flooding is bounded | 5 |
| BILL-01 | Consolidated running bill and checkout | All noncancelled lines included once with immutable prices; mandatory charges distinct; freeze excludes new orders | 6 |
| TIP-01 | No tip, 5%, 10%, 15%, or custom tip | No tip preselected; eligible pre-tax subtotal default; tip separate from sales and linked to allocation snapshot | 6 |
| PAY-01 | Authorized cash recording | One full settlement for the invoice revision; replay safe; exact payable verified; actor, tender/change and audit recorded | 6 |
| PAY-02 | Itemized receipt and transaction history | Durable receipt after committed payment; totals and tax/tip breakdown match invoice; printing failure cannot repay bill | 6 |
| ANA-01 | Daily revenue, counts, AOV, top items, tables and tips | Reconciles to settled ledger; date boundaries use branch timezone; tips excluded from food/beverage sales | 7 |
| ADM-01 | Platform tenant/subscription operations | Admin-only lifecycle changes audited; subscription metadata does not trigger real charges | 7 |

## 4. Core workflows

### Restaurant setup

1. An owner creates an identity and verifies access through the approved onboarding channel. Onboarding atomically creates tenant, owner membership, branch, and initial policies.
2. The owner configures branding, hours, menu content/translations, table labels, staff and branch permissions.
3. Publishing requires a valid menu, supported currency, operating timezone, and configured billing policy. Draft/incomplete tenants are not publicly orderable.
4. Staff download/print QR codes. Codes contain only a revocable, unguessable locator URL; possession never grants dining-session privileges.

### Arrival and ordering

1. A guest scans a QR and can view the published menu. A waiter opens the table session. Scanning cannot replace or silently join a prior party's session.
2. The guest requests admission. The screen shows a short challenge that staff verify at the table; approval binds that specific device request to the current session. The request expires and reveals no existing order data.
3. Staff designate one admitted device as bill host with explicit scope. Other diners can place and view their own orders; a host can see the combined bill. Admission explains this group-bill visibility to diners. Reassignment is staff-controlled and audited.
4. The guest chooses items, variants, modifiers, quantities, and bounded notes. Prices are refreshed from the backend. Cart persistence is a convenience, never an authorization or pricing source.
5. Submission recalculates prices, verifies availability/admission and the session state, stores snapshots, and returns an order ID. A changed quote requires review; a lost response is retried with the same key.
6. Staff progress items through submitted, accepted, preparing, ready and served. The guest may submit more orders while the session remains open.

### Service and cancellation

Guests request categories such as waiter help, water, or a problem with an item. A waiter acknowledges then completes requests; repeated active requests of the same category are bounded. Requests never imply payment confirmation.

Guests may cancel an entire own order only before any item is accepted, with the acceptance/cancel race serialized. Staff may cancel individual unserved lines with an authorized reason; accepted/preparing lines require manager/owner approval, and served lines cannot be removed by this cancellation flow. Adjustments are explicit audit records. Quantities are not silently rewritten after acceptance.

### Checkout, tips and payment

1. The host reviews the live itemized bill. No tip is selected by default. Percentage choices use the eligible pre-tax subtotal after discounts; a custom amount is validated and confirmed without coercive prompts.
2. Checkout locks the session, freezes new orders/admissions, and produces a versioned invoice. Checkout is allowed only once all noncancelled lines are served; otherwise the UI explains remaining items and offers staff assistance.
3. The host may revise the tip before settlement, creating a new invoice revision. Staff discounts or reopening likewise invalidate prior quotes. Each request states its expected revision.
4. The cashier confirms received cash against the latest invoice. The backend rechecks all amounts and permissions, records one completed cash payment, receipt and tip allocation, closes the session, and revokes guest mutation capabilities in one transaction.
5. The guest receipt remains available through a separate bounded read-only grant. Printing/rendering can retry without generating another financial transaction. An unpaid session is never auto-closed due to inactivity.

Staff assistance with tip/checkout means helping the host confirm on the host's authorized device; it grants no staff ability to silently set a tip. A later staff-entered consent workflow would need separate explicit design and audit. A zero-payable invoice uses an authorized, audited zero-balance close and receipt without fictional cash received. An empty or fully cancelled session with no liability can instead be explicitly voided.

Future digital payments require a provider adapter, verified server-to-server evidence, replay protection, reconciliation, and separate approval. A client redirect or success page never marks a bill paid.

## 5. Financial product policy proposals

- Money uses integer minor units: ETB amounts have two decimal places. Tax/service/percentage tips use integer basis points; round half-up at explicitly defined line boundaries, never binary floating-point arithmetic.
- Proposed initial tax mode is exclusive tax with per-line half-up rounding, discounts before tax, and explicit service-charge taxability. Rates are configured after local professional validation; no statutory rate or legally compliant receipt is asserted here.
- Discounts require owner/manager permission, reason and bounds. No amount may make a payable negative. A cashier cannot self-authorize an adjustment.
- Tip eligibility defaults to discounted food/beverage subtotal, excluding tax, service charges and previous tips. No automatic tip. Tip amounts are separate liabilities/allocations, excluded from restaurant sales totals.
- Proposed allocation: 100% to the waiter assigned at checkout; if none, mark unallocated for manager resolution. Assignment and allocation snapshots survive staff deactivation. This is accounting attribution, not payroll payout.
- One currency per session, one final payment, no exchange conversion. Menu edits and policy edits cannot rewrite existing orders or finalized receipts.
- Full exact formulas, revision rules and concurrency constraints belong in [Database design](DATABASE_DESIGN.md) and [Architecture](ARCHITECTURE.md).

## 6. UX and accessibility

Use warm off-white surfaces, charcoal text, subtle neutral borders and one restrained green accent. Shared tokens define spacing, typography, radius, focus and status colors. Status must be readable without color. Avoid decorative dashboards or unsupported sales numbers.

Customer screens: welcome/menu, category browsing, item details, cart, order confirmation, tracking, service requests, bill, tip selection and checkout/receipt. Staff screens: login, dashboard, live orders, kitchen, tables, menus, specials, billing, staff, analytics and settings. Build each screen with its owning phase rather than shipping placeholder controls.

Every implemented screen needs loading, empty, error and success states; mutating controls show pending state and prevent accidental double activation. Offline/disconnected UI keeps cart content and clearly distinguishes unsent, pending confirmation, and confirmed orders. It must not automatically replay new purchases after reconnection without reconciling the prior request.

Target WCAG 2.2 AA validation, keyboard navigation, visible focus, semantic labels, announced validation errors and status updates, reduced motion, adequate contrast, and at least 44 CSS-pixel touch targets as a product standard. Validate at 360px phone width, 768px tablet and 1280px desktop, at 200% zoom, and with long Amharic strings. Use a font with tested Ethiopic glyphs. Initial Gregorian dates/Latin digits are a proposal; Ethiopian-calendar display remains an open product decision.

## 7. Reliability, performance and operational targets

These are proposed release targets, not measured promises: public menu p95 usable within 3 seconds under a documented representative mobile profile; API order commit p95 below 1 second excluding network transit; status update p95 below 2 seconds with a connected client; polling recovery within 10 seconds. Test initially with 25 tenants, 100 simultaneous guest browsers and 10 order writes/second, including a single busy table; adjust using pilot evidence.

Correctness gates are mandatory regardless of performance: zero cross-tenant disclosures in the isolation suite, zero duplicate orders/payments in tested retry scenarios, and exact reconciliation of invoices/payments/tips in financial fixtures. Public availability target is proposed at 99.5% monthly for the pilot, with planned maintenance documented; operational ownership and budget must be agreed before promising an SLA.

Backups, restore drills, alerting and release recovery are required before production. Proposed recovery objectives are RPO 15 minutes and RTO 4 hours, contingent on selected hosting and budget. They must be measured in Phase 8.

## 8. Dependencies, decisions and approval

See [DECISIONS](DECISIONS.md) for decision owners and deadlines. Phase 1 can begin only after Phase 0 approval. Guest admission/privacy and financial scope should be accepted before their data models are committed in Phase 2. Tax treatment, fiscal receipt obligations, privacy retention and payment operating policy need business validation before real use; no legal conclusion is supplied by these documents.

The [implementation plan](IMPLEMENTATION_PLAN.md) defines acceptance gates for each phase. No production deployment, live infrastructure modification, live subscription provider integration, or next phase is authorized by this planning delivery.
