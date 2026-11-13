import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { asActor, bootDatabase, createUser } from "./postgres.mjs";

let database, pool, owner, outsider, cook, secondaryOwner, branch, secondBranch, category;
const execute = (actor, sql, args = []) =>
  asActor(pool, actor, async client => (await client.query(sql, args)).rows[0]?.result);
const manage = (actor, scope, action, data) =>
  execute(actor, "select public.mf_manage($1,$2,$3) as result", [scope, action, data]);
const workspace = (actor, scope) =>
  execute(actor, "select public.mf_workspace($1) as result", [scope]);
const publicMenu = locator =>
  execute(null, "select public.mf_public_menu($1) as result", [locator]);
const accept = (actor, token) =>
  execute(actor, "select public.mf_accept_invite($1) as result", [token]);

before(async () => {
  database = await bootDatabase();
  pool = database.pool;
  owner = await createUser(pool, "juniper@example.test");
  secondaryOwner = await createUser(pool, "rosemary@example.test");
  outsider = await createUser(pool, "thyme@example.test");
  cook = await createUser(pool, "kitchen@example.test");
  const onboard = actor => execute(actor, "select public.mf_onboard($1,$2) as result", ["Cafe", "Main"]);
  branch = (await onboard(owner)).branches[0].id;
  secondBranch = (await onboard(secondaryOwner)).branches[0].id;
  category = (await manage(owner, branch, "category.save", {
    name: "Breakfast", translations: { am: { name: "ቁርስ" } }
  })).id;
});
after(async () => { if (database) await database.stop(); });

test("tenant scope, table grants, unverified identities and legacy staff are denied by default", async () => {
  const denied = { code: "42501" };
  await assert.rejects(workspace(outsider, branch), denied);
  await assert.rejects(workspace(owner, secondBranch), denied);
  await assert.rejects(manage(secondaryOwner, branch, "category.save", { name: "Wrong tenant" }), denied);
  await assert.rejects(execute(owner, "update public.menu_items set price=0"), denied);
  await assert.rejects(execute(owner, "select * from public.staff_branch_roles"), denied);
  await assert.rejects(execute(owner, "select public.mf_platform('list','{}')"), denied);
  await assert.rejects(execute(null, "select public.mf_context()"), denied);
  const unverified = randomUUID();
  await pool.query("insert into auth.users(id,email) values($1,$2)", [unverified, "unverified@example.test"]);
  await assert.rejects(execute(unverified, "select public.mf_onboard('Unverified','Main')"), denied);
  const twice = () => execute(owner, "select public.mf_onboard('Another','Main')");
  await assert.rejects(twice, /already belongs/);
});

test("catalog maintains exact monetary values, rejects stale edits and hides unpublished items", async () => {
  const item = { categoryId: category, name: "Breakfast plate", priceMinor: 10001, available: true,
    translations: { am: { name: "ቁርስ" } }, published: true,
    variants: [{ id: "large", name: "Large", priceMinor: 16001 }],
    modifierGroups: [{ id: "sides", name: "Side", min: 0, max: 1,
      options: [{ id: "bread", name: "Bread", priceMinor: 199 }] }] };
  const { id } = await manage(owner, branch, "item.save", item);
  const scope = await workspace(owner, branch);
  const saved = scope.items.find(row => row.id === id);
  assert.equal(saved.priceMinor, 10001);
  assert.equal(saved.modifierGroups[0].options[0].priceMinor, 199);
  assert.equal(saved.variants[0].priceMinor, 16001);
  const menu = await publicMenu(scope.branch.menuLocator);
  assert.equal(menu.table, null);
  assert.equal(menu.items.find(row => row.id === id).translations.am.name, "ቁርስ");
  await manage(owner, branch, "item.save", { ...saved, published: false });
  await assert.rejects(manage(owner, branch, "item.save", saved), { code: "40001" });
  assert.ok(!(await publicMenu(scope.branch.menuLocator)).items.some(row => row.id === id));
  await manage(owner, branch, "item.availability", { id, available: false, version: saved.version + 1 });
  await assert.rejects(manage(owner, branch, "item.availability", { id, available: true, version: saved.version + 1 }), { code: "40001" });
  await assert.rejects(manage(owner, secondBranch, "item.availability", { id, available: false }), { code: "42501" });
  await assert.rejects(manage(secondaryOwner, secondBranch, "item.save", item), /active category/);
  await assert.rejects(manage(owner, branch, "item.save", { ...item, priceMinor: 1.25 }), /Integer/);
  await assert.rejects(manage(owner, branch, "item.save", { ...item, variants: [item.variants[0], item.variants[0]] }), /duplicate/);
  await manage(owner, branch, "item.delete", { id });
  assert.ok(!(await workspace(owner, branch)).items.some(row => row.id === id));
});

