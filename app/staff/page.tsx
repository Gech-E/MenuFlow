"use client";
import { useEffect, useState } from "react";
import {
  BarChart3,
  BellRing,
  BookOpen,
  ChefHat,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  ReceiptText,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Table2,
  Tag,
  Users,
} from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { api } from "@/lib/ui-api";
import {
  Command,
  Context,
  Membership,
  StaffState,
  Workspace,
} from "@/lib/ui-models";
import { useResource } from "@/lib/ui-resource";
import { Brand, Empty, Field, Header, Notice } from "../components/chrome";
import { AuthScreen } from "../components/auth-screen";
import { Action, ActionForm, value } from "../components/actions";
import { Catalog } from "../components/catalog";
import { Platform, Settings, Tables, Team } from "../components/management";
import { Billing, Orders, Service, Stats } from "../components/operations";

const views = [
  { id: "overview", name: "Overview", icon: LayoutDashboard, roles: [] },
  { id: "orders", name: "Live orders", icon: ClipboardList, roles: [] },
  { id: "kitchen", name: "Kitchen", icon: ChefHat, roles: ["KITCHEN"] },
  {
    id: "tables",
    name: "Tables & QR",
    icon: Table2,
    roles: ["OWNER", "MANAGER", "WAITER"],
  },
  {
    id: "service",
    name: "Service requests",
    icon: BellRing,
    roles: ["OWNER", "MANAGER", "WAITER"],
  },
  {
    id: "menu",
    name: "Menu",
    icon: BookOpen,
    roles: ["OWNER", "MANAGER", "KITCHEN"],
  },
  {
    id: "specials",
    name: "Daily specials",
    icon: Tag,
    roles: ["OWNER", "MANAGER", "KITCHEN"],
  },
  {
    id: "billing",
    name: "Billing",
    icon: ReceiptText,
    roles: ["OWNER", "MANAGER", "WAITER", "CASHIER"],
  },
  { id: "team", name: "Staff", icon: Users, roles: ["OWNER", "MANAGER"] },
  {
    id: "analytics",
    name: "Analytics",
    icon: BarChart3,
    roles: ["OWNER", "MANAGER"],
  },
  {
    id: "settings",
    name: "Settings",
    icon: Settings2,
    roles: ["OWNER", "MANAGER"],
  },
  { id: "platform", name: "Platform", icon: ShieldCheck, roles: [] },
];
async function signOut() {
  const { error } = await createClient().auth.signOut();
  if (error) throw error;
  location.replace("/staff");
}
function Onboard({ reload }: { reload: () => Promise<void> }) {
  return (
    <div className="site">
      <Header />
      <main id="content" className="auth-wrap">
        <section className="auth-card">
          <p className="eyebrow">Restaurant setup</p>
          <h1>Create your restaurant</h1>
          <p>Start with your restaurant and its first branch.</p>
          <ActionForm
            submit="Create restaurant"
            onSubmit={async (f) => {
              await api("management", {
                action: "onboard",
                data: {
                  name: value(f, "name"),
                  branchName: value(f, "branchName"),
                },
              });
              await reload();
            }}
          >
            <Field label="Restaurant name">
              <input required name="name" maxLength={120} />
            </Field>
            <Field label="Branch name">
              <input required name="branchName" maxLength={120} />
            </Field>
          </ActionForm>
          <div className="auth-links">
            <Link href="/invite">Join with an invitation</Link>
            <Action doAction={signOut}>Sign out</Action>
          </div>
        </section>
      </main>
    </div>
  );
}
export default function Staff() {
  const ctx = useResource<Context>("management/context", 30000);
  const [selected, setSelected] = useState("");
  if (ctx.status === 401) return <AuthScreen />;
  if (ctx.error || !ctx.data)
    return (
      <div className="site">
        <Header />
        <main id="content" className="narrow">
          {ctx.error ? (
            <>
              <Notice error>{ctx.error}</Notice>
              <button className="btn" onClick={() => void ctx.refresh()}>
                Retry
              </button>
            </>
          ) : (
            <Notice>Opening workspace…</Notice>
          )}
        </main>
      </div>
    );
  if (!ctx.data.branches.length && ctx.data.platformAdmin)
    return (
      <div className="site">
        <Header />
        <main id="content" className="main-inner stack">
          <h1>Platform administration</h1>
          <Platform />
          <Action doAction={signOut}>Sign out</Action>
        </main>
      </div>
    );
  if (!ctx.data.branches.length) return <Onboard reload={ctx.refresh} />;
  const member =
    ctx.data.branches.find((b) => b.id === selected) ?? ctx.data.branches[0];
  return (
    <StaffWorkspace
      key={member.id}
      member={member}
      context={ctx.data}
      reload={ctx.refresh}
      select={setSelected}
    />
  );
}
function StaffWorkspace({
  member,
  context,
  reload,
  select,
}: {
  member: Membership;
  context: Context;
  reload: () => Promise<void>;
  select: (id: string) => void;
}) {
  const available = views.filter((v) =>
    v.id === "platform"
      ? context.platformAdmin
      : !v.roles.length || v.roles.some((r) => member.roles.includes(r)),
  );
  const [view, setView] = useState("overview"),
    [range, setRange] = useState({ from: "", to: "" });
  useEffect(() => {
    const update = () => {
      const hash = location.hash.slice(1);
      if (views.some((v) => v.id === hash)) setView(hash);
    };
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  const active = available.find((v) => v.id === view) ?? available[0];
  const query = new URLSearchParams({
    view: "staff",
    branchId: member.id,
    restaurantId: member.restaurantId,
  });
  if (range.from) query.set("from", range.from);
  if (range.to) query.set("to", range.to);
  const ws = useResource<Workspace>("management?branchId=" + member.id, 20000),
    op = useResource<StaffState>("operations?" + query, 4000);
  async function refresh() {
    await Promise.all([ws.refresh(), op.refresh(), reload()]);
  }
  const manage: Command = async (action, data = {}) => {
    const result = await api<Record<string, unknown>>("management", {
      action,
      branchId: member.id,
      data,
    });
    await ws.refresh();
    if (action.startsWith("branch.") || action === "profile.update")
      await reload();
    return result;
  };
  const ops: Command = async (action, data = {}) => {
    const result = await api<Record<string, unknown>>("operations", {
      action,
      branchId: member.id,
      restaurantId: member.restaurantId,
      ...data,
    });
    await op.refresh();
    return result;
  };
  const manager =
    member.roles.includes("OWNER") || member.roles.includes("MANAGER");
  const go = (id: string) => {
    setView(id);
    history.replaceState(null, "", "#" + id);
  };
  const w = ws.data,
    d = op.data,
    id = active.id;
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Brand />
        <nav className="nav" aria-label="Staff navigation">
          {available.map((v) => (
            <button
              key={v.id}
              className={"nav-item " + (id === v.id ? "active" : "")}
              aria-current={id === v.id ? "page" : undefined}
              onClick={() => go(v.id)}
            >
              <v.icon size={18} />
              {v.name}
            </button>
          ))}
        </nav>
        <div className="account">
          <small>{context.email}</small>
          <Action className="text-link" doAction={signOut}>
            <LogOut size={15} />
            Sign out
          </Action>
        </div>
      </aside>
      <main className="app-main" id="content">
        <header className="app-top">
          <div>
            <strong>{member.restaurantName}</strong>
            <p className="hint">Staff workspace</p>
          </div>
          <div className="actions">
            <select
              aria-label="Active branch"
              value={member.id}
              onChange={(e) => select(e.target.value)}
            >
              {context.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.restaurantName} · {b.name}
                </option>
              ))}
            </select>
            <button
              className="btn icon"
              aria-label="Refresh workspace"
              onClick={() => void refresh()}
            >
              <RefreshCw size={16} />
            </button>
            <span className="mobile-signout" style={{ display: "none" }}>
              <Action className="btn small" doAction={signOut}>
                Sign out
              </Action>
            </span>
          </div>
        </header>
        <div className="main-inner stack">
          <div className="page-head">
            <p className="eyebrow">
              <span className="dot" />
              {member.name}
            </p>
            <h1>{active.name}</h1>
          </div>
          {ws.error && <Notice error>{ws.error}</Notice>}
          {op.error && <Notice error>{op.error}</Notice>}
          {(id === "billing" || id === "analytics") && (
            <details className="panel">
              <summary>Report date range</summary>
              <ActionForm
                submit="Apply dates"
                onSubmit={async (f) => {
                  const from = value(f, "from"),
                    to = value(f, "to");
                  if (to < from)
                    throw new Error("End date must be on or after start date.");
                  setRange({ from, to });
                }}
              >
                <div className="form-grid">
                  <Field label="Start date">
                    <input
                      type="date"
                      required
                      name="from"
                      defaultValue={range.from}
                    />
                  </Field>
                  <Field label="End date">
                    <input
                      type="date"
                      required
                      name="to"
                      defaultValue={range.to}
                    />
                  </Field>
                </div>
              </ActionForm>
              <button
                className="text-link"
                onClick={() => setRange({ from: "", to: "" })}
              >
                Show today
              </button>
            </details>
          )}
          {id === "overview" &&
            (d ? (
              <>
                <Stats data={d} />
                <section className="panel">
                  <div className="panel-head">
                    <h2>Recent orders</h2>
                    <button className="text-link" onClick={() => go("orders")}>
                      View all orders
                    </button>
                  </div>
                  {d.orders.length ? (
                    d.orders.slice(0, 5).map((o) => (
                      <div className="line" key={o.id}>
                        <div>
                          <strong>{o.table_label}</strong>
                          <p>
                            {o.items
                              .map((l) => l.quantity + " × " + l.name)
                              .join(", ")}
                          </p>
                        </div>
                        <span className="pill">{o.status}</span>
                      </div>
                    ))
                  ) : (
                    <Empty title="No orders yet">
                      Orders appear here when guests submit them from their
                      table.
                    </Empty>
                  )}
                </section>
              </>
            ) : (
              <Notice>Loading operations…</Notice>
            ))}
          {(id === "menu" || id === "specials") && w && (
            <Catalog
              workspace={w}
              manage={manage}
              edit={manager}
              onlySpecials={id === "specials"}
            />
          )}
          {id === "tables" && w && (
            <Tables w={w} state={d} manage={manage} ops={ops} member={member} />
          )}
          {(id === "orders" || id === "kitchen") && d && (
            <Orders
              key={id}
              member={member}
              data={d}
              ops={ops}
              queue={id === "kitchen"}
            />
          )}
          {id === "service" && d && <Service data={d} ops={ops} />}
          {id === "billing" && d && (
            <Billing data={d} ops={ops} member={member} />
          )}
          {id === "team" && w && (
            <Team
              w={w}
              manage={manage}
              self={context.userId}
              owner={member.roles.includes("OWNER")}
            />
          )}
          {id === "analytics" && d && <Stats data={d} expanded />}
          {id === "settings" && w && (
            <Settings
              w={w}
              manage={manage}
              owner={member.roles.includes("OWNER")}
            />
          )}
          {id === "platform" && <Platform />}
          {id !== "overview" && (ws.loading || op.loading) && (
            <p role="status">Loading workspace…</p>
          )}
        </div>
      </main>
    </div>
  );
}
