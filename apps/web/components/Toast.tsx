"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { useApiError } from "@/lib/client/api-error";
import type { DownloadResult } from "@/lib/client/session";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

/**
 * How long a toast stays. An error outlives the others: it is the one message
 * the reader has to finish reading before deciding what to do next.
 */
const TOAST_MS: Record<ToastKind, number> = {
  success: 4000,
  info: 5000,
  error: 7000,
};

/**
 * How hard a confirmation is to get past.
 *
 * `info` guards a reversible action, `danger` an irreversible one, and
 * `critical` additionally demands the operator retype a phrase — the only guard
 * that survives a reflex click on an action that destroys financial history.
 */
export type ConfirmLevel = "info" | "danger" | "critical";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  level?: ConfirmLevel;
  /** Reason collected in the dialog itself, in place of `window.prompt`. */
  prompt?: {
    label: string;
    placeholder?: string;
    minLength?: number;
    /** Shown when what was typed is shorter than `minLength`. */
    tooShort?: string;
  };
  /** `critical` only: the phrase to retype, and the sentence introducing it. */
  challenge?: { phrase: string; hint: string };
}

export interface ConfirmResult {
  ok: boolean;
  /** What `prompt` collected, trimmed; empty when nothing was asked for. */
  reason: string;
}

export interface ConfirmActionOptions extends ConfirmOptions {
  /** The request to run once confirmed. Receives what `prompt` collected. */
  run: (reason: string) => Promise<Response>;
  /** Announced on success. Omit when the screen's own refresh already says it. */
  success?: string;
  /** Announced on failure, and the fallback for an error code we cannot map. */
  failure: string;
  /** Ran after the dialog closes, on success only — typically the list reload. */
  onDone?: () => void | Promise<void>;
}

/** A confirmation waiting for an answer. `run` belongs to `useConfirmAction`. */
interface PendingConfirm extends ConfirmOptions {
  id: number;
  run?: (reason: string) => Promise<boolean>;
  resolve: (result: ConfirmResult) => void;
}

interface UiContextValue {
  notify: (kind: ToastKind, message: string) => void;
  request: (options: Omit<PendingConfirm, "id" | "resolve">) => Promise<ConfirmResult>;
}

const UiContext = createContext<UiContextValue | null>(null);

function useUi(hook: string): UiContextValue {
  const ctx = useContext(UiContext);
  if (!ctx) throw new Error(`${hook} must be used inside <UiProvider>.`);
  return ctx;
}

/** Toasts: `toast.success(...)`, `toast.error(...)`, `toast.info(...)`. */
export function useToast() {
  const { notify } = useUi("useToast");
  return {
    success: (m: string) => notify("success", m),
    error: (m: string) => notify("error", m),
    info: (m: string) => notify("info", m),
  };
}

/**
 * Modal confirmation (replaces `window.confirm` and `window.prompt`): resolves
 * once the operator answers. Prefer `useConfirmAction` when the answer is
 * immediately followed by a request — it reports the outcome too.
 */
export function useConfirm() {
  const { request } = useUi("useConfirm");
  return request;
}

/**
 * Confirmation, request, and outcome as one call.
 *
 * Guarding an action used to cost a confirmation, a status check, two toasts
 * and a reload at every call site, so most call sites paid for none of it: the
 * screen applied the change locally and never looked at the response. Here the
 * dialog stays up with a busy button while the request runs, the outcome is
 * always announced, and `onDone` runs only if the server actually agreed.
 */
export function useConfirmAction(): (options: ConfirmActionOptions) => Promise<boolean> {
  const { notify, request } = useUi("useConfirmAction");
  const apiError = useApiError();

  return useCallback(
    async ({ run, success, failure, onDone, ...confirmOptions }) => {
      let succeeded = false;
      await request({
        ...confirmOptions,
        run: async (reason) => {
          try {
            const res = await run(reason);
            if (!res.ok) {
              notify("error", apiError(await res.json().catch(() => null), failure));
              return false;
            }
          } catch (err) {
            // `err` carries a code when it came from `uploadFile` (ApiError).
            notify("error", apiError(err, failure));
            return false;
          }
          succeeded = true;
          if (success) notify("success", success);
          return true;
        },
      });
      // After the dialog has gone: a list reloading underneath it looks like a
      // glitch, and there is nothing to reload when the request was refused.
      if (succeeded) await onDone?.();
      return succeeded;
    },
    [apiError, notify, request],
  );
}

