# Bilgin Admin

Bilgin için Next.js App Router ve TypeScript tabanlı yönetim paneli.

## Gereksinimler

- Node.js 24.21.0
- pnpm 12.4.2

## Kurulum

```bash
pnpm install
```

## Geliştirme

```bash
pnpm dev
```

## Environment

Yerel geliştirme dosyasını örnekten oluşturun:

```bash
cp .env.example .env.local
```

- `BILGIN_API_URL`: Laravel backend origin'i. `/api/admin/v1` gibi bir path
  eklemeyin.
- `APP_ORIGIN`: Bilgin Admin uygulamasının canonical origin'i.
- `SESSION_SECRET`: En az 32 karakterli session encryption secret'ı. Production
  için cryptographically strong bir değer üretin: `openssl rand -base64 32`.
- `SESSION_MAX_AGE_SECONDS`: Encrypted cookie tabanlı stateless session ömrü.
  Varsayılan ve izin verilen maksimum değer 28.800 saniyedir (8 saat).

Gerçek env dosyalarını commit etmeyin. Production ortamında iki origin de HTTPS
kullanmalıdır.

## Kontroller

```bash
pnpm lint
pnpm typecheck
pnpm format:check
pnpm test:unit
pnpm build
```
