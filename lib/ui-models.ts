export type Membership = {
  id: string;
  name: string;
  restaurantId: string;
  restaurantName: string;
  roles: string[];
};
export type Context = {
  userId: string;
  email: string;
  platformAdmin: boolean;
  branches: Membership[];
};
export type Translation = { am?: { name?: string; description?: string } };
export type Category = {
  id: string;
  name: string;
  translations: Translation;
  sortOrder: number;
};
export type Variant = { id: string; name: string; priceMinor: number };
export type Modifier = {
  id: string;
  name: string;
  min: number;
  max: number;
  options: Variant[];
};
export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  translations: Translation;
  priceMinor: number;
  available: boolean;
  published: boolean;
  special: boolean;
  specialPriceMinor: number | null;
  scheduleStart: string | null;
  scheduleEnd: string | null;
  variants: Variant[];
  modifierGroups: Modifier[];
  imagePath: string | null;
  version: number;
};
export type DiningTable = {
  id: string;
  label: string;
  tableNumber: number;
  qrLocator: string | null;
  active: boolean;
};
export type Branch = {
  id: string;
  name: string;
  currency: string;
  taxBps: number;
  serviceBps: number;
  tippingEnabled: boolean;
  timezone: string;
  settings: Record<string, unknown>;
  menuLocator: string | null;
  active: boolean;
};
export type Workspace = {
  profile: { id: string; name: string; slug: string; logoPath: string | null };
  branch: Branch;
  categories: Category[];
  items: MenuItem[];
  tables: DiningTable[];
  staff: { userId: string; email: string; roles: string[]; active: boolean }[];
  invitations: {
    id: string;
    email: string;
    roles: string[];
    expiresAt: string;
  }[];
};
export type PublicMenu = {
  gatewayEnabled?: boolean;
  restaurant: Workspace["profile"];
  branch: Pick<Branch, "id" | "name" | "currency">;
  table: Pick<DiningTable, "id" | "label" | "tableNumber"> | null;
  categories: Category[];
  items: MenuItem[];
};
export type OrderLine = {
  id: string;
  name: string;
  quantity: number;
  unit_minor: string;
  status: string;
  note?: string;
  selection?: unknown;
};
export type Order = {
  id: string;
  session_id: string;
  table_label: string;
  status: string;
  created_at: string;
  note: string;
  items: OrderLine[];
  subtotal_minor: string;
};
export type ServiceRequest = {
  id: string;
  session_id: string;
  table_label: string;
  category: string;
  note: string;
  status: string;
  created_at: string;
};
export type Bill = {
  session_id: string;
  version: number;
  tipping_enabled?: boolean;
  subtotal_minor: string;
  discount_minor: string;
  tax_minor: string;
  service_minor: string;
  tip_minor: string;
  total_minor: string;
  currency: string;
  lines: OrderLine[];
};
export type Receipt = { id: string; issued_at: string; snapshot: Bill };
export type Session = {
  id: string;
  table_id: string;
  table_label: string;
  restaurant_id: string;
  status: string;
  is_host?: boolean;
  waiter_id?: string | null;
  bill?: Bill;
};
export type GuestState = {
  session: Session | null;
  orders: Order[];
  requests: ServiceRequest[];
  bill: Bill | null;
  receipt: Receipt | null;
};
export type StaffState = {
  sessions: Session[];
  orders: Order[];
  requests: ServiceRequest[];
  payments: (Receipt & {
    kind: string;
    tender_minor: string | null;
    change_minor: string | null;
  })[];
  metrics: {
    revenue_minor: string;
    tips_minor: string;
    order_count: number;
    active_tables: number;
    completed_orders: number;
    average_order_minor: string;
    best_sellers: { name: string; quantity: number }[];
  };
};
export type Command = (
  action: string,
  data?: Record<string, unknown>,
) => Promise<Record<string, unknown>>;
export type CartLine = {
  itemId: string;
  quantity: number;
  variantId?: string;
  optionIds?: string[];
  note?: string;
};
export const labels: Record<string, string> = {
  new: "Submitted",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
  open: "Open",
  checkout: "Checkout",
  settled: "Settled",
  acknowledged: "Acknowledged",
  pending: "Pending",
  requested: "Requested",
  owner: "Owner",
  manager: "Manager",
  waiter: "Waiter",
  kitchen: "Kitchen",
  cashier: "Cashier",
};
export function label(value: string) {
  return labels[value] ?? value;
}
export function localTime(value: string) {
  return value
    ? new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
}
export function imageUrl(path: string | null | undefined) {
  return path?.startsWith("/api/images/") && !path.includes("?")
    ? path
    : undefined;
}
