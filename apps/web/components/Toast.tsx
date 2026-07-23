"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface UiContextValue {
  notify: (kind: ToastKind, message: string) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const UiContext = createContext<UiContextValue | null>(null);

/** Toasts : `toast.success(...)`, `toast.error(...)`, `toast.info(...)`. */
export function useToast() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useToast doit être utilisé dans <UiProvider>.");
  return {
    success: (m: string) => ctx.notify("success", m),
    error: (m: string) => ctx.notify("error", m),
    info: (m: string) => ctx.notify("info", m),
  };
}

/** Confirmation modale (remplace window.confirm) : renvoie une promesse booléenne. */
export function useConfirm() {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error("useConfirm doit être utilisé dans <UiProvider>.");
  return ctx.confirm;
}

const KIND_STYLES: Record<ToastKind, string> = {
  success: "bg-emerald-600",
  error: "bg-red-600",
  info: "bg-navy",
};

function KindIcon({ kind }: { kind: ToastKind }) {
  const cls = "h-5 w-5 shrink-0";
  if (kind === "success")
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={cls} aria-hidden="true">
        <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 10a1 1 0 1 1 1.4-1.4l3.1 3.1 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
      </svg>
    );
  if (kind === "error")
    return (
      <svg viewBox="0 0 20 20" fill="currentColor" className={cls} aria-hidden="true">
        <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm-1-5a1 1 0 1 0 2 0V7a1 1 0 1 0-2 0v6Zm1 2.2a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z" clipRule="evenodd" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={cls} aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1-11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-1 2a1 1 0 0 0-1 1v4a1 1 0 1 0 2 0V10a1 1 0 0 0-1-1Z" clipRule="evenodd" />
    </svg>
  );
}

function Toast({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const t = useTranslations("common");
  return (
    <div
      role="alert"
      className={`cg-toast pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${KIND_STYLES[item.kind]}`}
    >
      <KindIcon kind={item.kind} />
      <span className="min-w-0 flex-1 break-words">{item.message}</span>
      <button onClick={onClose} aria-label={t("close")} className="-mr-1 shrink-0 text-white/70 transition hover:text-white">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M6 6l8 8M14 6l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function ConfirmModal({
  options,
  onResult,
}: {
  options: ConfirmOptions;
  onResult: (value: boolean) => void;
}) {
  const t = useTranslations("common");
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onResult(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onResult]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => onResult(false)} />
      <div role="dialog" aria-modal="true" className="cg-modal relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        {options.title && <h2 className="text-lg font-bold text-navy">{options.title}</h2>}
        <p className={`text-sm text-slate-600 ${options.title ? "mt-2" : ""}`}>{options.message}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={() => onResult(false)}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {options.cancelLabel ?? t("cancel")}
          </button>
          <button
            onClick={() => onResult(true)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition ${
              options.danger ? "bg-red-600 hover:bg-red-700" : "bg-navy hover:bg-navy-dark"
            }`}
          >
            {options.confirmLabel ?? t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Fournit les toasts et la confirmation modale à toute l'app. À monter une
 * seule fois (layout), à l'intérieur de NextIntlClientProvider.
 */
export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const remove = useCallback((id: number) => setToasts((ts) => ts.filter((x) => x.id !== id)), []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      const id = Date.now() + Math.random();
      setToasts((ts) => [...ts, { id, kind, message }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })),
    [],
  );

  function resolvePending(value: boolean) {
    pending?.resolve(value);
    setPending(null);
  }

  return (
    <UiContext.Provider value={{ notify, confirm }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {toasts.map((item) => (
          <Toast key={item.id} item={item} onClose={() => remove(item.id)} />
        ))}
      </div>
      {pending && <ConfirmModal options={pending} onResult={resolvePending} />}
    </UiContext.Provider>
  );
}
