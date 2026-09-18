import { CoursesBrowser } from "@/features/content/courses-browser";

export default function CoursesPage() {
  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          Dersler
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Ders kataloğu ve ünite durumu.
        </p>
      </header>

      <div className="mt-6">
        <CoursesBrowser />
      </div>
    </section>
  );
}
