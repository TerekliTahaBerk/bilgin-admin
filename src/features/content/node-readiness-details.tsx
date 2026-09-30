import type { NodePreview } from "@/contracts/admin/publication";
import {
  difficultyLevelLabels,
  nodePreviewAnchorId,
  nodeTypeLabels,
  readinessState,
} from "@/features/content/readiness";
import { ReadinessStateBadge } from "@/features/content/readiness-badges";
import type { NodeCheck } from "@/features/content/use-readiness-snapshots";

function yesNo(value: boolean): string {
  return value ? "Evet" : "Hayır";
}

function PreviewFields({ preview }: { preview: NodePreview }) {
  const fields: [string, string, boolean][] = [
    ["Gerekli soru", String(preview.required), false],
    ["Yayında aday soru", String(preview.available), false],
    ["Öğrenciye giden soru", String(preview.live_available), false],
    ["Yayın kuralı geçiyor", yesNo(preview.passes), !preview.passes],
    ["Şu an geçiyor", yesNo(preview.live_passes), !preview.live_passes],
    ["Gevşetilmiş kural", yesNo(preview.relaxed), preview.relaxed],
  ];

  return (
    <>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-3 lg:grid-cols-6">
        {fields.map(([label, value, isNotable]) => (
          <div key={label}>
            <dt className="text-muted">{label}</dt>
            <dd className={`font-medium ${isNotable ? "text-red-800" : ""}`}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p
        className={`mt-2 text-xs ${preview.passes ? "text-muted" : "text-red-800"}`}
      >
        <span className="font-medium">Sunucu mesajı:</span> {preview.message}
      </p>
      <p
        className={`mt-1 text-xs ${preview.live_warning === null ? "text-muted" : "text-amber-800"}`}
      >
        <span className="font-medium">Canlı uyarı:</span>{" "}
        {preview.live_warning ?? "Yok"}
      </p>
    </>
  );
}

/**
 * Every field the backend's preview-selection dry run reports, per node,
 * shown verbatim. Nothing here is derived: a node that has not answered is
 * shown as not checked, a failed check as unknown, never as a pass.
 */
export function NodeReadinessDetails({
  checks,
  label,
}: {
  checks: readonly NodeCheck[];
  label: string;
}) {
  return (
    <ul
      aria-label={label}
      className="divide-y divide-border rounded-lg border border-border bg-surface"
    >
      {checks.map(({ node, state, preview, error }) => (
        <li
          className="scroll-mt-24 px-4 py-3"
          id={nodePreviewAnchorId(node.id)}
          key={node.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium">{node.title}</p>
              <p className="mt-0.5 text-xs text-muted">
                {nodeTypeLabels[node.type]} ·{" "}
                {difficultyLevelLabels[node.difficulty]}
              </p>
            </div>
            {preview === undefined ? null : (
              <ReadinessStateBadge state={readinessState(preview)} />
            )}
          </div>

          {preview !== undefined ? (
            <PreviewFields preview={preview} />
          ) : state === "checking" ? (
            <p className="mt-2 text-xs text-muted">Kontrol ediliyor…</p>
          ) : state === "error" && error !== null ? (
            <p className="mt-2 text-xs text-muted">
              Hazırlık durumu okunamadı: {error.message}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted">Henüz kontrol edilmedi.</p>
          )}
        </li>
      ))}
    </ul>
  );
}
