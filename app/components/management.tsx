"use client";
import { useState } from "react";
import { Plus, QrCode } from "lucide-react";
import { api, minorUnits } from "@/lib/ui-api";
import {
  Command,
  DiningTable,
  localTime,
  Membership,
  StaffState,
  Workspace,
} from "@/lib/ui-models";
import { useResource } from "@/lib/ui-resource";
import { Action, ActionForm, value } from "./actions";
import { Empty, Field, Notice } from "./chrome";
import { Dialog } from "./dialog";
import { TableCode } from "./table-code";

export function Tables({
  w,
  state,
  manage,
  ops,
  member,
}: {
  w: Workspace;
  state: StaffState | null;
  manage: Command;
  ops: Command;
  member: Membership;
}) {
  const [qr, setQr] = useState<DiningTable | null>(null),
    [edit, setEdit] = useState<DiningTable | "new" | null>(null),
    [code, setCode] = useState<{ code: string; label: string } | null>(null);
  const manager = member.roles.some((r) => ["OWNER", "MANAGER"].includes(r)),
    service = manager || member.roles.includes("WAITER");
  async function issue(
    action: string,
    props: Record<string, unknown>,
    label: string,
  ) {
    const result = await ops(action, props);
    setCode({ code: String(result.code), label });
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Dining room</h2>
        {manager && (
          <button className="btn primary" onClick={() => setEdit("new")}>
            <Plus size={16} />
            New table
          </button>
        )}
      </div>
      {!w.tables.length ? (
        <Empty title="No tables yet">
          Create a table to generate its QR code.
        </Empty>
      ) : (
        <div className="two">
          {w.tables.map((table) => {
            const session = state?.sessions.find(
              (s) => s.table_id === table.id,
            );
            return (
              <article className="card stack" key={table.id}>
                <div className="title-row">
                  <h3>{table.label}</h3>
                  <span className="pill grey">
                    {!state
                      ? "Loading…"
                      : session
                        ? session.status
                        : "Available"}
                  </span>
                </div>
                <p className="muted">Table {table.tableNumber}</p>
                {service &&
                  state &&
                  (!session ? (
                    <Action
                      disabled={!table.qrLocator && manager}
                      className="btn primary"
                      doAction={() =>
                        issue("open", { tableId: table.id }, table.label)
                      }
                    >
                      Open table
                    </Action>
                  ) : (
                    session.status === "open" && (
                      <div className="actions">
                        <Action
                          doAction={() =>
                            issue(
                              "issueCode",
                              { sessionId: session.id, host: false },
                              table.label,
                            )
                          }
                        >
                          Guest code
                        </Action>
                        <Action
                          confirm="Designate the device redeeming this code as the bill host?"
                          doAction={() =>
                            issue(
                              "issueCode",
                              { sessionId: session.id, host: true },
                              table.label,
                            )
                          }
                        >
                          Bill host code
                        </Action>
                      </div>
                    )
                  ))}
                {session?.status === "open" && manager && (
                  <details className="drawer">
                    <summary>Assign waiter</summary>
                    <ActionForm
                      submit="Assign waiter"
                      onSubmit={(f) =>
                        ops("assign", {
                          sessionId: session.id,
                          waiterId: value(f, "waiter"),
                        })
                      }
                    >
                      <Field label="Waiter">
                        <select
                          name="waiter"
                          required
                          defaultValue={session.waiter_id ?? ""}
                        >
                          <option value="" disabled>
                            Select waiter
                          </option>
                          {w.staff
                            .filter(
                              (s) => s.active && s.roles.includes("WAITER"),
                            )
                            .map((s) => (
                              <option key={s.userId} value={s.userId}>
                                {s.email}
                              </option>
                            ))}
                        </select>
                      </Field>
                    </ActionForm>
                  </details>
                )}
                {manager && (
                  <>
                    <div className="actions">
                      {table.qrLocator && (
                        <button
                          className="btn small"
                          onClick={() => setQr(table)}
                        >
                          <QrCode size={16} />
                          Show QR code
                        </button>
                      )}
                      <button
                        className="btn small"
                        onClick={() => setEdit(table)}
                      >
                        Edit table
                      </button>
                    </div>
                    <details className="drawer">
                      <summary>Table controls</summary>
                      <div className="actions">
                        <Action
                          confirm="Generate a new QR code? Existing printed codes will stop working."
                          doAction={() =>
                            manage("table.rotate", { id: table.id })
                          }
                        >
                          {table.qrLocator ? "Rotate QR" : "Create QR"}
                        </Action>
                        {table.qrLocator && (
                          <Action
                            confirm="Deactivate this table QR code?"
                            doAction={() =>
                              manage("table.revoke", { id: table.id })
                            }
                          >
                            Revoke QR
                          </Action>
                        )}
                        <Action
                          confirm="Archive this table?"
                          doAction={() =>
                            manage("table.archive", { id: table.id })
                          }
                        >
                          Archive table
                        </Action>
                      </div>
                    </details>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {qr?.qrLocator && (
        <Dialog title="Table QR code" close={() => setQr(null)}>
          <TableCode
            locator={qr.qrLocator}
            label={qr.label}
            restaurant={w.profile.name}
          />
        </Dialog>
      )}
      {code && (
        <Dialog title="Table admission code" close={() => setCode(null)}>
          <div className="stack">
            <p>
              Give this single-use code to the guest at {code.label}. It expires
              in five minutes.
            </p>
            <output className="challenge" aria-label="Admission code">
              {code.code}
            </output>
            <button className="btn primary" onClick={() => setCode(null)}>
              Done
            </button>
          </div>
        </Dialog>
      )}
      {edit && (
        <Dialog
          title={edit === "new" ? "New dining table" : "Edit dining table"}
          close={() => setEdit(null)}
        >
          <ActionForm
            submit="Save table"
            after={() => setEdit(null)}
            onSubmit={(f) =>
              manage("table.save", {
                id: edit === "new" ? undefined : edit.id,
                label: value(f, "label"),
                tableNumber: Number(value(f, "number")),
              })
            }
          >
            <Field label="Table label">
              <input
                name="label"
                required
                maxLength={80}
                defaultValue={edit === "new" ? "" : edit.label}
              />
            </Field>
            <Field label="Table number">
              <input
                type="number"
                min="1"
                max="999"
                required
                name="number"
                defaultValue={edit === "new" ? undefined : edit.tableNumber}
              />
            </Field>
          </ActionForm>
        </Dialog>
      )}
    </section>
  );
}

const roleOptions = ["MANAGER", "WAITER", "KITCHEN", "CASHIER"];
function Roles({
  owner,
  selected = [],
}: {
  owner: boolean;
  selected?: string[];
}) {
  return (
    <fieldset className="field-set">
      <legend>Branch permissions</legend>
      <div className="tags">
        {roleOptions
          .filter((r) => r !== "MANAGER" || owner)
          .map((r) => (
            <label className="check" key={r}>
              <input
                type="checkbox"
                name="roles"
                value={r}
                defaultChecked={selected.includes(r)}
              />
              {r.toLowerCase()}
            </label>
          ))}
      </div>
    </fieldset>
  );
}
export function Team({
  w,
  manage,
  owner,
  self,
}: {
  w: Workspace;
  manage: Command;
  owner: boolean;
  self: string;
}) {
  const [link, setLink] = useState("");
  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <h2>Branch staff</h2>
        </div>
        {w.staff.map((s) => (
          <article className="line" key={s.userId}>
            <div>
              <strong>{s.email}</strong>
              <p>
                {s.roles.join(" · ")}
                {!s.active && " · Inactive"}
              </p>
            </div>
            {s.active &&
              s.userId !== self &&
              !s.roles.includes("OWNER") &&
              (owner || !s.roles.includes("MANAGER")) && (
                <details className="drawer">
                  <summary>Edit access</summary>
                  <ActionForm
                    onSubmit={(f) =>
                      manage("staff.update", {
                        id: s.userId,
                        roles: f.getAll("roles"),
                      })
                    }
                  >
                    <Roles owner={owner} selected={s.roles} />
                  </ActionForm>
                  <Action
                    confirm={"Revoke access for " + s.email + "?"}
                    doAction={() => manage("staff.revoke", { id: s.userId })}
                  >
                    Revoke access
                  </Action>
                </details>
              )}
          </article>
        ))}
      </section>
      <section className="panel stack">
        <h2>Invite staff</h2>
        <ActionForm
          submit="Create invitation"
          onSubmit={async (f) => {
            const res = await manage("staff.invite", {
              email: value(f, "email"),
              roles: f.getAll("roles"),
            });
            setLink(
              location.origin +
                "/invite?token=" +
                encodeURIComponent(String(res.token)),
            );
          }}
        >
          <Field label="Staff email">
            <input required type="email" name="email" />
          </Field>
          <Roles owner={owner} />
        </ActionForm>
        {link && (
          <div className="stack">
            <Notice>
              Share this single-use link privately with the invited staff
              member.
            </Notice>
            <Field label="Invitation link">
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </Field>
          </div>
        )}
        {w.invitations.map((i) => (
          <div className="line" key={i.id}>
            <div>
              <strong>{i.email}</strong>
              <p>
                Expires {localTime(i.expiresAt)} · {i.roles.join(", ")}
              </p>
            </div>
            <Action
              confirm="Revoke this invitation?"
              doAction={() => manage("staff.inviteRevoke", { id: i.id })}
            >
              Revoke invitation
            </Action>
          </div>
        ))}
      </section>
    </div>
  );
}
const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];
type Hours = { day: number; open: string; close: string };
export function Settings({
  w,
  manage,
  owner,
}: {
  w: Workspace;
  manage: Command;
  owner: boolean;
}) {
  const [qr, setQr] = useState(false);
  const b = w.branch,
    hours = (
      Array.isArray(b.settings?.hours) ? b.settings.hours : []
    ) as Hours[];
  return (
    <div className="stack">
      {owner && (
        <section className="panel stack">
          <h2>Restaurant profile</h2>
          <ActionForm
            success="Restaurant profile saved."
            onSubmit={async (f) => {
              const file = f.get("logo");
              let logoPath = w.profile.logoPath;
              if (file instanceof File && file.size) {
                const form = new FormData();
                form.set("branchId", b.id);
                form.set("file", file);
                logoPath = (
                  await api<{ imagePath: string }>("management/image", form)
                ).imagePath;
              }
              await manage("profile.update", {
                name: value(f, "name"),
                slug: value(f, "slug"),
                logoPath,
              });
            }}
          >
            <div className="form-grid">
              <Field label="Restaurant name">
                <input name="name" required defaultValue={w.profile.name} />
              </Field>
              <Field label="Restaurant slug">
                <input name="slug" required defaultValue={w.profile.slug} />
              </Field>
              <Field label="Restaurant logo">
                <input
                  name="logo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                />
              </Field>
            </div>
          </ActionForm>
        </section>
      )}
      <section className="panel stack">
        <h2>Branch settings</h2>
        <ActionForm
          success="Branch settings saved."
          onSubmit={(f) => {
            const opens: Hours[] = weekdays.flatMap((_, day) => {
              if (!f.has("enabled" + day)) return [];
              const open = value(f, "open" + day),
                close = value(f, "close" + day);
              if (!open || !close)
                throw new Error("Set both times for each enabled day.");
              return [{ day, open, close }];
            });
            return manage("branch.update", {
              name: value(f, "name"),
              timezone: value(f, "timezone"),
              settings: { ...b.settings, hours: opens },
              ...(owner
                ? {
                    taxBps: Number(minorUnits(value(f, "tax"))),
                    serviceBps: Number(minorUnits(value(f, "service"))),
                    tippingEnabled: f.has("tipping"),
                  }
                : {}),
            });
          }}
        >
          <div className="form-grid">
            <Field label="Branch name">
              <input required name="name" defaultValue={b.name} />
            </Field>
            <Field label="Time zone">
              <input required name="timezone" defaultValue={b.timezone} />
            </Field>
            {owner && (
              <>
                <Field label="Tax rate (%)">
                  <input
                    type="number"
                    name="tax"
                    min="0"
                    max="100"
                    step=".01"
                    defaultValue={b.taxBps / 100}
                  />
                </Field>
                <Field label="Service charge (%)">
                  <input
                    type="number"
                    name="service"
                    min="0"
                    max="100"
                    step=".01"
                    defaultValue={b.serviceBps / 100}
                  />
                </Field>
                <label className="check">
                  <input
                    type="checkbox"
                    name="tipping"
                    defaultChecked={b.tippingEnabled}
                  />
                  Allow voluntary tips
                </label>
              </>
            )}
          </div>
          <details className="drawer">
            <summary>Operating hours</summary>
            <p className="hint">
              Leave all days unchecked for unspecified hours. Otherwise,
              unchecked days are closed.
            </p>
            {weekdays.map((day, i) => {
              const h = hours.find((x) => x.day === i);
              return (
                <div key={day} className="line">
                  <label className="check">
                    <input
                      type="checkbox"
                      name={"enabled" + i}
                      defaultChecked={!!h}
                    />
                    {day}
                  </label>
                  <div className="actions">
                    <Field label={day + " opens"}>
                      <input
                        type="time"
                        name={"open" + i}
                        defaultValue={h?.open}
                      />
                    </Field>
                    <Field label={day + " closes"}>
                      <input
                        type="time"
                        name={"close" + i}
                        defaultValue={h?.close}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </details>
        </ActionForm>
      </section>
      {owner && (
        <>
          <section className="panel stack">
            <h2>Public menu QR</h2>
            <p>
              Guests can browse this branch’s menu. Table ordering uses the
              individual table QR.
            </p>
            <div className="actions">
              {b.menuLocator && (
                <button className="btn" onClick={() => setQr(true)}>
                  Show menu QR
                </button>
              )}
              <Action
                confirm={
                  b.menuLocator ? "Replace the branch menu QR?" : undefined
                }
                doAction={() => manage("branch.menuRotate")}
              >
                {b.menuLocator ? "Rotate menu QR" : "Create menu QR"}
              </Action>
              {b.menuLocator && (
                <Action
                  confirm="Deactivate the public menu QR?"
                  doAction={() => manage("branch.menuRevoke")}
                >
                  Revoke menu QR
                </Action>
              )}
            </div>
          </section>
          <section className="panel stack">
            <h2>Branches</h2>
            <ActionForm
              submit="Create branch"
              success="Branch created. Select it in the branch switcher."
              onSubmit={(f) =>
                manage("branch.create", { name: value(f, "name") })
              }
            >
              <Field label="New branch name">
                <input required name="name" />
              </Field>
            </ActionForm>
            <Action
              confirm={
                "Archive " +
                b.name +
                "? This removes its workspace from active branches."
              }
              doAction={() => manage("branch.archive")}
            >
              Archive this branch
            </Action>
          </section>
        </>
      )}
      {qr && b.menuLocator && (
        <Dialog title="Public menu QR code" close={() => setQr(false)}>
          <TableCode
            locator={b.menuLocator}
            label={b.name}
            restaurant={w.profile.name}
          />
        </Dialog>
      )}
    </div>
  );
}
type Tenant = {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  subscriptionStatus: string;
};
export function Platform() {
  const tenants = useResource<{ tenants: Tenant[] }>("platform");
  return (
    <section className="panel stack">
      <h2>Restaurant tenants</h2>
      {tenants.error && <Notice error>{tenants.error}</Notice>}
      {tenants.loading ? (
        <p>Loading tenants…</p>
      ) : (
        tenants.data?.tenants.map((t) => (
          <details key={t.id} className="drawer">
            <summary>
              {t.name} · {t.status}
            </summary>
            <ActionForm
              onSubmit={async (f) => {
                await api("platform", {
                  id: t.id,
                  status: value(f, "status"),
                  plan: value(f, "plan"),
                  subscriptionStatus: value(f, "subscriptionStatus"),
                });
                await tenants.refresh();
              }}
            >
              <Field label="Tenant status">
                <select name="status" defaultValue={t.status}>
                  <option>active</option>
                  <option>suspended</option>
                  <option>archived</option>
                </select>
              </Field>
              <Field label="Plan">
                <input name="plan" required defaultValue={t.plan ?? "pilot"} />
              </Field>
              <Field label="Subscription status">
                <select
                  name="subscriptionStatus"
                  defaultValue={t.subscriptionStatus ?? "trial"}
                >
                  {["trial", "active", "paused", "cancelled"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
            </ActionForm>
          </details>
        ))
      )}
    </section>
  );
}
