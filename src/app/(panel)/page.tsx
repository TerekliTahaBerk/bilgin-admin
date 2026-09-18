export default function PanelHomePage() {
  return (
    <section aria-labelledby="page-title">
      <header className="border-b border-border pb-5">
        <h1 className="text-xl font-semibold tracking-tight" id="page-title">
          Ana Sayfa
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          Bilgin yönetim paneline hoş geldiniz.
        </p>
      </header>

      <div className="mt-6 max-w-2xl rounded-lg border border-border bg-surface p-6 sm:p-8">
        <h2 className="text-sm font-semibold">İçerik yönetimi</h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          İçerik yönetimi bölümleri sonraki adımda burada yer alacak. Şu anda
          kullanılabilir bölümler menüde listelenir.
        </p>
      </div>
    </section>
  );
}
