# MenuFlow shared-order setup

The original `/` route remains a browser-only demo. The database-backed customer route is `/live?table=1`, and the authenticated staff route is `/staff`.

## Required steps
1. In the Supabase project SQL Editor, run `supabase/migrations/202611060001_menuflow.sql`. Review the SQL before running.
2. In Vercel's **menu-flow** project, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to Production, Preview and Development, then redeploy. Set the publishable key from the Supabase dashboard; never use a service-role key in browser code.
3. In Supabase Authentication, create or invite a staff user and enable email/password login. Verify their email as appropriate.
4. In Supabase SQL Editor, assign the authenticated user to the demo restaurant:
   ```sql
   insert into public.staff_members(user_id,restaurant_id)
   select 'REPLACE_WITH_AUTH_USER_UUID'::uuid,id from public.restaurants where slug='demo'
   on conflict do nothing;
   ```
5. Open `/staff` and sign in. On a different device, open `/live?table=1` and place a test order. The staff dashboard polls every five seconds.
6. Generate a QR code using a trusted QR generator for the complete `/live?table=N` URL, one per table.

## Security and operational notes
- Customers never submit prices. A Postgres RPC recomputes totals using database prices.
- RLS protects orders and staff menu writes. Staff memberships must be provisioned by a trusted database administrator.
- No online payments are processed. Tips are recorded as part of the bill, not collected.
- The public RPC should be protected by rate limits, bot protection and abuse monitoring before wide release.
- This is a single demo restaurant; multi-tenant onboarding, order cancellation rules, kitchen printers, tax/invoice rules, payment reconciliation, and end-to-end testing remain future work.
- Do not publish a staff login or accept real paid orders until you verify the schema, policies, and operations end to end.
