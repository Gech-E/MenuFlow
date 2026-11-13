import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import test from "node:test";
import { asActor, bootDatabase, createUser } from "./postgres.mjs";

// Run the same RPCs as the server with an actual PostgreSQL role boundary.
async function trusted(pool, sql, args) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role service_role");
    const result = (await client.query(sql,args)).rows[0].result;
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback"); throw error;
  } finally { client.release(); }
}

test("trusted verification settles the frozen invoice once and a failed attempt releases it for cash", async t => {
  const db = await bootDatabase();
  t.after(() => db.stop());
  const { pool } = db;
  const owner = await createUser(pool,"merchant@example.test");
  const branch = await asActor(pool,owner,async c =>
    (await c.query("select mf_onboard('Gateway fixture','Test branch') ctx")).rows[0].ctx.branches[0]);
  const scope = {restaurantId:branch.restaurantId,branchId:branch.id};
  const args = [scope.restaurantId,scope.branchId];
  const tab = (await pool.query("insert into dining_tables(restaurant_id,branch_id,label,table_number) values($1,$2,'Eight',8) returning *",args)).rows[0];
  const cat = (await pool.query("insert into menu_categories(restaurant_id,branch_id,name) values($1,$2,'Café') returning id",args)).rows[0].id;
  const itemId = (await pool.query("insert into menu_items(restaurant_id,branch_id,category_id,category,name,price,published) values($1,$2,$3,'Café','Coffee',17.01,true) returning id",[...args,cat])).rows[0].id;
  const op = (user,action,body,device=null) => asActor(pool,user,async c=>
    (await c.query("select mf_operations($1,$2,$3) r",[action,body,device])).rows[0].r);
  const staff = (action,body) => op(owner,action,{...scope,...body});
  async function invoice() {
    const device = randomBytes(32).toString("hex");
    const {sessionId,code} = await staff("open",{tableId:tab.id});
    const guest = (action,body={}) => op(null,action,body,device);
    await guest("join",{code,locator:tab.qr_locator});
    const items = [{itemId,quantity:1}];
    const quote = await guest("quote",{items});
    const order = await guest("order",{items,quoteHash:quote.quote_hash,key:randomUUID()});
    for (const status of ["accepted","preparing","ready","served"]) await staff("transition",{orderId:order.id,status});
    const state = await guest("guestState");
    const bill = await guest("checkout",{version:state.bill.version,tipPercent:5});
    return {sessionId,bill,device,guest};
  }
  const start = "select mf_gateway_begin($1,$2,$3,$4) result";
  const verify = "select mf_gateway_verify($1,$2,$3,$4,$5,$6) result";
  await t.test("verified amount, currency, merchant and host are enforced",async()=>{
    const {sessionId,bill,device,guest} = await invoice();
    assert.equal(bill.total_minor,"1786");
    const beginArgs = [sessionId,bill.version,device,scope.restaurantId];
    for (const user of [null,owner]) {
      await assert.rejects(asActor(pool,user,c=>c.query(start,beginArgs)),e=>e.code==="42501");
      await assert.rejects(asActor(pool,user,c=>c.query(verify,[randomUUID(),scope.restaurantId,"test",1786,"ETB",true])),e=>e.code==="42501");
    }
    await assert.rejects(trusted(pool,start,[sessionId,bill.version,"wrong device",scope.restaurantId]));
    await assert.rejects(trusted(pool,start,[sessionId,bill.version,device,randomUUID()]));
    await assert.rejects(trusted(pool,start,[sessionId,bill.version-1,device,scope.restaurantId]));
    const [p,retry] = await Promise.all([trusted(pool,start,beginArgs),trusted(pool,start,beginArgs)]);
    assert.equal(p.txRef,retry.txRef);
    const facts = [p.txRef,scope.restaurantId,"verified-reference",bill.total_minor,"ETB",true];
    await assert.rejects(trusted(pool,verify,[p.txRef,randomUUID(),...facts.slice(2)]));
    await assert.rejects(trusted(pool,verify,[...facts.slice(0,3),"100","ETB",true]),/mismatch/);
    await assert.rejects(trusted(pool,verify,[...facts.slice(0,4),"USD",true]),/mismatch/);
    await assert.rejects(staff("settle",{sessionId,version:bill.version,tenderMinor:bill.total_minor,key:randomUUID()}),e=>e.code==="40001");
    await assert.rejects(guest("checkout",{version:bill.version,tipPercent:0}),e=>e.code==="40001");
    await assert.rejects(staff("reopen",{sessionId}),e=>e.code==="40001");
    assert.equal((await guest("guestState")).receipt,null);
    const [receipt,repeat] = await Promise.all([trusted(pool,verify,facts),trusted(pool,verify,facts)]);
    assert.equal(receipt,repeat);
    const state = await guest("guestState");
    assert.equal(state.receipt.id,receipt);
    assert.equal(state.receipt.kind,"chapa");
    assert.equal(state.receipt.snapshot.tip_minor,"85");
    assert.equal(state.session.status,"settled");
    assert.equal(state.orders[0].status,"completed");
    await assert.rejects(trusted(pool,verify,[p.txRef,scope.restaurantId,"different-reference",bill.total_minor,"ETB",true]),/Conflicting/);
    const {rows:[counts]} = await pool.query("select (select count(*) from dining_receipts) receipts,(select count(*) from cash_payments) cash");
    assert.deepEqual(counts,{receipts:"1",cash:"0"});
    assert.equal((await staff("staffState",{})).metrics.revenue_minor,"1701");
  });
  await t.test("only a verified failure unfreezes a pending payment for the cashier",async()=>{
    const {sessionId,bill,device,guest} = await invoice();
    const p = await trusted(pool,start,[sessionId,bill.version,device,scope.restaurantId]);
    const facts = [p.txRef,scope.restaurantId,null,bill.total_minor,"ETB",false];
    await assert.rejects(trusted(pool,verify,[...facts.slice(0,3),"0","ETB",false]),/mismatch/);
    await assert.rejects(staff("reopen",{sessionId}),e=>e.code==="40001");
    assert.equal(await trusted(pool,verify,facts),null);
    assert.equal((await guest("guestState")).receipt,null);
    const cash = await staff("settle",{sessionId,version:bill.version,tenderMinor:"2000",key:randomUUID()});
    assert.equal(cash.kind,"cash");
    assert.equal(cash.change_minor,"214");
    await assert.rejects(trusted(pool,verify,[p.txRef,scope.restaurantId,"late-provider-response",bill.total_minor,"ETB",true]),/reconciliation/);
    assert.equal((await pool.query("select count(*) n from cash_payments")).rows[0].n,"1");
    assert.equal((await pool.query("select count(*) n from dining_receipts")).rows[0].n,"2");
  });
});
