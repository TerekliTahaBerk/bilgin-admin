"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  createUnitRequestSchema,
  type CreatedUnit,
  type CreateUnitRequest,
  type UnitTemplate,
} from "@/contracts/admin/workflows";
import {
  courseTopicsQueryOptions,
  coursesQueryOptions,
  courseUnitsQueryKey,
} from "@/features/content/content-queries";
import {
  createUnit,
  getUnitTemplates,
} from "@/features/workflows/workflow-client";
import type { ApiError } from "@/lib/api/error";

const field =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm";

export function UnitCreateForm({ courseId }: { courseId: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const courses = useQuery(coursesQueryOptions());
  const topics = useQuery(courseTopicsQueryOptions(courseId));
  const templates = useQuery<UnitTemplate[], ApiError>({
    queryKey: ["content", "unit-templates"],
    queryFn: getUnitTemplates,
    staleTime: 300_000,
  });
  const [templateCode, setTemplateCode] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<number[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const course = courses.data?.find((item) => item.id === courseId);
  const selectedTemplate = templates.data?.find(
    (item) => item.code === templateCode,
  );

  const mutation = useMutation<CreatedUnit, ApiError, CreateUnitRequest>({
    mutationFn: createUnit,
    retry: 0,
    onSuccess: async (created) => {
      setMessage(`${created.nodes.length} adım oluşturuldu.`);
      await queryClient.invalidateQueries({
        queryKey: courseUnitsQueryKey(courseId),
      });
      router.push(`/courses/${courseId}/units/${created.id}`);
    },
  });

  if (course === undefined && courses.isSuccess)
    return <p role="alert">Ders bulunamadı.</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        className="text-sm font-medium text-muted hover:text-foreground"
        href={`/courses/${courseId}`}
      >
        ← Ünitelere dön
      </Link>
      <h1 className="mt-3 text-xl font-semibold">Yeni ünite</h1>
      <p className="mt-1 text-sm text-muted">
        {course?.name ?? "Ders yükleniyor…"}
      </p>

      <form
        className="mt-6 space-y-5 rounded-lg border border-border bg-surface p-5"
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          setMessage(null);
          if (!course) return;
          const data = new FormData(event.currentTarget);
          const optionalNumber = (name: string) => {
            const value = String(data.get(name) ?? "").trim();
            return value === "" ? undefined : Number(value);
          };
          const parsed = createUnitRequestSchema.safeParse({
            course_code: course.code,
            template_code: templateCode,
            title: String(data.get("title") ?? ""),
            topic_ids: selectedTopics,
            sort_order: optionalNumber("sort_order"),
            grade_level: optionalNumber("grade_level"),
            estimated_minutes: optionalNumber("estimated_minutes"),
          });
          if (!parsed.success) {
            setMessage("Zorunlu alanları ve sayı aralıklarını kontrol edin.");
            return;
          }
          mutation.mutate(parsed.data);
        }}
      >
        <label className="block text-sm font-medium">
          Başlık
          <input className={field} maxLength={191} name="title" required />
        </label>
        <label className="block text-sm font-medium">
          Şablon
          <select
            className={field}
            onChange={(event) => setTemplateCode(event.target.value)}
            required
            value={templateCode}
          >
            <option value="">Şablon seçin</option>
            {templates.data?.map((template) => (
              <option key={template.code} value={template.code}>
                {template.name}
                {template.is_default ? " · Varsayılan" : ""}
              </option>
            ))}
          </select>
        </label>
        {selectedTemplate ? (
          <div className="rounded-md bg-surface-muted p-4">
            <h2 className="text-sm font-semibold">Şablon önizlemesi</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {selectedTemplate.nodes.map((node, index) => (
                <li key={`${node.title}-${index}`}>
                  {index + 1}. {node.title} · {node.type} · zorluk{" "}
                  {node.difficulty} · {node.exercise_count} soru
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <fieldset>
          <legend className="text-sm font-medium">Konular</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {topics.data?.topics.map((topic) => (
              <label className="flex items-center gap-2 text-sm" key={topic.id}>
                <input
                  checked={selectedTopics.includes(topic.id)}
                  onChange={(event) =>
                    setSelectedTopics((current) =>
                      event.target.checked
                        ? [...current, topic.id]
                        : current.filter((id) => id !== topic.id),
                    )
                  }
                  type="checkbox"
                />
                {topic.name}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">
            Sıra
            <input className={field} min={1} name="sort_order" type="number" />
          </label>
          <label className="text-sm font-medium">
            Sınıf
            <input
              className={field}
              max={12}
              min={8}
              name="grade_level"
              type="number"
            />
          </label>
          <label className="text-sm font-medium">
            Tahmini dakika
            <input
              className={field}
              min={1}
              name="estimated_minutes"
              type="number"
            />
          </label>
        </div>
        {message ? (
          <p className="text-sm" role={mutation.isError ? "alert" : "status"}>
            {message}
          </p>
        ) : null}
        {mutation.isError ? (
          <p className="text-sm text-danger" role="alert">
            {mutation.error.code === "TOPIC_MISMATCH"
              ? "Seçilen konular bu derse ait değil."
              : mutation.error.message}
          </p>
        ) : null}
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={mutation.isPending || !course}
          type="submit"
        >
          {mutation.isPending ? "Oluşturuluyor…" : "Üniteyi oluştur"}
        </button>
      </form>
    </div>
  );
}
