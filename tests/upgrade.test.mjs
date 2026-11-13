import assert from "node:assert/strict";
import test from "node:test";
import { asActor, bootDatabase } from "./postgres.mjs";

test("upgrade keeps legacy financial records and closes the anonymous ordering path", async () => {
  let orderId;
  const db = await bootDatabase({
    beforeUpgrade: async pool => {
      const { rows: [item] } = await pool.query("select id,restaurant_id,price,name from menu_items order by created_at,id limit 1");
      const { rows: [order] } = await pool.query("insert into orders(restaurant_id,table_number,subtotal,tip,total,status) values($1,3,$2,0,$2,'served') returning id", [item.restaurant_id,item.price]);
      orderId = order.id;
      await pool.query("insert into order_items(order_id,menu_item_id,name,quantity,unit_price) values($1,$2,$3,1,$4)", [order.id,item.id,item.name,item.price]);
    },
  });
  try {
    const { rows: [saved] } = await db.pool.query("select o.subtotal,oi.unit_price,oi.quantity from orders o join order_items oi on oi.order_id=o.id where o.id=$1", [orderId]);
    assert.equal(saved.subtotal, saved.unit_price);
    assert.equal(saved.quantity, 1);
    const { rows: [permissions] } = await db.pool.query(`
      select coalesce(has_function_privilege('anon',to_regprocedure('public.place_order(text,integer,jsonb,integer,text)'),'EXECUTE'),false) as legacy
    `);
    assert.equal(permissions.legacy, false);
    // Either table-level denial or an empty RLS projection is an acceptable read policy.
    const visible = await asActor(db.pool, null, c => c.query("select id from orders where id=$1", [orderId]))
      .then(r => r.rowCount, e => { if (e.code !== "42501") throw e; return 0; });
    assert.equal(visible, 0);
  } finally { await db.stop(); }
});
