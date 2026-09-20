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

export function ContentImport() {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ContentPackage | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
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
    </div>
  );
}