test("branch and tenant administration preserve isolation and scoped settings", async () => {
  const scope = await workspace(owner, branch);
  const data = { taxBps: 1500, serviceBps: 1000, tippingEnabled: false,
    settings: { hours: [{ day: 0, open: "08:00", close: "19:00" }] } };
  await manage(owner, branch, "branch.update", data);
  const changed = (await workspace(owner, branch)).branch;
  assert.equal(changed.taxBps, 1500);
  assert.equal(changed.tippingEnabled, false);
  assert.deepEqual(changed.settings.hours, data.settings.hours);
  assert.equal((await workspace(secondaryOwner, secondBranch)).branch.taxBps, 0);
  await assert.rejects(manage(owner, branch, "branch.update", { timezone: "invalid/zone" }), /timezone/);
  const { id } = await manage(owner, branch, "branch.create", {name: "Airport"});
  assert.equal((await workspace(owner, id)).branch.name, "Airport");
  const code = changed.menuLocator;
  await manage(owner, branch, "branch.menuRotate", {});
  await assert.rejects(publicMenu(code), { code: "P0002" });
  await pool.query("insert into public.platform_administrators(user_id) values ($1)", [outsider]);
  const updated = await execute(outsider, "select public.mf_platform('update',$1) as result", [{
    id: scope.profile.id, plan: "pilot", subscriptionStatus: "active", status: "active"
  }]);
  assert.equal(updated.tenants.find(t => t.id === scope.profile.id).subscriptionStatus, "active");
  await assert.rejects(workspace(outsider, branch), { code: "42501" });
});

test("table codes rotate, revoke and expose no admission capability", async () => {
  const { id } = await manage(owner, branch, "table.save", { label: "Patio", tableNumber: 8 });
  const table = async () => (await workspace(owner, branch)).tables.find(row => row.id === id);
  const first = (await table()).qrLocator;
  assert.deepEqual((await publicMenu(first)).table, { id, label: "Patio", tableNumber: 8 });
  await manage(owner, branch, "table.rotate", { id });
  const next = (await table()).qrLocator;
  assert.notEqual(first, next);
  await assert.rejects(publicMenu(first), { code: "P0002" });
  await manage(owner, branch, "table.revoke", { id });
  await assert.rejects(publicMenu(next), { code: "P0002" });
  assert.equal((await table()).qrLocator, null);
});

test("verified staff invitation is single use and only grants the selected branch roles", async () => {
  const invite = await manage(owner, branch, "staff.invite", { email: "kitchen@example.test", roles: ["KITCHEN"] });
  await assert.rejects(accept(outsider, invite.token), /unavailable/);
  const before = await workspace(owner, branch);
  assert.equal(before.invitations[0].token, undefined);
  const context = await accept(cook, invite.token);
  assert.deepEqual(context.branches[0].roles, ["KITCHEN"]);
  await assert.rejects(accept(cook, invite.token), /unavailable/);
  assert.deepEqual((await workspace(cook, branch)).staff, []);
  await assert.rejects(manage(cook, branch, "staff.invite", { email: "other@example.test", roles: ["OWNER"] }), { code: "42501" });
  await assert.rejects(manage(cook, branch, "category.save", { name: "Unauthorized" }), { code: "42501" });
  await manage(owner, branch, "staff.revoke", { id: cook });
  await assert.rejects(workspace(cook, branch), { code: "42501" });
  const expired = await manage(owner, branch, "staff.invite", { email: "kitchen@example.test", roles: ["WAITER"] });
  await pool.query("update public.staff_invitations set expires_at=now()-interval '1 second' where id=$1", [expired.id]);
  await assert.rejects(accept(cook, expired.token), /unavailable/);
});
