# Bilgin Admin

Bilgin için Next.js App Router ve TypeScript tabanlı yönetim paneli.

## Gereksinimler

- Node.js 24.21.0 (`.nvmrc`)
- pnpm 12.4.2 (`packageManager`)

## Kurulum

```bash
cp .env.example .env.local
pnpm install --frozen-lockfile
pnpm dev
```

### Environment

- `BILGIN_API_URL`: Laravel backend origin'i. `/api/admin/v1` gibi bir path
  eklemeyin.
- `APP_ORIGIN`: Bilgin Admin uygulamasının canonical origin'i.
- `SESSION_SECRET`: En az 32 karakterli session encryption secret'ı. Production
  için cryptographically strong bir değer üretin: `openssl rand -base64 32`.
- `SESSION_MAX_AGE_SECONDS`: Encrypted cookie tabanlı stateless session ömrü.
  Varsayılan ve izin verilen maksimum değer 28.800 saniyedir (8 saat).

Gerçek env dosyalarını commit etmeyin. **Production'da her iki origin de HTTPS
olmalıdır**: env şeması production build'de `http://localhost` gibi origin'leri
bilinçli olarak reddeder. Bu nedenle production build'i denerken HTTPS
placeholder değerleri kullanın:

```bash
BILGIN_API_URL=https://api.example.test \
APP_ORIGIN=https://admin.example.test \
SESSION_SECRET=test-session-secret-that-is-at-least-32-characters-long \
SESSION_MAX_AGE_SECONDS=28800 \
pnpm build
```

## Komutlar

| Komut                     | Ne yapar                                         |
| ------------------------- | ------------------------------------------------ |
| `pnpm dev`                | Geliştirme sunucusu                              |
| `pnpm build`              | Production build (HTTPS env gerekir)             |
| `pnpm start`              | Build edilmiş uygulamayı çalıştırır              |
| `pnpm lint`               | ESLint                                           |
| `pnpm typecheck`          | `tsc --noEmit`                                   |
| `pnpm format:check`       | Prettier doğrulaması (`pnpm format` düzeltir)    |
| `pnpm test:unit`          | Unit + component testleri (Vitest, jsdom opt-in) |
| `pnpm test:unit:coverage` | Aynı suite + V8 coverage raporu                  |
| `pnpm test:integration`   | Route Handler + transport integration (MSW)      |
| `pnpm test:e2e`           | Auth smoke E2E (Playwright, yalnız local)        |

### Test katmanları

1. **Unit / component** — saf logic, Zod contract'ları, session primitive'leri ve
   Testing Library ile login/logout/shell davranışları. `src/**/*.test.ts(x)`.
2. **Integration** — gerçek Route Handler, gerçek backend transport, gerçek
   session seal/cookie ve gerçek hata normalizasyonu. Yalnız Laravel origin'i
   MSW ile taklit edilir (`src/test/integration/`). MSW
   `onUnhandledRequest: "error"` ile çalışır: suite yanlışlıkla ağa çıkarsa test
   başarısız olur.
3. **Auth smoke E2E** — gerçek Chromium, gerçek Next.js sunucusu ve
   `e2e/support/mock-backend.mjs` içindeki minimal yerel sahte backend. Gerçek
   bir Laravel'e (production, staging veya developer) **bağlanmaz**. Hedef URL
   loopback değilse suite tarayıcı açılmadan önce hata verir.

## Auth mimarisi

```
Browser  →  /api/session/*  →  Next.js server  →  Laravel admin API
```

- Browser hiçbir zaman Laravel'e doğrudan istek atmaz; `BILGIN_API_URL` yalnız
  server tarafında bilinir.
- Laravel bearer token'ı **encrypted, HttpOnly, stateless frontend session
  cookie'si** içinde saklanır. Browser JavaScript'i token'ı okuyamaz ve token
  hiçbir response gövdesine yazılmaz.
- Browser'a yalnız `SafeAdmin` (id, name, email, role, roleLabel, abilities)
  gider; `backendToken`, `issuedAt`, `validatedAt`, `expiresAt` cookie'nin
  şifreli içeriğinde kalır.
- `/api/session/me` frontend session'ın tek periyodik doğrulama ucudur. Session
  taze (< 5 dk) ise backend'e gidilmez; bayatsa Laravel `/me` bir kez çağrılır,
  kimlik bilgisi tazelenir ve `validatedAt` güncellenir. Mutlak son kullanma
  tarihi (`expiresAt`) kaymaz.
