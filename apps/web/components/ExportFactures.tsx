"use client";

import { useTranslations } from "next-intl";
import { downloadAuthed } from "@/lib/client/session";
import { useDownload } from "@/components/Toast";
import { btnSecondary } from "@/components/ui";

/**
 * CSV and PDF export of the published invoice lines (§6), shared by the Admin
 * and Bailleur lists.
 *
 * Exports are capped server-side, and the statement's totals only cover the
 * lines actually read. The cap used to be announced in a response header no
 * client looked at, so an incomplete file — and a PDF whose totals were short —
 * downloaded without a word. It is reported here.
 *
 * The export is confirmed: the file leaves the application with every tenant's
 * name and balance in it.
 */
export function ExportFactures({ mois }: { mois: string }) {
  const t = useTranslations("factures");
  const download = useDownload();

  const query = mois ? `?mois=${mois}` : "";
  const suffixe = mois ? `-${mois}` : "";

  function exporter(path: string, filename: string) {
    return download({
      run: () => downloadAuthed(path, filename),
      failure: t("exportFailed"),
      truncated: (max) => t("exportTronque", { max }),
      confirm: { message: t("confirmExport"), confirmLabel: t("export") },
    });
  }

  return (
    <>
      <button
        onClick={() => exporter(`/api/export/factures${query}`, `factures${suffixe}.csv`)}
        className={btnSecondary}
      >
        {t("export")}
      </button>
      <button
        onClick={() => exporter(`/api/export/recap${query}`, `releve${suffixe}.pdf`)}
        className={btnSecondary}
      >
        {t("exportPdf")}
      </button>
    </>
  );
}
