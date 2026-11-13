"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
export function Dialog({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => {
      el?.close();
    };
  }, []);
  return (
    <dialog
      className="native-dialog"
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="dialog-title">
        <h2>{title}</h2>
        <button className="btn icon" aria-label="Close dialog" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
