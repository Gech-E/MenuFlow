"use client";
import { useState } from "react";
import { messageOf } from "@/lib/ui-api";
import { Notice } from "./chrome";

export function Action({
  children,
  doAction,
  className = "btn",
  disabled = false,
  confirm,
  success,
}: {
  children: React.ReactNode;
  doAction: () => Promise<unknown>;
  className?: string;
  disabled?: boolean;
  confirm?: string;
  success?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  return (
    <span className="action-wrap">
      <button
        type="button"
        className={className}
        disabled={busy || disabled}
        onClick={async () => {
          if (confirm && !window.confirm(confirm)) return;
          setBusy(true);
          setError("");
          setDone(false);
          try {
            await doAction();
            setDone(true);
          } catch (e) {
            setError(messageOf(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </button>
      {error && <Notice error>{error}</Notice>}
      {done && success && <Notice>{success}</Notice>}
    </span>
  );
}
export function ActionForm({
  children,
  onSubmit,
  submit = "Save changes",
  success,
  after,
  disabled = false,
}: {
  children: React.ReactNode;
  onSubmit: (form: FormData) => Promise<unknown>;
  submit?: string;
  success?: string;
  after?: () => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [done, setDone] = useState(false);
  return (
    <form
      className="stack"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        setError("");
        setBusy(true);
        setDone(false);
        try {
          await onSubmit(form);
          setDone(true);
          after?.();
        } catch (err) {
          setError(messageOf(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
      {error && <Notice error>{error}</Notice>}
      {done && success && <Notice>{success}</Notice>}
      <div>
        <button className="btn primary" disabled={busy || disabled}>
          {busy ? "Saving…" : submit}
        </button>
      </div>
    </form>
  );
}
export function value(data: FormData, key: string) {
  return String(data.get(key) ?? "").trim();
}
