import { ContentScanCenter } from "@/features/content/content-scan-center";
import { requireCurrentAdmin } from "@/lib/session/current";

export default async function ScanPage() {
  // Authenticated panel route: the proxy checks the session cookie first and
  // this re-validates it on the server before anything renders.
  await requireCurrentAdmin();

  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          Tam İçerik Taraması
        </h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted">
          Tüm derslerin ünite ve soru listelerini okuyup tek bir tarama sonucu
          oluşturur. Sonuç bu oturum boyunca Soru Kalite Merkezi gibi ekranlarda
          kullanılır.
        </p>
      </header>

      <div className="mt-6">
        <ContentScanCenter />
      </div>
    </section>
  );
}
