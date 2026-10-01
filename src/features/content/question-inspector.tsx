"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import type { Course, Unit } from "@/contracts/admin/content";
import {
  isSupportedEditorType,
  type ExerciseDetail,
} from "@/contracts/admin/exercise-editor";
import {
  courseScopeLabels,
  exerciseTypeLabels,
} from "@/features/content/content-labels";
import {
  calibrateDifficulty,
  calibrationKindLabels,
} from "@/features/content/difficulty-calibration";
import { StatusBadge } from "@/features/content/status-badges";

/*
 | Question Inspector — a read-only summary of the question as the backend
 | last returned it (the detail endpoint, plus the course/unit/topic lists the
 | editor already holds). Every value is a backend field or a direct reading
 | of one; nothing the response lacks is filled in. Where a value is missing
 | (no attempts, no timing, a topic not in the current list) it says so.
 |
 | Only two inputs come from the editor itself: the version after a save in
 | this session (the backend's own response) and whether the unsaved form
 | changes a published question's answer key.
 */

type Tone = "warning" | "info" | "ok";

const toneStyles: Readonly<Record<Tone, string>> = {
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-border bg-surface-muted text-foreground",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

const toneIcons: Readonly<Record<Tone, LucideIcon>> = {
  warning: AlertTriangle,
  info: Info,
  ok: CheckCircle2,
};

type Signal = Readonly<{
  id: string;
  tone: Tone;
  title: string;
  detail?: string;
}>;

export type QuestionInspectorProps = Readonly<{
  detail: ExerciseDetail;
  /** The version after a save in this session, else the detail's. */
  version: number;
  course: Course | undefined;
  unit: Unit | undefined;
  /** From the course's topic list; undefined when the topic is not in it. */
  topicName: string | undefined;
  /** The unsaved form changes a published question's answer key. */
  answerKeyEditPending: boolean;
  /** The backend's warning from the last save in this session, if any. */
  lastSaveWarning: string | null;
}>;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border px-4 py-3 first:border-t-0">
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
      </h3>
      <dl className="mt-2 space-y-1.5">{children}</dl>
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

function Missing({ children }: { children: ReactNode }) {
  return <span className="text-muted">{children}</span>;
}

function YesNo({ value }: { value: boolean }) {
  return <span className="font-medium">{value ? "Evet" : "Hayır"}</span>;
}

export function inspectorSignals({
  detail,
  version,
  answerKeyEditPending,
  lastSaveWarning,
}: Pick<
  QuestionInspectorProps,
  "detail" | "version" | "answerKeyEditPending" | "lastSaveWarning"
>): Signal[] {
  const signals: Signal[] = [];
  const { stats } = detail;

  if (answerKeyEditPending) {
    signals.push({
      id: "answer-key-pending",
      tone: "warning",
      title: "Yayındaki sorunun cevap anahtarını değiştiriyorsunuz",
      detail:
        "Kaydederseniz backend yeni sürüm açar; geçmiş istatistikler artık farklı bir soruyu ölçer.",
    });
  }
  if (lastSaveWarning !== null) {
    signals.push({
      id: "answer-key-saved",
      tone: "warning",
      title: "Son kayıtta cevap anahtarı değişti",
      // The backend's own wording is in the banner at the top of the page.
      detail: "Backend'in uyarısı sayfanın üstünde gösteriliyor.",
    });
  }
  if (stats.needs_review) {
    signals.push({
      id: "needs-review",
      tone: "warning",
      title: "İnceleme gerekli",
      detail: "Backend bu soruyu doğru oranı nedeniyle işaretledi.",
    });
  }

  const calibration = calibrateDifficulty(detail.difficulty, stats);
  if (calibration.kind === "mismatch" || calibration.kind === "minor") {
    signals.push({
      id: "calibration",
      tone: calibration.kind === "mismatch" ? "warning" : "info",
      title: `Zorluk kalibrasyonu: ${calibrationKindLabels[calibration.kind]}`,
      detail: `Tanımlı ${calibration.defined}, performans sinyali ${calibration.signal} (frontend tahmini).`,
    });
  }

  if (stats.attempts === 0) {
    signals.push({
      id: "never-attempted",
      tone: "info",
      title: "Henüz hiç çözülmedi",
      detail: "Performans ve kalibrasyon için veri yok.",
    });
  }
  if (version > 1) {
    signals.push({
      id: "edited",
      tone: "info",
      title: `Düzenlenmiş (sürüm ${version})`,
    });
  }

  return signals;
}

/** The inspector's content; the editor places it in a sidebar or a details section. */
export function QuestionInspectorBody(props: QuestionInspectorProps) {
  const { detail, version, course, unit, topicName } = props;
  const { stats } = detail;
  const signals = inspectorSignals(props);
  const supported = isSupportedEditorType(detail.type);
  const hasExplanation =
    detail.explanation !== null && detail.explanation.trim() !== "";
  const hasAnswerKey = Object.keys(detail.answer_key).length > 0;

  return (
    <div>
      <Section title="Kimlik">
        <Item label="Soru no">
          <span className="font-medium tabular-nums">#{detail.id}</span>
        </Item>
        <Item label="Tür">{exerciseTypeLabels[detail.type]}</Item>
        <Item label="Sürüm">
          <span className="tabular-nums">{version}</span>
        </Item>
        <Item label="Durum">
          <StatusBadge status={detail.status} />
        </Item>
      </Section>

      <Section title="Sınıflandırma">
        <Item label="Konu">
          {topicName ?? <Missing>Konu #{detail.topic_id}</Missing>}
        </Item>
        <Item label="Zorluk">{detail.difficulty}</Item>
        <Item label="Kapsamlar">
          {detail.applicable_scopes.length === 0 ? (
            <Missing>—</Missing>
          ) : (
            detail.applicable_scopes
              .map((scope) => courseScopeLabels[scope])
              .join(", ")
          )}
        </Item>
        <Item label="Ders">{course?.name ?? <Missing>—</Missing>}</Item>
        <Item label="Ünite">{unit?.title ?? <Missing>—</Missing>}</Item>
      </Section>

      <Section title="Performans">
        <Item label="Deneme">
          <span className="tabular-nums">{stats.attempts}</span>
        </Item>
        <Item label="Doğru oranı">
          {stats.correct_rate === null ? (
            <Missing>Henüz çözülmedi</Missing>
          ) : (
            <span className="tabular-nums">%{stats.correct_rate}</span>
          )}
        </Item>
        <Item label="Ort. süre">
          {stats.avg_seconds === null ? (
            <Missing>Süre verisi yok</Missing>
          ) : (
            <span className="tabular-nums">{stats.avg_seconds} sn</span>
          )}
        </Item>
        <Item label="İnceleme gerekli">
          <YesNo value={stats.needs_review} />
        </Item>
      </Section>

      <section className="border-t border-border px-4 py-3">
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Kalite sinyalleri
        </h3>
        {signals.length === 0 ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-800">
            <CheckCircle2 aria-hidden="true" className="size-4" />
            Dikkat gerektiren sinyal yok.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {signals.map((signal) => {
              const Icon = toneIcons[signal.tone];
              return (
                <li
                  className={`rounded-md border px-2.5 py-1.5 text-sm ${toneStyles[signal.tone]}`}
                  key={signal.id}
                >
                  <p className="flex items-start gap-1.5 font-medium">
                    <Icon
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                    {signal.title}
                  </p>
                  {signal.detail === undefined ? null : (
                    <p className="mt-0.5 pl-5.5 text-xs opacity-90">
                      {signal.detail}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Section title="İçerik">
        <Item label="Açıklama var mı">
          <YesNo value={hasExplanation} />
        </Item>
        <Item label="Editör destekliyor mu">
          <YesNo value={supported} />
        </Item>
        <Item label="Cevap anahtarı var mı">
          <YesNo value={hasAnswerKey} />
        </Item>
      </Section>

      <p className="border-t border-border px-4 py-2.5 text-xs text-muted">
        Değerler son okunan backend yanıtındandır; istatistikler yeni
        denemelerle güncellenir.
      </p>
    </div>
  );
}

/** Desktop: a panel at the top of the editor's right column. */
export function QuestionInspectorPanel(props: QuestionInspectorProps) {
  return (
    <section
      aria-label="Soru denetçisi"
      className="hidden rounded-lg border border-border bg-surface lg:block"
    >
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
        Soru denetçisi
      </h2>
      <QuestionInspectorBody {...props} />
    </section>
  );
}

/** Below `lg`: a collapsed details section above the form. */
export function QuestionInspectorDetails(props: QuestionInspectorProps) {
  const warnings = inspectorSignals(props).filter(
    (signal) => signal.tone === "warning",
  ).length;

  return (
    <details className="rounded-lg border border-border bg-surface lg:hidden">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
        <span>Soru denetçisi</span>
        {warnings === 0 ? null : (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            {warnings} uyarı
          </span>
        )}
      </summary>
      <div className="border-t border-border">
        <QuestionInspectorBody {...props} />
      </div>
    </details>
  );
}
