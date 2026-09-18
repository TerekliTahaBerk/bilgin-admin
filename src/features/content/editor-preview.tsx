"use client";

import type { ReactNode } from "react";

import type { CourseScope } from "@/contracts/admin/content";
import type { SupportedEditorType } from "@/contracts/admin/exercise-editor";
import { courseScopeLabels } from "@/features/content/content-labels";
import { editorTypeLabels } from "@/features/content/editor-form";

export type PreviewShellProps = Readonly<{
  type: SupportedEditorType;
  difficulty: number;
  scopes: readonly CourseScope[];
  explanation: string;
  /** Already resolved by the type-specific preview; "Seçilmedi" when unset. */
  answerLabel: string;
  children: ReactNode;
}>;

/**
 * The single live-preview frame. Every editor type reuses the header, the
 * scope/answer/explanation block and the admin-view note; only the question
 * body differs. This is an admin surface, so the correct answer is shown.
 */
export function PreviewShell({
  type,
  difficulty,
  scopes,
  explanation,
  answerLabel,
  children,
}: PreviewShellProps) {
  return (
    <aside
      className="lg:sticky lg:top-6 lg:self-start"
      aria-label="Canlı önizleme"
    >
      <div className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold">Canlı önizleme</h2>
          <p className="mt-1 text-xs text-muted">
            Yönetici görünümü · doğru cevap görünür
          </p>
        </div>
        <div className="space-y-5 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">
            {editorTypeLabels[type]} · Zorluk {difficulty}
          </p>

          {children}

          <dl className="grid gap-3 border-t border-border pt-4 text-xs">
            <div>
              <dt className="font-medium text-muted">Kapsam</dt>
              <dd className="mt-0.5">
                {scopes.length === 0
                  ? "Seçilmedi"
                  : scopes.map((scope) => courseScopeLabels[scope]).join(", ")}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted">Doğru cevap</dt>
              <dd className="mt-0.5">{answerLabel}</dd>
            </div>
            {explanation.trim().length === 0 ? null : (
              <div>
                <dt className="font-medium text-muted">Açıklama</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{explanation}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>
    </aside>
  );
}
