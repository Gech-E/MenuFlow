"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BellRing,
  BookOpen,
  ClipboardList,
  Globe,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  Utensils,
  Printer,
} from "lucide-react";
import { api, ApiError, formatMoney, minorUnits } from "@/lib/ui-api";
import { useResource } from "@/lib/ui-resource";
import {
  CartLine,
  GuestState,
  imageUrl,
  label,
  localTime,
  MenuItem,
  PublicMenu,
} from "@/lib/ui-models";
import { Action, ActionForm, value } from "./actions";
import { BillView } from "./bill";
import { Brand, Empty, Field, Notice } from "./chrome";
import { Dialog } from "./dialog";

const fresh = () => ({
  lines: [] as CartLine[],
  quote: null as { quote_hash: string; subtotal_minor: string } | null,
  key: "",
  submitted: false,
  note: "",
});
function itemName(i: MenuItem, am: boolean) {
  return am && i.translations?.am?.name ? i.translations.am.name : i.name;
}
const send = (action: string, data: Record<string, unknown> = {}) =>
  api<Record<string, unknown>>("operations", { action, ...data });
function Customize({
  item,
  am,
  add,
  close,
}: {
  item: MenuItem;
  am: boolean;
  add: (line: CartLine) => void;
  close: () => void;
}) {
  const t = (en: string, translated: string) => (am ? translated : en);
  const [optionIds, setOptionIds] = useState<string[]>([]),
    [err, setErr] = useState("");
  return (
    <Dialog title={itemName(item, am)} close={close}>
      <p className="muted">
        {(am && item.translations?.am?.description) || item.description}
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const invalid = item.modifierGroups.find((g) => {
            const count = g.options.filter((o) =>
              optionIds.includes(o.id),
            ).length;
            return count < g.min || count > g.max;
          });
          if (invalid) {
            setErr(
              t("Check the number of selections for ", "ምርጫዎን ያረጋግጡ፦ ") +
                invalid.name,
            );
            return;
          }
          add({
            itemId: item.id,
            quantity: Number(value(f, "quantity")),
            variantId: value(f, "variant") || undefined,
            optionIds,
            note: value(f, "note"),
          });
          close();
        }}
      >
        {item.variants.length > 0 && (
          <Field label={t("Variant", "ዓይነት")}>
            <select name="variant" required defaultValue="">
              <option value="" disabled>
                {t("Choose a variant", "ዓይነት ይምረጡ")}
              </option>
              {item.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · {formatMoney(v.priceMinor)}
                </option>
              ))}
            </select>
          </Field>
        )}
        {item.modifierGroups.map((g) => (
          <fieldset className="field-set" key={g.id}>
            <legend>
              {g.name} ({g.min}–{g.max})
            </legend>
            {g.options.map((o) => (
              <label key={o.id} className="check">
                <input
                  type="checkbox"
                  checked={optionIds.includes(o.id)}
                  onChange={(e) =>
                    setOptionIds(
                      e.target.checked
                        ? [...optionIds, o.id]
                        : optionIds.filter((id) => id !== o.id),
                    )
                  }
                />
                {o.name} {o.priceMinor > 0 && "+ " + formatMoney(o.priceMinor)}
              </label>
            ))}
          </fieldset>
        ))}
        <Field label={t("Quantity", "ብዛት")}>
          <input
            type="number"
            min={1}
            max={20}
            name="quantity"
            defaultValue={1}
            required
          />
        </Field>
        <Field label={t("Preparation instructions (optional)", "መመሪያ (አማራጭ)")}>
          <textarea name="note" maxLength={240} />
        </Field>
        {err && <Notice error>{err}</Notice>}
        <button className="btn primary">
          {t("Add to cart", "ወደ ቅርጫት ጨምር")}
        </button>
      </form>
    </Dialog>
  );
}
export function GuestMenu({ locator }: { locator: string }) {
  const menu = useResource<PublicMenu>(
    "public/menu/" + encodeURIComponent(locator),
    20000,
  );
  const guest = useResource<GuestState>(
    menu.data?.table ? "operations?view=guest" : null,
    4000,
  );
  const [am, setAm] = useState(false);
  if (!menu.data)
    return (
      <div className="guest-shell">
        <header className="public-header">
          <Brand />
        </header>
        <main id="content" className="narrow">
          {menu.error ? (
            <>
              <h1>Menu unavailable</h1>
              <Notice error>{menu.error}</Notice>
              <button className="btn" onClick={() => void menu.refresh()}>
                Try again
              </button>
            </>
          ) : (
            <Notice>Loading menu…</Notice>
          )}
        </main>
      </div>
    );
  const session = guest.data?.session;
  const connected = !!session && session.table_id === menu.data.table?.id;
  return (
    <GuestVisit
      key={locator + ":" + (connected ? session.id : "browse")}
      locator={locator}
      menu={menu.data}
      guest={connected ? guest.data : null}
      refresh={guest.refresh}
      loading={!!menu.data.table && guest.loading}
      error={menu.error || guest.error}
      am={am}
      setAm={setAm}
    />
  );
}
function GuestVisit({
  locator,
  menu,
  guest,
  refresh,
  loading,
  error,
  am,
  setAm,
}: {
  locator: string;
  menu: PublicMenu;
  guest: GuestState | null;
  refresh: () => Promise<void>;
  loading: boolean;
  error: string;
  am: boolean;
  setAm: (v: boolean) => void;
}) {
  const t = (en: string, translated: string) => (am ? translated : en);
  const s = guest?.session,
    host = !!s?.is_host,
    canOrder = s?.status === "open";
  const [tab, setTab] = useState("menu"),
    [cat, setCat] = useState(""),
    [search, setSearch] = useState(""),
    [special, setSpecial] = useState(false),
    [detail, setDetail] = useState<MenuItem | null>(null);
  const [cart, setCart] = useState(fresh),
    [hydrated, setHydrated] = useState(false),
    [status, setStatus] = useState(""),
    [tip, setTip] = useState("");
  const storage = s ? "menuflow:cart:" + s.id : null;
  useEffect(() => {
    if (storage) {
      try {
        const raw = sessionStorage.getItem(storage);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.lines)) setCart({ ...fresh(), ...parsed });
        }
      } catch {
        /* Storage can be unavailable in private browsing. */
      }
    }
    setHydrated(true);
  }, [storage]);
  useEffect(() => {
    if (hydrated && storage) {
      try {
        sessionStorage.setItem(storage, JSON.stringify(cart));
      } catch {
        /* Cart remains usable in memory. */
      }
    }
  }, [hydrated, storage, cart]);
  function edit(lines: CartLine[]) {
    setCart((c) => ({ ...c, lines, quote: null, key: "", submitted: false }));
    setStatus("");
  }
  const count = cart.lines.reduce((sum, i) => sum + i.quantity, 0);
  const available = menu.items.filter(
    (i) =>
      (!cat || i.categoryId === cat) &&
      (!special || i.special) &&
      [
        i.name,
        i.description,
        i.translations?.am?.name,
        i.translations?.am?.description,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  async function submit() {
    if (!cart.quote || !cart.key)
      throw new Error(t("Review your order first.", "ትዕዛዝዎን ያረጋግጡ።"));
    const pending = { ...cart, submitted: true };
    setCart(pending);
    if (storage) {
      try {
        sessionStorage.setItem(storage, JSON.stringify(pending));
      } catch {
        /* Keep key in memory. */
      }
    }
    try {
      const result = await send("order", {
        items: cart.lines,
        quoteHash: cart.quote.quote_hash,
        key: cart.key,
        note: cart.note,
      });
      setCart(fresh());
      setTab("orders");
      setStatus(
        t("Order received", "ትዕዛዙ ደርሷል") +
          " · " +
          String(result.id).slice(0, 8),
      );
      await refresh();
    } catch (e) {
      if (e instanceof ApiError && e.status >= 400 && e.status < 500)
        setCart((c) => ({ ...c, quote: null, key: "", submitted: false }));
      throw e;
    }
  }
  return (
    <div className="guest-shell" lang={am ? "am" : "en"}>
      <header className="public-header">
        <Brand />
        <button
          className="btn small"
          aria-label="Switch menu language"
          onClick={() => setAm(!am)}
        >
          <Globe size={16} />
          {am ? "English" : "አማርኛ"}
        </button>
      </header>
      <main id="content">
        <div className="guest-banner">
          <p className="eyebrow">
            <span className="dot" />
            {menu.branch.name}
            {menu.table && " · " + menu.table.label}
          </p>
          <h1>{menu.restaurant.name}</h1>
          <p className="muted">
            {menu.table
              ? t("Your table menu", "የጠረጴዛዎ ምናሌ")
              : t("Restaurant menu", "የምግብ ቤት ምናሌ")}
          </p>
        </div>
        {error && <Notice error>{error}</Notice>}
        {status && <Notice>{status}</Notice>}
        <nav
          className="guest-nav"
          aria-label={t("Table navigation", "የጠረጴዛ አሰሳ")}
        >
          {[
            { id: "menu", text: t("Menu", "ምናሌ"), Icon: BookOpen },
            {
              id: "cart",
              text: t("Cart", "ቅርጫት") + " (" + count + ")",
              Icon: ShoppingBag,
            },
            {
              id: "orders",
              text: t("My orders", "ትዕዛዞቼ"),
              Icon: ClipboardList,
            },
            { id: "service", text: t("Service", "አገልግሎት"), Icon: BellRing },
            { id: "bill", text: t("Bill", "ሂሳብ"), Icon: ReceiptText },
          ]
            .filter((x) => x.id === "menu" || (s && (x.id !== "bill" || host)))
            .map(({ id, text, Icon }) => (
              <button
                className={"btn small " + (tab === id ? "primary" : "")}
                aria-pressed={tab === id}
                key={id}
                onClick={() => setTab(id)}
              >
                <Icon size={15} />
                {text}
              </button>
            ))}
        </nav>
        {tab === "menu" && (
          <div className="guest-layout">
            <section className="stack">
              <div className="search">
                <Search size={18} />
                <input
                  aria-label={t("Search menu", "ምናሌ ፈልግ")}
                  placeholder={t("Search dishes and drinks", "ምግብና መጠጥ ፈልግ")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="tags">
                <button
                  className={"chip " + (!cat ? "active" : "")}
                  onClick={() => setCat("")}
                >
                  {t("All categories", "ሁሉም")}
                </button>
                {menu.categories.map((c) => (
                  <button
                    className={"chip " + (cat === c.id ? "active" : "")}
                    onClick={() => setCat(c.id)}
                    key={c.id}
                  >
                    {(am && c.translations?.am?.name) || c.name}
                  </button>
                ))}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={special}
                    onChange={(e) => setSpecial(e.target.checked)}
                  />
                  {t("Specials only", "የዕለቱ ምርጫ")}
                </label>
              </div>
              {!available.length ? (
                <Empty title={t("No matching items", "ምንም አልተገኘም")}>
                  {t("Try another category or search.", "ሌላ ምድብ ወይም ስም ይሞክሩ።")}
                </Empty>
              ) : (
                <div className="menu-grid">
                  {available.map((i) => (
                    <article key={i.id} className="card item-card">
                      {imageUrl(i.imagePath) && (
                        <Image
                          alt=""
                          className="menu-image"
                          src={imageUrl(i.imagePath)!}
                          width={460}
                          height={260}
                          unoptimized
                        />
                      )}
                      <div className="item-copy">
                        {i.special && (
                          <div>
                            <span className="pill">
                              {t("Daily special", "የዕለቱ ልዩ")}
                            </span>
                          </div>
                        )}
                        <h3>{itemName(i, am)}</h3>
                        <p className="muted">
                          {(am && i.translations?.am?.description) ||
                            i.description}
                        </p>
                        <strong className="amount">
                          {formatMoney(
                            i.special && i.specialPriceMinor != null
                              ? i.specialPriceMinor
                              : i.priceMinor,
                            menu.branch.currency,
                          )}
                        </strong>
                        {canOrder ? (
                          <button
                            className="btn small"
                            disabled={!i.available || cart.submitted}
                            aria-label={t("Choose ", "ይምረጡ ") + itemName(i, am)}
                            onClick={() => setDetail(i)}
                          >
                            {i.available ? (
                              <>
                                <Plus size={15} />
                                {t("Choose item", "ይምረጡ")}
                              </>
                            ) : (
                              t("Sold out", "አልቋል")
                            )}
                          </button>
                        ) : (
                          !i.available && (
                            <span className="pill grey">
                              {t("Sold out", "አልቋል")}
                            </span>
                          )
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            <aside className="guest-panel guest-aside stack">
              <span className="square-icon">
                <Utensils size={22} />
              </span>
              {s ? (
                <>
                  <h2>{s.table_label}</h2>
                  <p>
                    {host
                      ? t(
                          "You can order and manage the combined bill for this table.",
                          "መጠየቅና የጠረጴዛውን ሙሉ ሂሳብ ማየት ይችላሉ።",
                        )
                      : t(
                          "Place and track your own orders here.",
                          "ትዕዛዝዎን ይላኩ እና ይከታተሉ።",
                        )}
                  </p>
                  <button
                    className="btn primary"
                    onClick={() =>
                      setTab(
                        s.status === "open" ? "cart" : host ? "bill" : "orders",
                      )
                    }
                  >
                    {s.status === "open"
                      ? t("View cart", "ቅርጫት ይመልከቱ") + " (" + count + ")"
                      : t("View visit", "ይመልከቱ")}
                  </button>
                </>
              ) : menu.table ? (
                <>
                  <h2>{t("Join this table", "ጠረጴዛውን ይቀላቀሉ")}</h2>
                  <p>
                    {t(
                      "Ask your waiter for your single-use table code. The bill host can view the combined bill.",
                      "የጠረጴዛውን ኮድ ከአስተናጋጅዎ ይጠይቁ። የሂሳብ ኃላፊው የጋራ ሂሳቡን ማየት ይችላል።",
                    )}
                  </p>
                  <ActionForm
                    submit={t("Join table", "ጠረጴዛ ይቀላቀሉ")}
                    disabled={loading}
                    onSubmit={async (f) => {
                      await send("join", {
                        locator,
                        code: value(f, "code").toUpperCase(),
                      });
                      await refresh();
                    }}
                  >
                    <Field label={t("Table code", "የጠረጴዛ ኮድ")}>
                      <input
                        name="code"
                        autoComplete="one-time-code"
                        required
                        maxLength={32}
                      />
                    </Field>
                  </ActionForm>
                </>
              ) : (
                <>
                  <h2>{t("Ordering at a table?", "ከጠረጴዛ ማዘዝ ይፈልጋሉ?")}</h2>
                  <p>
                    {t(
                      "Scan your table’s QR code and ask your waiter for a table code.",
                      "የጠረጴዛዎን QR ኮድ ይቃኙ።",
                    )}
                  </p>
                </>
              )}
            </aside>
          </div>
        )}
        {tab === "cart" && s && (
          <section className="guest-panel stack">
            <h2>{t("Your cart", "ቅርጫትዎ")}</h2>
            {!count ? (
              <Empty title={t("Your cart is empty", "ቅርጫትዎ ባዶ ነው")} />
            ) : (
              <>
                {cart.lines.map((l, i) => {
                  const item = menu.items.find((v) => v.id === l.itemId);
                  return (
                    <div className="line" key={i}>
                      <div>
                        <strong>
                          {item
                            ? itemName(item, am)
                            : t("Unavailable item", "የማይገኝ")}
                        </strong>
                        <p>
                          {[
                            item?.variants.find((v) => v.id === l.variantId)
                              ?.name,
                            ...(item?.modifierGroups.flatMap((g) =>
                              g.options
                                .filter((o) => l.optionIds?.includes(o.id))
                                .map((o) => o.name),
                            ) ?? []),
                            l.note,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <div className="actions">
                        <button
                          className="btn icon"
                          disabled={cart.submitted}
                          aria-label="Decrease quantity"
                          onClick={() =>
                            edit(
                              cart.lines.flatMap((v, j) =>
                                j !== i
                                  ? [v]
                                  : v.quantity > 1
                                    ? [{ ...v, quantity: v.quantity - 1 }]
                                    : [],
                              ),
                            )
                          }
                        >
                          <Minus size={14} />
                        </button>
                        <b>{l.quantity}</b>
                        <button
                          className="btn icon"
                          disabled={l.quantity >= 20 || cart.submitted}
                          aria-label="Increase quantity"
                          onClick={() =>
                            edit(
                              cart.lines.map((v, j) =>
                                j === i
                                  ? { ...v, quantity: v.quantity + 1 }
                                  : v,
                              ),
                            )
                          }
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                <Field label={t("Order note (optional)", "ማስታወሻ (አማራጭ)")}>
                  <textarea
                    maxLength={240}
                    disabled={cart.submitted}
                    value={cart.note}
                    onChange={(e) =>
                      setCart((c) => ({
                        ...c,
                        note: e.target.value,
                        quote: null,
                        key: "",
                      }))
                    }
                  />
                </Field>
                {!cart.quote ? (
                  <Action
                    className="btn primary"
                    disabled={!canOrder}
                    doAction={async () => {
                      const quote = await api<{
                        quote_hash: string;
                        subtotal_minor: string;
                      }>("operations", { action: "quote", items: cart.lines });
                      setCart((c) => ({
                        ...c,
                        quote,
                        key: crypto.randomUUID(),
                      }));
                    }}
                  >
                    {t("Review order", "ትዕዛዝ ያረጋግጡ")}
                  </Action>
                ) : (
                  <>
                    <div className="total-row">
                      <strong>
                        {t("Confirmed subtotal", "የተረጋገጠ ንዑስ ድምር")}
                      </strong>
                      <strong>{formatMoney(cart.quote.subtotal_minor)}</strong>
                    </div>
                    {cart.submitted && (
                      <Notice>
                        {t(
                          "Checking a previous submission? Use the same order below to retry safely.",
                          "ቀደም ሲል የተላከውን ትዕዛዝ እንደገና ያረጋግጡ።",
                        )}
                      </Notice>
                    )}
                    <Action className="btn primary" doAction={submit}>
                      {cart.submitted
                        ? t("Retry order confirmation", "እንደገና ያረጋግጡ")
                        : t("Place order", "ትዕዛዝ ይላኩ")}
                    </Action>
                  </>
                )}
              </>
            )}
          </section>
        )}
        {tab === "orders" && guest && (
          <section className="stack">
            <h2>{t("My orders", "ትዕዛዞቼ")}</h2>
            {guest.orders.length ? (
              guest.orders.map((o) => (
                <article className="card stack" key={o.id}>
                  <div className="title-row">
                    <h3>#{o.id.slice(0, 8)}</h3>
                    <span className="pill">{label(o.status)}</span>
                  </div>
                  <p className="clock">{localTime(o.created_at)}</p>
                  {o.items.map((i) => (
                    <div className="line" key={i.id}>
                      <span>
                        {i.quantity} × {i.name}
                      </span>
                      <span>{label(i.status)}</span>
                    </div>
                  ))}
                  <strong>{formatMoney(o.subtotal_minor)}</strong>
                  {o.status === "new" && (
                    <Action
                      confirm={t("Cancel this order?", "ትዕዛዙ ይሰረዝ?")}
                      doAction={async () => {
                        await send("cancel", { orderId: o.id });
                        await refresh();
                      }}
                    >
                      {t("Cancel order", "ትዕዛዝ ይሰርዙ")}
                    </Action>
                  )}
                </article>
              ))
            ) : (
              <Empty title={t("No orders yet", "ምንም ትዕዛዝ የለም")} />
            )}
          </section>
        )}
        {tab === "service" && guest && (
          <section className="guest-panel stack">
            <h2>{t("Request assistance", "እርዳታ ይጠይቁ")}</h2>
            <ActionForm
              submit={t("Send request", "ጥያቄ ይላኩ")}
              onSubmit={async (f) => {
                await send("request", {
                  category: value(f, "category"),
                  note: value(f, "note"),
                });
                await refresh();
              }}
            >
              <Field label={t("Reason", "ምክንያት")}>
                <select name="category">
                  <option value="waiter">
                    {t("Waiter assistance", "አስተናጋጅ")}
                  </option>
                  <option value="water">{t("Water", "ውሃ")}</option>
                  <option value="other">{t("Other", "ሌላ")}</option>
                </select>
              </Field>
              <Field label={t("Message (optional)", "መልዕክት (አማራጭ)")}>
                <textarea name="note" maxLength={240} />
              </Field>
            </ActionForm>
            {guest.requests.map((r) => (
              <div className="line" key={r.id}>
                <strong>{label(r.category)}</strong>
                <span className="pill">{label(r.status)}</span>
              </div>
            ))}
          </section>
        )}
        {tab === "bill" && host && guest && (
          <section className="guest-panel stack">
            {guest.receipt ? (
              <>
                <h2>{t("Paid receipt", "የተከፈለ ደረሰኝ")}</h2>
                <p>
                  #{guest.receipt.id.slice(0, 8)} ·{" "}
                  {localTime(guest.receipt.issued_at)}
                </p>
                <BillView bill={guest.receipt.snapshot} am={am} />
                <button className="btn" onClick={() => window.print()}>
                  <Printer size={16} />
                  {t("Print receipt", "ደረሰኝ ያትሙ")}
                </button>
              </>
            ) : guest.bill ? (
              <>
                <h2>{t("Table bill", "የጠረጴዛ ሂሳብ")}</h2>
                <BillView bill={guest.bill} am={am} />
                <ActionForm
                  submit={
                    s?.status === "checkout"
                      ? t("Update tip", "ጉርሻ ያዘምኑ")
                      : t("Request checkout", "ሂሳብ ይጠይቁ")
                  }
                  onSubmit={async (f) => {
                    await send("checkout", {
                      version: guest.bill!.version,
                      ...(tip === "custom"
                        ? { tipMinor: minorUnits(value(f, "custom")) }
                        : { tipPercent: Number(tip || 0) }),
                    });
                    await refresh();
                    setStatus(
                      t(
                        "Checkout updated. Pay your cashier at the restaurant.",
                        "ሂሳብዎ ተዘጋጅቷል። ለገንዘብ ተቀባዩ ይክፈሉ።",
                      ),
                    );
                  }}
                >
                  <fieldset
                    className="field-set"
                    disabled={guest.bill.tipping_enabled === false}
                  >
                    <legend>{t("Optional tip", "አማራጭ ጉርሻ")}</legend>
                    <div className="tags">
                      {["0", "5", "10", "15", "custom"].map((v) => (
                        <label className="check" key={v}>
                          <input
                            type="radio"
                            name="tip"
                            value={v}
                            checked={tip === v}
                            onChange={() => setTip(v)}
                          />
                          {v === "0"
                            ? t("No tip", "ያለ ጉርሻ")
                            : v === "custom"
                              ? t("Custom", "ሌላ መጠን")
                              : v + "%"}
                        </label>
                      ))}
                    </div>
                    {tip === "custom" && (
                      <Field label={t("Custom tip in ETB", "ጉርሻ በብር")}>
                        <input
                          type="number"
                          min="0"
                          step=".01"
                          name="custom"
                          required
                        />
                      </Field>
                    )}
                  </fieldset>
                </ActionForm>
                {menu.gatewayEnabled &&
                  s?.status === "checkout" &&
                  BigInt(guest.bill.total_minor) > 0 && (
                    <ActionForm
                      submit={t("Pay with Chapa", "በቻፓ ይክፈሉ")}
                      onSubmit={async (f) => {
                        const result = await api<{ checkoutUrl: string }>(
                          "operations/chapa",
                          {
                            sessionId: s.id,
                            version: guest.bill!.version,
                            email: value(f, "email"),
                            locator,
                          },
                        );
                        location.assign(result.checkoutUrl);
                      }}
                    >
                      <Field
                        label={t("Payment receipt email", "የክፍያ ደረሰኝ ኢሜይል")}
                      >
                        <input
                          type="email"
                          name="email"
                          required
                          autoComplete="email"
                        />
                      </Field>
                    </ActionForm>
                  )}
              </>
            ) : (
              <Empty title={t("Bill unavailable", "ሂሳብ አልተገኘም")} />
            )}
          </section>
        )}
        {detail && (
          <Customize
            item={detail}
            am={am}
            close={() => setDetail(null)}
            add={(line) => {
              edit([...cart.lines, line]);
              setStatus(t("Added to your cart", "ወደ ቅርጫትዎ ተጨምሯል"));
            }}
          />
        )}
      </main>
    </div>
  );
}