- Gelen `Authorization` ve `Cookie` başlıkları backend'e **forward edilmez**;
  backend'e yalnız session içindeki token gönderilir. Genel amaçlı bir
  `/api/admin/[...path]` proxy'si yoktur.
- Yetkilendirme kararları yalnız login response'undaki `abilities`
  snapshot'ından gelir. Frontend'de rol → yetki eşlemesi yoktur; `role` sadece
  kimlik/görüntü bilgisidir.
- **Çıkış yalnız yereldir**: frontend session cookie'si silinir. Backend
  Sanctum token'ı iptal edilmez (aşağıya bakın).

## Known Backend Security Limitations / Production Readiness Gates

Aşağıdaki maddeler `bilgin-backend` kaynağı okunarak doğrulanmıştır. Bunlar
frontend'de çözülemez; production'a çıkmadan önce kabul edilmeli veya backend
tarafında giderilmelidir.

### 1. Admin token revoke / logout ucu yok

`app/Modules/Admin/Routes/api.php` içinde `admin/v1` prefix'i altında bir
logout veya token revoke ucu **yoktur** (öğrenci API'sinde `auth/logout`
vardır, panel API'sinde yoktur). Sonuç: paneldeki "Çıkış" yalnız frontend
cookie'sini siler; o oturumda üretilmiş Sanctum token'ı backend'de geçerli
kalmaya devam eder. 8 saatlik frontend session ömrü **backend token ömrü
değildir**.

> **Gate:** panel için bir token revoke ucu eklenmeli, ya da bu davranış
> bilinçli olarak kabul edilmelidir.

### 2. Backend token'ları süresiz

`config/sanctum.php` içinde `'expiration' => null`. Admin token'larının son
kullanma tarihi yoktur ve (1) nedeniyle iptal edilecek bir uç da yoktur.

> **Gate:** token lifecycle/revocation politikası kararlaştırılmalı.

### 3. Pasifleştirilmiş yöneticinin mevcut token'ı

`EnsureAdminRole` middleware'i (`admin.can:*`) `is_active` kontrolü yapar, ancak
yalnız `auth:admin` ile korunan uçlar bu kontrolü yapmaz. Bu uçlar şu anda okuma
uçlarıdır: `me`, `courses`, `courses/{course}/units`, `courses/{course}/topics`,
`unit-templates`, `nodes/{node}/preview-selection`, `units/{unit}/exercises`,
`exercises/{exercise}`. Yani pasifleştirilmiş bir yönetici **yeniden giriş
yapamaz** ve yazma/yayınlama uçlarını kullanamaz, fakat elindeki eski token ile
bu okuma uçlarına erişmeye devam edebilir.

Frontend bunu güvenilir şekilde tespit edemez: `/me` yanıtında `is_active`
alanı yoktur.

> **Gate:** `auth:admin` katmanında `is_active` kontrolü, veya `/me` yanıtına
> `is_active` eklenmesi değerlendirilmeli.

### 4. Login throttle ve gerçek istemci IP'si

Login ucu `throttle:5,1` ile korunur (dakikada 5 deneme).
`bootstrap/app.php` içinde `trustProxies` `TRUSTED_PROXIES` env değişkeninden
beslenir; boşsa hiçbir proxy'ye güvenilmez. Panel mimarisi
`browser → Next.js → Laravel` olduğu için Laravel'in gördüğü istemci IP'si
deployment topolojisine bağlıdır: yanlış yapılandırmada tüm panel trafiği tek IP
gibi görünür ve rate limit ya herkesi birlikte kilitler ya da anlamsızlaşır.

**Frontend tarafı çözüldü.** Panel Vercel'de barındığı için `/api/session/login`
artık `@vercel/functions`'ın `ipAddress()` yardımcısıyla — istemcinin
gönderdiği bir başlığı değil, Vercel'in edge proxy'sinin kendi hesapladığı
adresi (`x-real-ip`) — gerçek istemci IP'sini okuyor
(`src/lib/security/client-ip.ts`) ve yalnızca login çağrısında Laravel'e
`X-Forwarded-For` olarak iletiyor (`src/lib/backend/client.ts`). Diğer hiçbir
uca hâlâ hiçbir proxy başlığı forward edilmiyor; bu, gelen bir başlığı
körlemesine iletmekten farklıdır — Vercel'in kendi hesapladığı değeri, panelin
kendisi tek bir güvenilir başlığa dönüştürüyor.

Bu, gate'in yalnızca yarısı: Laravel bu değeri **yalnızca** `TRUSTED_PROXIES`
bu paneli (Next.js sunucusunu) güvenilir proxy olarak tanımlıyorsa dikkate
alır. Vercel serverless fonksiyonlarının varsayılan olarak sabit bir çıkış
IP'si yoktur, bu yüzden `TRUSTED_PROXIES`'i tek bir IP/CIDR'a kilitlemek genelde
mümkün değildir — pratik seçenekler: (a) Vercel'in statik giden IP eklentisini
kullanıp o IP/CIDR'ı `TRUSTED_PROXIES`'e yazmak, ya da (b) Laravel API'sinin
internetten doğrudan erişilebilir olmadığından (yalnızca bu panelden
çağrıldığından) emin olup `TRUSTED_PROXIES=*` kullanmak — bu güvenli olması için
Laravel'in başka hiçbir yoldan halka açık olmaması gerekir.

> **Gate:** backend deployment'ında `TRUSTED_PROXIES` yukarıdaki seçeneklerden
> biriyle ayarlanmalı. Bu, bu repodan yapılamaz; backend'in barındığı
> platform ve ağ topolojisi bilinmeden hangi seçeneğin doğru olduğu
> söylenemez.

### 5. Stateless cookie replay

Encrypted HttpOnly cookie, bearer token'ın browser JavaScript'i tarafından
okunmasını engeller ve token'ın response gövdelerine sızmasını önler. Ancak
HttpOnly "XSS'e karşı tam koruma" değildir: XSS varsa saldırgan kullanıcının
tarayıcısı üzerinden aynı origin'e istek atabilir. Ayrıca cookie değeri başka
bir yolla ele geçirilirse, server tarafında bir frontend session store'u veya
iptal listesi olmadığı için o seal mutlak son kullanma tarihine (en fazla 8
saat) kadar kullanılabilir.

> **Gate:** daha kısa session ömrü veya server-side session store ihtiyacı
> değerlendirilmeli.

### 6. `/me` abilities döndürmüyor

Laravel `/me` ucu `id`, `name`, `email`, `role`, `role_label` döner; `abilities`
**dönmez**. Bu nedenle yetki snapshot'ı login yanıtından gelir ve session
içinde korunur. Rol değişirse `/me` doğrulamasındaki id/role karşılaştırması
uyuşmaz ve kullanıcı yeniden giriş yapmaya yönlendirilir. Frontend `/me`
yanıtından yetki türetmez. Bu bir güvenlik açığı değil, contract sınırıdır.

### 7. HSTS

HSTS bilinçli olarak ertelenmiştir: deployment domain'i ve subdomain topolojisi
donmadan `includeSubDomains`/`preload` eklemek geri alınması zor bir karardır.

> **Gate:** domain/topoloji kararından sonra HSTS etkinleştirilmeli.

### 8. Gerçek Laravel'e karşı contract testi

Bu repoda **uygulanmadı**. Login ucu token üretir ve `last_login_at` alanını
değiştirir; dolayısıyla "read-only contract smoke" değildir ve paylaşılan bir
ortama karşı çalıştırılmamalıdır. Bunun için tek kullanımlık (disposable) bir
backend ortamı gerekir.

> **Gate:** disposable integration ortamı sağlandığında gerçek contract smoke
> testi eklenmeli. O zamana kadar M0 contract güvencesi frontend'in Zod
> şemaları + MSW integration testleridir.

## CI

`.github/workflows/quality.yml` iki job çalıştırır:

- **quality** — install (frozen lockfile), lint, typecheck, format:check, unit +
  coverage, integration, production build.
- **e2e** — `needs: quality`; Chromium kurar ve auth smoke suite'ini yerel mock
  backend'e karşı çalıştırır.

Tüm GitHub Action'ları full commit SHA ile pinlenmiştir ve workflow izinleri
`contents: read` ile sınırlıdır. CI gerçek secret veya gerçek backend
kullanmaz.

> **Manuel takip:** `Quality` workflow'u GitHub ayarlarından `main` için
> **required check** olarak işaretlenmelidir. Bu repo içinden yapılamaz.
