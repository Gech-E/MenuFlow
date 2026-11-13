import { ArrowUpRight, UtensilsCrossed, Inbox } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="MenuFlow home">
      <span className="brand-mark">
        <UtensilsCrossed size={20} strokeWidth={2.2} />
      </span>
      MenuFlow
    </Link>
  );
}
export function Header() {
  return (
    <header className="public-header">
      <Brand />
      <Link className="text-link" href="/staff">
        Staff sign in <ArrowUpRight size={16} />
      </Link>
    </header>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={25} aria-hidden />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Notice({
  error,
  children,
}: {
  error?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={error ? "notice error" : "notice"}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
