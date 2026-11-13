"use client";
import { useState } from "react";
import {
  ClipboardList,
  Coins,
  Printer,
  Table2,
  TrendingUp,
} from "lucide-react";
import { formatMoney, minorUnits } from "@/lib/ui-api";
import {
  Command,
  label,
  localTime,
  Membership,
  OrderLine,
  Session,
  StaffState,
} from "@/lib/ui-models";
import { Action, ActionForm, value } from "./actions";
import { BillView } from "./bill";
import { Empty, Field } from "./chrome";

const transitions: Record<string, [string, string, string]> = {
  new: ["accepted", "Accept", "KITCHEN"],
  accepted: ["preparing", "Start preparing", "KITCHEN"],
  preparing: ["ready", "Mark ready", "KITCHEN"],
  ready: ["served", "Mark served", "WAITER"],
};
export function selectionText(line: OrderLine) {
  const selection = line.selection as
    | { variant?: { name?: string }; options?: { name: string }[] }
    | undefined;
  return [
    selection?.variant?.name,
    ...(selection?.options ?? []).map((o) => o.name),
  ]
    .filter(Boolean)
    .join(", ");
}
export function Orders({
  data,
  ops,
  member,
  queue = false,
}: {
  data: StaffState;
  ops: Command;
  member: Membership;
  queue?: boolean;
}) {
  const [filter, setFilter] = useState(queue ? "active" : "all"),
    [search, setSearch] = useState("");
  const list = data.orders.filter(
    (o) =>
      (filter === "all" ||
        (filter === "active"
          ? !["served", "completed", "cancelled"].includes(o.status)
          : o.items.some((i) => i.status === filter))) &&
      [o.id, o.table_label, ...o.items.map((i) => i.name)]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const manager = member.roles.some((r) => ["MANAGER", "OWNER"].includes(r));
  return (
    <section className="stack">
      <div className="panel form-grid">
        <Field label="Find order">
          <input
            placeholder="Table, dish or order number"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Field>
        <Field label="Order status">
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {[
              "all",
              "active",
              "new",
              "accepted",
              "preparing",
              "ready",
              "served",
              "cancelled",
            ].map((s) => (
              <option value={s} key={s}>
                {s === "all"
                  ? "All orders"
                  : s === "active"
                    ? "In progress"
                    : label(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!list.length ? (
        <Empty
          title={queue ? "The kitchen queue is clear" : "No matching orders"}
        />
      ) : (
        list.map((o) => (
          <article className="card stack" key={o.id}>
            <div className="title-row">
              <div>
                <h2>{o.table_label}</h2>
                <p className="clock">
                  #{o.id.slice(0, 8)} · {localTime(o.created_at)}
                </p>
              </div>
              <span className="pill">{label(o.status)}</span>
            </div>
            {o.note && <p className="note">{o.note}</p>}
            {o.items.map((i) => {
              const next = transitions[i.status];
              return (
                <div className="line" key={i.id}>
                  <div>
                    <b>
                      {i.quantity} × {i.name}
                    </b>
                    <p>{selectionText(i)}</p>
                    {i.note && <p className="note">{i.note}</p>}
                    <span className="hint">{label(i.status)}</span>
                  </div>
                  {next && member.roles.includes(next[2]) && (
                    <Action
                      className="btn small primary"
                      doAction={() =>
                        ops("transition", {
                          orderId: o.id,
                          itemId: i.id,
                          status: next[0],
                        })
                      }
                    >
                      {next[1]}
                    </Action>
                  )}
                </div>
              );
            })}
            {manager &&
              o.items.some(
                (i) => !["served", "cancelled"].includes(i.status),
              ) && (
                <details className="drawer">
                  <summary>Cancel an unserved line</summary>
                  <ActionForm
                    submit="Cancel line"
                    onSubmit={(f) =>
                      ops("transition", {
                        orderId: o.id,
                        itemId: value(f, "itemId"),
                        status: "cancelled",
                        reason: value(f, "reason"),
                      })
                    }
                  >
                    <Field label="Order line">
                      <select name="itemId">
                        {o.items
                          .filter(
                            (i) => !["served", "cancelled"].includes(i.status),
                          )
                          .map((i) => (
                            <option value={i.id} key={i.id}>
                              {i.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field label="Cancellation reason">
                      <input name="reason" required maxLength={250} />
                    </Field>
                  </ActionForm>
                </details>
              )}
          </article>
        ))
      )}
    </section>
  );
}
export function Service({ data, ops }: { data: StaffState; ops: Command }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Table requests</h2>
      </div>
      {!data.requests.length ? (
        <Empty title="No service requests" />
      ) : (
        data.requests.map((r) => (
          <article key={r.id} className="line">
            <div>
              <b>
                {r.table_label} · {r.category}
              </b>
              <p>{r.note}</p>
              <p className="clock">
                {localTime(r.created_at)} · {label(r.status)}
              </p>
            </div>
            {["requested", "acknowledged"].includes(r.status) && (
              <Action
                doAction={() =>
                  ops("requestStatus", {
                    id: r.id,
                    status:
                      r.status === "requested" ? "acknowledged" : "completed",
                  })
                }
              >
                {r.status === "requested" ? "Acknowledge" : "Mark complete"}
              </Action>
            )}
          </article>
        ))
      )}
    </section>
  );
}
function Settle({ s, ops }: { s: Session; ops: Command }) {
  const bill = s.bill!;
  async function settle(f: FormData) {
    const tenderMinor = minorUnits(value(f, "cash"));
    if (BigInt(tenderMinor) < BigInt(bill.total_minor))
      throw new Error("Cash received must cover the total due.");
    const slot = "menuflow:cash:" + s.id + ":" + bill.version;
    let key = crypto.randomUUID();
    try {
      const stored = sessionStorage.getItem(slot);
      if (stored) {
        const prior = JSON.parse(stored);
        if (prior.tender === tenderMinor) key = prior.key;
      }
      sessionStorage.setItem(
        slot,
        JSON.stringify({ key, tender: tenderMinor }),
      );
    } catch {
      /* Server uniqueness still prevents duplicate settlement. */
    }
    await ops("settle", {
      sessionId: s.id,
      version: bill.version,
      tenderMinor,
      key,
    });
    try {
      sessionStorage.removeItem(slot);
    } catch {}
  }
  return (
    <ActionForm
      submit={
        bill.total_minor === "0"
          ? "Close zero balance"
          : "Confirm cash received"
      }
      onSubmit={settle}
    >
      <Field label="Cash received (ETB)">
        <input
          name="cash"
          type="number"
          min="0"
          step=".01"
          required
          defaultValue={bill.total_minor === "0" ? "0" : ""}
        />
      </Field>
      <p className="hint">
        Confirm after receiving the cash. This closes the bill and issues the
        receipt.
      </p>
    </ActionForm>
  );
}
export function Billing({
  data,
  ops,
  member,
}: {
  data: StaffState;
  ops: Command;
  member: Membership;
}) {
  const [show, setShow] = useState("");
  const admin = member.roles.some((r) => ["OWNER", "MANAGER"].includes(r));
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Current bills</h2>
        </div>
        {!data.sessions.some((s) => s.bill) ? (
          <Empty title="No open bills" />
        ) : (
          data.sessions
            .filter((s) => s.bill)
            .map((s) => (
              <details
                className="drawer"
                key={s.id}
                open={show === s.id}
                onToggle={(e) => {
                  if (e.currentTarget.open) setShow(s.id);
                  else setShow((v) => (v === s.id ? "" : v));
                }}
              >
                <summary>
                  {s.table_label} · {formatMoney(s.bill!.total_minor)} ·{" "}
                  {label(s.status)}
                </summary>
                <div className="stack">
                  <BillView bill={s.bill!} />
                  {s.status === "checkout" &&
                    member.roles.includes("CASHIER") && (
                      <Settle key={s.bill!.version} s={s} ops={ops} />
                    )}
                  {admin && s.status === "checkout" && (
                    <Action
                      confirm="Reopen ordering? The previous tip will be cleared."
                      doAction={() => ops("reopen", { sessionId: s.id })}
                    >
                      Reopen checkout
                    </Action>
                  )}
                  {admin && s.status === "open" && (
                    <details className="drawer">
                      <summary>Adjust bill</summary>
                      <ActionForm
                        submit="Apply discount"
                        onSubmit={(f) =>
                          ops("discount", {
                            sessionId: s.id,
                            amountMinor: minorUnits(value(f, "discount")),
                            reason: value(f, "reason"),
                          })
                        }
                      >
                        <Field label="Discount amount (ETB)">
                          <input
                            name="discount"
                            type="number"
                            min="0"
                            step=".01"
                            required
                          />
                        </Field>
                        <Field label="Adjustment reason">
                          <input name="reason" required maxLength={250} />
                        </Field>
                      </ActionForm>
                    </details>
                  )}
                  {admin && s.bill!.lines.length === 0 && (
                    <Action
                      confirm="Void this empty or fully cancelled visit?"
                      doAction={() => ops("void", { sessionId: s.id })}
                    >
                      Void empty visit
                    </Action>
                  )}
                </div>
              </details>
            ))
        )}
      </section>
      <section className="panel">
        <h2>Payment history</h2>
        {!data.payments.length ? (
          <Empty title="No payments for this period" />
        ) : (
          data.payments.map((p) => (
            <details className="drawer" key={p.id}>
              <summary>
                Receipt #{p.id.slice(0, 8)} ·{" "}
                {formatMoney(p.snapshot.total_minor)} · {localTime(p.issued_at)}
              </summary>
              <div className="print-target">
                <BillView bill={p.snapshot} />
                <div className="total-row">
                  <span>Cash received</span>
                  <b>{formatMoney(p.tender_minor ?? "0")}</b>
                </div>
                <div className="total-row">
                  <span>Change</span>
                  <b>{formatMoney(p.change_minor ?? "0")}</b>
                </div>
              </div>
              <button className="btn" onClick={() => window.print()}>
                <Printer size={16} />
                Print receipt
              </button>
            </details>
          ))
        )}
      </section>
    </div>
  );
}
export function Stats({
  data,
  expanded = false,
}: {
  data: StaffState;
  expanded?: boolean;
}) {
  const m = data.metrics;
  if (!m)
    return (
      <div className="stats">
        <Stat
          title="Active tables"
          value={String(data.sessions.length)}
          Icon={Table2}
        />
        <Stat
          title="Orders in view"
          value={String(data.orders.length)}
          Icon={ClipboardList}
        />
        <Stat
          title="Open service requests"
          value={String(
            data.requests.filter((r) => r.status !== "completed").length,
          )}
          Icon={ClipboardList}
        />
      </div>
    );
  return (
    <div className="stack">
      <div className="stats">
        <Stat
          title="Net sales"
          value={formatMoney(m.revenue_minor)}
          Icon={TrendingUp}
        />
        <Stat
          title="Orders placed"
          value={String(m.order_count)}
          Icon={ClipboardList}
        />
        <Stat
          title="Active tables"
          value={String(m.active_tables)}
          Icon={Table2}
        />
        {expanded && (
          <>
            <Stat
              title="Average order"
              value={formatMoney(m.average_order_minor)}
              Icon={Coins}
            />
            <Stat
              title="Completed orders"
              value={String(m.completed_orders)}
              Icon={ClipboardList}
            />
            <Stat
              title="Tips recorded"
              value={formatMoney(m.tips_minor)}
              Icon={Coins}
            />
          </>
        )}
      </div>
      {expanded && (
        <section className="panel">
          <h2>Best-selling items</h2>
          {m.best_sellers.length ? (
            m.best_sellers.map((i, n) => (
              <div className="line" key={n}>
                <strong>{i.name}</strong>
                <span>{i.quantity} sold</span>
              </div>
            ))
          ) : (
            <Empty title="No settled items in this period" />
          )}
        </section>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  Icon,
}: {
  title: string;
  value: string;
  Icon: typeof Coins;
}) {
  return (
    <article className="card">
      <div className="stat-top">
        <span>{title}</span>
        <Icon size={18} />
      </div>
      <strong className="stat-value">{value}</strong>
    </article>
  );
}