export interface DownloadOptions {
  /** The download itself, typically `downloadRecu` / `downloadFactureLigne`. */
  run: () => Promise<DownloadResult>;
  /** Announced when no file could be produced. */
  failure: string;
  /** Announced when the server capped the export, given the cap it stopped at. */
  truncated?: (max: number) => string;
  /** Asked before the file is produced. Omit when the reader owns the document. */
  confirm?: ConfirmOptions;
}

/**
 * Runs an authenticated download and reports what became of it.
 *
 * A blob download is silent by construction: when the request fails there is no
 * file and no error either, so the reader is left clicking a link that does
 * nothing. Every outcome — refusal, capped export, success — is announced here.
 */
export function useDownload(): (options: DownloadOptions) => Promise<boolean> {
  const { notify, request } = useUi("useDownload");
  const t = useTranslations("common");

  return useCallback(
    async ({ run, failure, truncated, confirm }) => {
      if (confirm && !(await request(confirm)).ok) return false;
      notify("info", t("preparing"));
      try {
        const { ok, tronqueA } = await run();
        if (!ok) {
          notify("error", failure);
          return false;
        }
        if (tronqueA !== null && truncated) notify("info", truncated(tronqueA));
        return true;
      } catch {
        notify("error", failure);
        return false;
      }
    },
    [notify, request, t],
  );
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

function WarnIcon({ critical }: { critical: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`h-6 w-6 shrink-0 ${critical ? "text-red-600" : "text-amber-500"}`}
    >
      <path
        fillRule="evenodd"
        d="M8.5 2.7a1.7 1.7 0 0 1 3 0l6 10.9A1.7 1.7 0 0 1 16 16.2H4a1.7 1.7 0 0 1-1.5-2.6l6-10.9ZM10 6.5a1 1 0 0 0-1 1v3a1 1 0 1 0 2 0v-3a1 1 0 0 0-1-1Zm0 6.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ButtonSpinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
    />
  );
}

