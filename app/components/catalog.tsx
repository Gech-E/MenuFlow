"use client";
import { useState } from "react";
import {
  Image as ImageIcon,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import Image from "next/image";
import { api, formatMoney, minorUnits } from "@/lib/ui-api";
import {
  Category,
  Command,
  imageUrl,
  MenuItem,
  Modifier,
  Variant,
  Workspace,
} from "@/lib/ui-models";
import { Empty, Field } from "./chrome";
import { Action, ActionForm, value } from "./actions";
import { Dialog } from "./dialog";

function amount(value: number | null | undefined) {
  return value == null ? "" : (value / 100).toFixed(2);
}
function price(value: string) {
  const n = Number(minorUnits(value));
  if (!Number.isSafeInteger(n) || n > 1000000000)
    throw new Error("Amount exceeds the supported range.");
  return n;
}
function CategoryForm({
  category,
  manage,
  close,
}: {
  category?: Category;
  manage: Command;
  close: () => void;
}) {
  return (
    <Dialog title={category ? "Edit category" : "New category"} close={close}>
      <ActionForm
        submit="Save category"
        after={close}
        onSubmit={(f) =>
          manage("category.save", {
            id: category?.id,
            name: value(f, "name"),
            sortOrder: Number(value(f, "sortOrder")),
            translations: { am: { name: value(f, "am") } },
          })
        }
      >
        <Field label="Category name">
          <input
            name="name"
            defaultValue={category?.name}
            required
            maxLength={80}
          />
        </Field>
        <Field label="Category name in Amharic">
          <input
            name="am"
            lang="am"
            defaultValue={category?.translations?.am?.name}
          />
        </Field>
        <Field label="Display order">
          <input
            name="sortOrder"
            type="number"
            min="0"
            defaultValue={category?.sortOrder ?? 0}
          />
        </Field>
      </ActionForm>
    </Dialog>
  );
}
type Choice = Variant & { priceText: string };
type Group = Omit<Modifier, "options"> & { options: Choice[] };
function blankChoice(): Choice {
  return {
    id: crypto.randomUUID(),
    name: "",
    priceMinor: 0,
    priceText: "0.00",
  };
}
function ChoiceEditor({
  title,
  choices,
  change,
}: {
  title: string;
  choices: Choice[];
  change: (choices: Choice[]) => void;
}) {
  return (
    <div className="stack">
      {choices.map((c, i) => (
        <div className="form-grid" key={c.id}>
          <Field label={title + " name"}>
            <input
              required
              value={c.name}
              maxLength={100}
              onChange={(e) =>
                change(
                  choices.map((v, j) =>
                    j === i ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
          </Field>
          <Field label={title + " price (ETB)"}>
            <input
              type="number"
              step=".01"
              min="0"
              required
              value={c.priceText}
              onChange={(e) =>
                change(
                  choices.map((v, j) =>
                    j === i ? { ...v, priceText: e.target.value } : v,
                  ),
                )
              }
            />
          </Field>
          <button
            className="text-link"
            type="button"
            onClick={() => change(choices.filter((_, j) => j !== i))}
          >
            Remove {title.toLowerCase()}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn small"
        onClick={() => change([...choices, blankChoice()])}
      >
        <Plus size={15} />
        Add {title.toLowerCase()}
      </button>
    </div>
  );
}
function ItemForm({
  item,
  workspace,
  manage,
  close,
}: {
  item?: MenuItem;
  workspace: Workspace;
  manage: Command;
  close: () => void;
}) {
  const variantsToChoices = (vs: Variant[]) =>
    vs.map((v) => ({ ...v, priceText: amount(v.priceMinor) }));
  const [variants, setVariants] = useState<Choice[]>(() =>
    variantsToChoices(item?.variants ?? []),
  );
  const [groups, setGroups] = useState<Group[]>(() =>
    (item?.modifierGroups ?? []).map((g) => ({
      ...g,
      options: variantsToChoices(g.options),
    })),
  );
  function changeGroup(index: number, patch: Partial<Group>) {
    setGroups((g) => g.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  }
  function strip(c: Choice) {
    return { id: c.id, name: c.name.trim(), priceMinor: price(c.priceText) };
  }
  return (
    <Dialog title={item ? "Edit menu item" : "New menu item"} close={close}>
      <ActionForm
        submit="Save menu item"
        after={close}
        onSubmit={async (f) => {
          let path = item?.imagePath ?? null;
          const upload = f.get("image");
          if (upload instanceof File && upload.size) {
            const form = new FormData();
            form.set("branchId", workspace.branch.id);
            form.set("file", upload);
            path = (await api<{ imagePath: string }>("management/image", form))
              .imagePath;
          }
          const special = value(f, "specialPrice");
          return manage("item.save", {
            id: item?.id,
            version: item?.version,
            categoryId: value(f, "category"),
            name: value(f, "name"),
            description: value(f, "description"),
            translations: {
              am: {
                name: value(f, "am"),
                description: value(f, "descriptionAm"),
              },
            },
            priceMinor: price(value(f, "price")),
            available: f.has("available"),
            published: f.has("published"),
            special: f.has("special"),
            specialPriceMinor: special ? price(special) : null,
            scheduleStart: value(f, "start") || null,
            scheduleEnd: value(f, "end") || null,
            variants: variants.map(strip),
            modifierGroups: groups.map((g) => ({
              ...g,
              options: g.options.map(strip),
            })),
            imagePath: f.has("removeImage") ? null : path,
          });
        }}
      >
        <div className="form-grid">
          <Field label="Item name">
            <input
              name="name"
              required
              maxLength={120}
              defaultValue={item?.name}
            />
          </Field>
          <Field label="Category">
            <select
              name="category"
              required
              defaultValue={item?.categoryId ?? ""}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {workspace.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Price (ETB)">
            <input
              type="number"
              min="0"
              step=".01"
              required
              name="price"
              defaultValue={amount(item?.priceMinor)}
            />
          </Field>
          <Field label="Menu photo">
            <input
              type="file"
              name="image"
              accept="image/jpeg,image/png,image/webp"
            />
          </Field>
          <Field label="Description">
            <textarea
              name="description"
              maxLength={1000}
              defaultValue={item?.description}
            />
          </Field>
          <Field label="Item name in Amharic">
            <input
              name="am"
              lang="am"
              defaultValue={item?.translations?.am?.name}
            />
          </Field>
          <Field label="Description in Amharic">
            <textarea
              name="descriptionAm"
              lang="am"
              defaultValue={item?.translations?.am?.description}
            />
          </Field>
        </div>
        <div className="actions">
          <label className="check">
            <input
              type="checkbox"
              name="published"
              defaultChecked={item?.published ?? true}
            />
            Published
          </label>
          <label className="check">
            <input
              type="checkbox"
              name="available"
              defaultChecked={item?.available ?? true}
            />
            Available to order
          </label>
          {item?.imagePath && (
            <label className="check">
              <input type="checkbox" name="removeImage" />
              Remove photo
            </label>
          )}
        </div>
        <details className="drawer" open={item?.special || undefined}>
          <summary>Daily special and serving times</summary>
          <label className="check">
            <input
              type="checkbox"
              name="special"
              defaultChecked={item?.special}
            />
            Daily special
          </label>
          <div className="form-grid">
            <Field label="Special price (ETB, optional)">
              <input
                type="number"
                min="0"
                step=".01"
                name="specialPrice"
                defaultValue={amount(item?.specialPriceMinor)}
              />
            </Field>
            <Field label="Available from">
              <input
                type="time"
                name="start"
                defaultValue={item?.scheduleStart?.slice(0, 5)}
              />
            </Field>
            <Field label="Available until">
              <input
                type="time"
                name="end"
                defaultValue={item?.scheduleEnd?.slice(0, 5)}
              />
            </Field>
          </div>
        </details>
        <details className="drawer">
          <summary>Variants ({variants.length})</summary>
          <ChoiceEditor
            title="Variant"
            choices={variants}
            change={setVariants}
          />
        </details>
        <details className="drawer">
          <summary>Modifier groups ({groups.length})</summary>
          <div className="stack">
            {groups.map((g, i) => (
              <fieldset key={g.id} className="field-set stack">
                <legend>Group {i + 1}</legend>
                <Field label="Group name">
                  <input
                    required
                    value={g.name}
                    onChange={(e) => changeGroup(i, { name: e.target.value })}
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Minimum choices">
                    <input
                      type="number"
                      min="0"
                      max={g.max}
                      required
                      value={g.min}
                      onChange={(e) =>
                        changeGroup(i, { min: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Maximum choices">
                    <input
                      type="number"
                      min={Math.max(1, g.min)}
                      max="20"
                      required
                      value={g.max}
                      onChange={(e) =>
                        changeGroup(i, { max: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
                <ChoiceEditor
                  title="Option"
                  choices={g.options}
                  change={(options) => changeGroup(i, { options })}
                />
                <button
                  className="text-link"
                  type="button"
                  onClick={() => setGroups(groups.filter((_, j) => j !== i))}
                >
                  Remove group
                </button>
              </fieldset>
            ))}
            <button
              type="button"
              className="btn"
              onClick={() =>
                setGroups([
                  ...groups,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    min: 0,
                    max: 1,
                    options: [],
                  },
                ])
              }
            >
              Add modifier group
            </button>
          </div>
        </details>
      </ActionForm>
    </Dialog>
  );
}
export function Catalog({
  workspace,
  manage,
  edit,
  onlySpecials = false,
}: {
  workspace: Workspace;
  manage: Command;
  edit: boolean;
  onlySpecials?: boolean;
}) {
  const [category, setCategory] = useState<Category | "new" | null>(null),
    [item, setItem] = useState<MenuItem | "new" | null>(null),
    [filter, setFilter] = useState(""),
    [cat, setCat] = useState("");
  const list = workspace.items.filter(
    (i) =>
      (!onlySpecials || i.special) &&
      (!cat || i.categoryId === cat) &&
      i.name.toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
  );
  return (
    <div className="stack">
      <div className="panel">
        <div className="panel-head">
          <h2>{onlySpecials ? "Daily specials" : "Menu items"}</h2>
          {edit && (
            <button
              className="btn primary"
              disabled={!workspace.categories.length}
              onClick={() => setItem("new")}
            >
              <Plus size={16} />
              New menu item
            </button>
          )}
        </div>
        <div className="form-grid">
          <div className="search">
            <Search size={17} />
            <input
              aria-label="Search menu items"
              placeholder="Search menu items"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <select
            className="control"
            aria-label="Filter by category"
            value={cat}
            onChange={(e) => setCat(e.target.value)}
          >
            <option value="">All categories</option>
            {workspace.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {list.length ? (
          list.map((i) => (
            <div className="line" key={i.id}>
              <div className="row">
                {imageUrl(i.imagePath) ? (
                  <Image
                    alt=""
                    className="menu-thumb"
                    src={imageUrl(i.imagePath)!}
                    width={60}
                    height={60}
                    unoptimized
                  />
                ) : (
                  <span className="square-icon">
                    <ImageIcon size={20} />
                  </span>
                )}
                <div>
                  <strong>{i.name}</strong>
                  <p className="muted">
                    {
                      workspace.categories.find((c) => c.id === i.categoryId)
                        ?.name
                    }{" "}
                    · {formatMoney(i.priceMinor)}
                    {!i.published ? " · Draft" : ""}
                  </p>
                </div>
              </div>
              <div className="actions">
                <Action
                  doAction={() =>
                    manage("item.availability", {
                      id: i.id,
                      available: !i.available,
                    })
                  }
                  className="btn small"
                >
                  {i.available ? "Mark sold out" : "Mark available"}
                </Action>
                {edit && (
                  <>
                    <button
                      className="btn small"
                      onClick={() => setItem(i)}
                      aria-label={"Edit " + i.name}
                    >
                      <Pencil size={15} />
                    </button>
                    <Action
                      className="btn small"
                      doAction={() => manage("item.delete", { id: i.id })}
                      confirm={
                        "Remove " +
                        i.name +
                        " from the menu? Previously ordered items will be archived."
                      }
                    >
                      <Trash2 size={15} />
                      <span className="sr-only">Remove {i.name}</span>
                    </Action>
                  </>
                )}
              </div>
            </div>
          ))
        ) : (
          <Empty
            title={
              onlySpecials ? "No matching specials" : "No matching menu items"
            }
          >
            {workspace.categories.length
              ? "Add an item or adjust the search."
              : "Create a category first to organize your menu."}
          </Empty>
        )}
      </div>
      {edit && (
        <section className="panel">
          <div className="panel-head">
            <h2>Categories</h2>
            <button className="btn" onClick={() => setCategory("new")}>
              <Tag size={15} />
              New category
            </button>
          </div>
          {workspace.categories.map((c) => (
            <div className="line" key={c.id}>
              <strong>{c.name}</strong>
              <div className="actions">
                <button className="btn small" onClick={() => setCategory(c)}>
                  Edit category
                </button>
                <Action
                  className="btn small"
                  confirm={"Archive " + c.name + "?"}
                  doAction={() => manage("category.delete", { id: c.id })}
                >
                  Archive
                </Action>
              </div>
            </div>
          ))}
        </section>
      )}
      {category && (
        <CategoryForm
          category={category === "new" ? undefined : category}
          manage={manage}
          close={() => setCategory(null)}
        />
      )}
      {item && (
        <ItemForm
          item={item === "new" ? undefined : item}
          workspace={workspace}
          manage={manage}
          close={() => setItem(null)}
        />
      )}
    </div>
  );
}
