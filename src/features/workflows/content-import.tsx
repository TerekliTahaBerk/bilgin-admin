"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import type {
  ContentPackage,
  ImportContentResult,
} from "@/contracts/admin/workflows";
import { coursesQueryKey } from "@/features/content/content-queries";
import {
  importContent,
  parseContentPackage,
} from "@/features/workflows/workflow-client";
import type { ApiError } from "@/lib/api/error";
import { csvToMultipleChoiceExercises } from "@/lib/import/csv-to-exercises";

export function ContentImport() {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ContentPackage | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [tableRaw, setTableRaw] = useState("");
  const [tableJson, setTableJson] = useState<string | null>(null);
  const [tableErrors, setTableErrors] = useState<readonly string[]>([]);
  const [tableCount, setTableCount] = useState(0);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [mergeStatus, setMergeStatus] = useState<string | null>(null);
  const mutation = useMutation<ImportContentResult, ApiError, ContentPackage>({
    mutationFn: importContent,
    retry: 0,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: coursesQueryKey });
    },
  });

  function preview(value: string) {
    setRaw(value);
    setParsed(null);
    setParseError(null);
    if (!value.trim()) return;
    const result = parseContentPackage(value);
    if (result.success) setParsed(result.data);
    else setParseError(result.message);
  }

  function convertTable(value: string) {
    setTableRaw(value);
    setCopyStatus(null);
    setMergeStatus(null);
    if (!value.trim()) {
      setTableJson(null);
      setTableErrors([]);
      setTableCount(0);
      return;
    }
    const result = csvToMultipleChoiceExercises(value);
    setTableErrors(result.errors);
    setTableCount(result.exercises.length);
    setTableJson(
      result.exercises.length > 0
        ? JSON.stringify(result.exercises, null, 2)
        : null,
    );
  }

  async function copyTableJson() {
    if (!tableJson) return;
    try {
      await navigator.clipboard.writeText(tableJson);
      setCopyStatus("Panoya kopyalandı.");
    } catch {
      setCopyStatus("Panoya kopyalanamadı. Metni elle seçip kopyalayın.");
    }
  }

  function mergeTableIntoPackage() {
    if (!parsed) {
      setMergeStatus(
        "Önce soldaki alana geçerli bir JSON paketi girin, sonra eklemeyi deneyin.",
      );
      return;
    }
    const result = csvToMultipleChoiceExercises(tableRaw);
    if (result.exercises.length === 0) return;
    const merged: ContentPackage = {
      ...parsed,
      exercises: [...parsed.exercises, ...result.exercises],
    };
    preview(JSON.stringify(merged, null, 2));
    setMergeStatus(
      `${result.exercises.length} soru pakete eklendi. Sol taraftaki JSON güncellendi.`,
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold">JSON içerik paketi içe aktar</h1>
      <p className="mt-1 text-sm text-muted">
        Excel ve CSV desteklenmez. Paket içe aktarılır; otomatik yayınlanmaz.
      </p>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-5">
          <label className="block text-sm font-medium">
            .json dosyası
            <input
              accept="application/json,.json"
              className="mt-2 block w-full text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then(preview);
              }}
              type="file"
            />
          </label>
          <label className="mt-5 block text-sm font-medium">
            veya JSON yapıştırın
            <textarea
              className="mt-2 min-h-80 w-full rounded-md border border-border bg-surface p-3 font-mono text-xs"
              onChange={(event) => preview(event.target.value)}
              spellCheck={false}
              value={raw}
            />
          </label>
          {parseError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {parseError}
            </p>
          ) : null}
        </section>
        <section className="rounded-lg border border-border bg-surface p-5">
          <h2 className="font-semibold">Güvenli önizleme</h2>
          {parsed ? (
            <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Ders</dt>
              <dd>{parsed.course}</dd>
              <dt className="text-muted">Branş</dt>
              <dd>{parsed.subject}</dd>
              <dt className="text-muted">Ünite</dt>
              <dd>{parsed.unit.title}</dd>
              <dt className="text-muted">Şablon</dt>
              <dd>{parsed.unit.template}</dd>
              <dt className="text-muted">Konu</dt>
              <dd>{parsed.topics.length}</dd>
              <dt className="text-muted">Soru</dt>
              <dd>{parsed.exercises.length}</dd>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted">
              Geçerli paket girildiğinde cevap anahtarlarını göstermeden özet
              burada görünür.
            </p>
          )}
          <button
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            disabled={!parsed || mutation.isPending}
            onClick={() => {
              if (parsed) mutation.mutate(parsed);
            }}
            type="button"
          >
            {mutation.isPending ? "İçe aktarılıyor…" : "Paketi içe aktar"}
          </button>
          {mutation.isError ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {mutation.error.message}
            </p>
          ) : null}
          {mutation.data ? (
            <div
              className="mt-4 rounded-md bg-emerald-50 p-4 text-sm text-emerald-900"
              role="status"
            >
              <p className="font-semibold">
                {mutation.data.unit_title} içe aktarıldı.
              </p>
              <p>
                {mutation.data.topics} konu · {mutation.data.nodes} adım ·{" "}
                {mutation.data.exercises} soru
              </p>
              <Link
                className="mt-2 inline-block font-semibold underline"
                href={`/courses`}
              >
                Yeni üniteyi ders listesinde aç
              </Link>
            </div>
          ) : null}
        </section>
      </div>
      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <h2 className="font-semibold">Tablo yapıştır (çoktan seçmeli)</h2>
        <p className="mt-1 text-sm text-muted">
          Excel/Sheets&apos;ten kopyaladığınız (sekmeyle ayrılmış) ya da
          virgülle ayrılmış bir tabloyu buraya yapıştırın. Beklenen sütunlar:{" "}
          <code className="text-xs">
            topic, stem, option_a, option_b, option_c, option_d, correct
          </code>{" "}
          (opsiyonel: <code className="text-xs">difficulty</code>,{" "}
          <code className="text-xs">explanation</code>).
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <textarea
            aria-label="Tablo yapıştırma alanı"
            className="min-h-48 w-full rounded-md border border-border bg-surface p-3 font-mono text-xs"
            onChange={(event) => convertTable(event.target.value)}
            placeholder="topic	stem	option_a	option_b	option_c	option_d	correct"
            spellCheck={false}
            value={tableRaw}
          />
          <div>
            {tableErrors.length > 0 ? (
              <ul className="space-y-1 text-sm text-danger" role="alert">
                {tableErrors.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            ) : null}
            {tableJson ? (
              <>
                <p className="text-sm text-muted">
                  {tableCount} soru dönüştürüldü.
                </p>
                <textarea
                  className="mt-2 min-h-32 w-full rounded-md border border-border bg-surface p-3 font-mono text-xs"
                  readOnly
                  spellCheck={false}
                  value={tableJson}
                />
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-md border border-border px-3 py-2 text-sm font-semibold"
                    onClick={() => void copyTableJson()}
                    type="button"
                  >
                    JSON&apos;u kopyala
                  </button>
                  <button
                    className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white"
                    onClick={mergeTableIntoPackage}
                    type="button"
                  >
                    Soldaki pakete ekle
                  </button>
                </div>
                {copyStatus ? (
                  <p className="mt-2 text-sm text-muted" role="status">
                    {copyStatus}
                  </p>
                ) : null}
                {mergeStatus ? (
                  <p className="mt-2 text-sm text-muted" role="status">
                    {mergeStatus}
                  </p>
                ) : null}
              </>
            ) : tableErrors.length === 0 ? (
              <p className="text-sm text-muted">
                Tablo yapıştırıldığında dönüştürülen sorular burada
                görünecek.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}