function Toast({
  item,
  onClose,
  onPause,
  onResume,
}: {
  item: ToastItem;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const t = useTranslations("common");
  return (
    <div
      // Only a failure interrupts a screen reader mid-sentence; a confirmation
      // is announced politely, once the reader is between two things.
      role={item.kind === "error" ? "alert" : "status"}
      aria-live={item.kind === "error" ? "assertive" : "polite"}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
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

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

function ConfirmModal({
  options,
  onSettle,
}: {
  options: PendingConfirm;
  onSettle: (result: ConfirmResult) => void;
}) {
  const t = useTranslations("common");
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [reason, setReason] = useState("");
  const [challenge, setChallenge] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The key handler is bound once; it reads the flag rather than the state.
  const busyRef = useRef(false);
  const ids = useId();
  const titleId = `${ids}-title`;
  const messageId = `${ids}-message`;

  const level = options.level ?? "info";
  const title = options.title ?? t("confirmTitle");

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // Focus lands on Cancel: Enter must not be what carries out a deletion.
    cancelRef.current?.focus();
    const restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      // A request already on its way cannot be called back — leave the dialog
      // up rather than pretend the escape hatch undid anything.
      if (busyRef.current) return;
      if (e.key === "Escape") {
        onSettle({ ok: false, reason: "" });
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!focusables?.length) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      // Without the wrap the dialog is modal only to the eye: Tab walks into
      // the page behind it, where the button being confirmed still sits.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = restoreOverflow;
      previous?.focus();
    };
  }, [onSettle]);

  const challengeOk =
    !options.challenge ||
    challenge.trim().toLocaleLowerCase() === options.challenge.phrase.trim().toLocaleLowerCase();

  async function onConfirm() {
    const value = reason.trim();
    const min = options.prompt?.minLength ?? 0;
    if (value.length < min) {
      setInvalid(options.prompt?.tooShort ?? t("tooShort"));
      return;
    }
    setInvalid(null);
    if (!options.run) {
      onSettle({ ok: true, reason: value });
      return;
    }
    busyRef.current = true;
    setBusy(true);
    const ok = await options.run(value);
    busyRef.current = false;
    // No state update here: settling unmounts this dialog.
    onSettle({ ok, reason: value });
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => !busy && onSettle({ ok: false, reason: "" })}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="cg-modal relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          {level !== "info" && <WarnIcon critical={level === "critical"} />}
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold text-navy">
              {title}
            </h2>
            <p id={messageId} className="mt-2 text-sm text-slate-600">
              {options.message}
            </p>
          </div>
        </div>

        {options.prompt && (
          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{options.prompt.label}</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={options.prompt.placeholder}
              rows={3}
              disabled={busy}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy"
            />
          </label>
        )}

        {options.challenge && (
          <label className="mt-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{options.challenge.hint}</span>
            <input
              value={challenge}
              onChange={(e) => setChallenge(e.target.value)}
              placeholder={options.challenge.phrase}
              disabled={busy}
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy focus:ring-1 focus:ring-navy"
            />
          </label>
        )}

        {invalid && <p className="mt-2 text-sm text-red-600">{invalid}</p>}

        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancelRef}
            onClick={() => onSettle({ ok: false, reason: "" })}
            disabled={busy}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
          >
            {options.cancelLabel ?? t("cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !challengeOk}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
              level === "info" ? "bg-navy hover:bg-navy-dark" : "bg-red-600 hover:bg-red-700"
            }`}
          >
            {busy && <ButtonSpinner />}
            {busy ? t("processing") : (options.confirmLabel ?? t("confirm"))}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Provides toasts and the modal confirmation to the whole app. Mount it once
 * (in the layout), inside NextIntlClientProvider.
 */
export function UiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  // Refs mirror what is on screen so that `notify` and `request` can read the
  // current state without going through an updater — a state updater may be
  // replayed, and resolving a caller's promise from inside one is not replayable.
  const toastsRef = useRef<ToastItem[]>([]);
  const pendingRef = useRef<PendingConfirm | null>(null);
  const queueRef = useRef<PendingConfirm[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const seq = useRef(0);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    },
    [],
  );

  const commit = useCallback((next: ToastItem[]) => {
    toastsRef.current = next;
    setToasts(next);
  }, []);

  const remove = useCallback(
    (id: number) => {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.delete(id);
      commit(toastsRef.current.filter((x) => x.id !== id));
    },
    [commit],
  );

  const schedule = useCallback(
    (id: number, kind: ToastKind) => {
      const timer = timers.current.get(id);
      if (timer) clearTimeout(timer);
      timers.current.set(id, setTimeout(() => remove(id), TOAST_MS[kind]));
    },
    [remove],
  );

  const pause = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
  }, []);

  const notify = useCallback(
    (kind: ToastKind, message: string) => {
      // The same message arriving twice reads as a stutter and pushes the rest
      // off screen: restart the one already up instead of stacking a copy.
      const existing = toastsRef.current.find((x) => x.kind === kind && x.message === message);
      const id = existing?.id ?? ++seq.current;
      if (!existing) commit([...toastsRef.current, { id, kind, message }]);
      schedule(id, kind);
    },
    [commit, schedule],
  );

  const activate = useCallback((next: PendingConfirm | null) => {
    pendingRef.current = next;
    setPending(next);
  }, []);

  const request = useCallback(
    (options: Omit<PendingConfirm, "id" | "resolve">) =>
      new Promise<ConfirmResult>((resolve) => {
        const item: PendingConfirm = { ...options, id: ++seq.current, resolve };
        // A queue, not a single slot: a second confirmation raised while one was
        // open used to overwrite it, leaving the first caller awaiting a promise
        // that would never settle.
        if (pendingRef.current) queueRef.current.push(item);
        else activate(item);
      }),
    [activate],
  );

  const settle = useCallback(
    (result: ConfirmResult) => {
      const answered = pendingRef.current;
      activate(queueRef.current.shift() ?? null);
      answered?.resolve(result);
    },
    [activate],
  );

  return (
    <UiContext.Provider value={{ notify, request }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6">
        {toasts.map((item) => (
          <Toast
            key={item.id}
            item={item}
            onClose={() => remove(item.id)}
            onPause={() => pause(item.id)}
            onResume={() => schedule(item.id, item.kind)}
          />
        ))}
      </div>
      {pending && <ConfirmModal key={pending.id} options={pending} onSettle={settle} />}
    </UiContext.Provider>
  );
}
