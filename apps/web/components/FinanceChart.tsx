import { useLocale, useTranslations } from "next-intl";
import { formatXAF } from "@/lib/format";

interface Point {
  mois: string;
  facture: number;
  encaisse: number;
}

/**
 * Monthly billed vs collected bars (SVG, dependency-free) — design §6.
 * Fixed height, fluid width; scale relative to the series maximum.
 */
export function FinanceChart({ serie }: { serie: Point[] }) {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const max = Math.max(1, ...serie.map((p) => Math.max(p.facture, p.encaisse)));

  const W = 720;
  const H = 220;
  const padB = 24;
  const padT = 8;
  const usableH = H - padB - padT;
  const slot = W / serie.length;
  const barW = Math.min(18, slot / 3);

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-56 w-full min-w-[560px]" role="img">
        {serie.map((p, i) => {
          const cx = i * slot + slot / 2;
          const hF = (p.facture / max) * usableH;
          const hE = (p.encaisse / max) * usableH;
          const moisCourt = p.mois.slice(5);
          return (
            <g key={p.mois}>
              <rect
                x={cx - barW - 1}
                y={padT + usableH - hF}
                width={barW}
                height={hF}
                rx={2}
                className="fill-navy"
              >
                <title>{`${p.mois} · ${t("facture")}: ${formatXAF(p.facture, locale)}`}</title>
              </rect>
              <rect
                x={cx + 1}
                y={padT + usableH - hE}
                width={barW}
                height={hE}
                rx={2}
                className="fill-emerald-500"
              >
                <title>{`${p.mois} · ${t("encaisse")}: ${formatXAF(p.encaisse, locale)}`}</title>
              </rect>
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-slate-400 text-[10px]">
                {moisCourt}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-center gap-6 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-navy" /> {t("facture")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {t("encaisse")}
        </span>
      </div>
    </div>
  );
}
