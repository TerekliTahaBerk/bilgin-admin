/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import {
  QualityScanPanel,
  type QualityScanPanelProps,
} from "@/features/analytics/quality-scan-panel";
import type { QualityScanState } from "@/features/analytics/use-quality-scan";

const idle: QualityScanState = {
  status: "idle",
  progress: null,
  failures: [],
  haltError: null,
  isCancelling: false,
};

function renderPanel(props: Partial<QualityScanPanelProps> = {}) {
  const handlers = {
    onScan: vi.fn(),
    onCancel: vi.fn(),
    onRetryFailures: vi.fn(),
  };

  render(
    <QualityScanPanel
      courseName={(id) => `Ders ${id}`}
      coverage={{ totalUnits: 10, scannedUnits: 0, unlistedCourses: 2 }}
      loadedQuestions={0}
      scopeLabel="Tüm dersler"
      state={idle}
      {...handlers}
      {...props}
    />,
  );

  return handlers;
}

describe("QualityScanPanel", () => {
  it("summarises coverage and offers the first scan", async () => {
    const user = userEvent.setup();
    const { onScan } = renderPanel();

    expect(
      screen.getByRole("heading", { name: "Veri kapsamı: Tüm dersler" }),
    ).toBeDefined();
    expect(
      screen.getByText(
        "0/10 ünite tarandı · 0 soru yüklendi · 2 dersin ünite listesi henüz okunmadı",
      ),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /yeniden tara/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Tara (10 ünite)" }));
    expect(onScan).toHaveBeenCalledWith({ refresh: false });
  });

  it("offers the remaining units and a fresh re-scan once partly scanned", async () => {
    const user = userEvent.setup();
    const { onScan } = renderPanel({
      coverage: { totalUnits: 10, scannedUnits: 4, unlistedCourses: 0 },
      loadedQuestions: 57,
    });

    expect(
      screen.getByText("4/10 ünite tarandı · 57 soru yüklendi"),
    ).toBeDefined();
    await user.click(
      screen.getByRole("button", { name: "Kalanları tara (6 ünite)" }),
    );
    expect(onScan).toHaveBeenLastCalledWith({ refresh: false });

    await user.click(
      screen.getByRole("button", { name: "Güncel verilerle yeniden tara" }),
    );
    expect(onScan).toHaveBeenLastCalledWith({ refresh: true });
  });

  it("offers only a re-scan when the scope is fully scanned", () => {
    renderPanel({
      coverage: { totalUnits: 3, scannedUnits: 3, unlistedCourses: 0 },
    });

    expect(
      screen.queryByRole("button", { name: /^(Tara \(|Kalanları)/ }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Güncel verilerle yeniden tara" }),
    ).toBeDefined();
  });

  it("shows progress and a stop button while running", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderPanel({
      state: {
        ...idle,
        status: "running",
        progress: { phase: "exercises", completed: 3, total: 12 },
      },
    });

    const bar = screen.getByRole("progressbar", { name: "Tarama ilerlemesi" });
    expect(bar.getAttribute("aria-valuenow")).toBe("3");
    expect(bar.getAttribute("aria-valuemax")).toBe("12");
    expect(
      screen.getByText("Soru listeleri okunuyor: 3/12 ünite"),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: /^Tara \(/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /yeniden tara/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Taramayı durdur" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("describes the unit-listing phase and the starting moment", () => {
    renderPanel({
      state: {
        ...idle,
        status: "running",
        progress: { phase: "units", completed: 1, total: 4 },
      },
    });
    expect(
      screen.getByText("Ünite listeleri okunuyor: 1/4 ders"),
    ).toBeDefined();
  });

  it("shows a starting message before the first progress event", () => {
    renderPanel({ state: { ...idle, status: "running" } });
    expect(screen.getByText("Tarama başlatılıyor…")).toBeDefined();
  });

  it("disables stop while cancelling", () => {
    renderPanel({
      state: { ...idle, status: "running", isCancelling: true },
    });

    expect(
      (
        screen.getByRole("button", {
          name: "Durduruluyor…",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("reports completion", () => {
    renderPanel({ state: { ...idle, status: "completed" } });
    expect(screen.getByText("Tarama tamamlandı.")).toBeDefined();
  });

  it("reports a cancelled scan", () => {
    renderPanel({ state: { ...idle, status: "cancelled" } });
    expect(
      screen.getByText(
        "Tarama durduruldu. O ana kadar okunan sorular listede.",
      ),
    ).toBeDefined();
  });

  it("explains a rate-limit halt with the server's wait time", () => {
    renderPanel({
      state: {
        ...idle,
        status: "halted",
        haltError: {
          kind: "rate_limit",
          status: 429,
          message: "Çok fazla istek.",
          retryAfterSeconds: 40,
        },
      },
    });

    expect(
      screen.getByText(
        "Sunucu çok fazla istek aldığını bildirdi; tarama durduruldu. 40 saniye sonra tekrar deneyin.",
      ),
    ).toBeDefined();
  });

  it("explains a rate-limit halt without a wait time", () => {
    renderPanel({
      state: {
        ...idle,
        status: "halted",
        haltError: { kind: "rate_limit", status: 429, message: "x" },
      },
    });

    expect(screen.getByText(/Bir süre sonra tekrar deneyin\./)).toBeDefined();
  });

  it("lists failures and retries only them", async () => {
    const user = userEvent.setup();
    const { onRetryFailures } = renderPanel({
      state: {
        ...idle,
        status: "completed",
        failures: [
          {
            kind: "course",
            courseId: 1,
            error: { kind: "server", status: 500, message: "Sunucu hatası." },
          },
          {
            kind: "unit",
            courseId: 2,
            unitId: 20,
            title: "Kuvvet",
            error: { kind: "network", status: null, message: "Bağlantı yok." },
          },
        ],
      },
    });

    expect(screen.getByRole("alert").textContent).toContain(
      "2 liste okunamadı.",
    );
    expect(
      screen.getByText("Ders 1 — ünite listesi: Sunucu hatası."),
    ).toBeDefined();
    expect(screen.getByText("Ders 2 › Kuvvet: Bağlantı yok.")).toBeDefined();
    expect(screen.queryByText("Tarama tamamlandı.")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "Okunamayanları tekrar dene" }),
    );
    expect(onRetryFailures).toHaveBeenCalled();
  });

  it("offers no scan for an empty scope", () => {
    renderPanel({
      coverage: { totalUnits: 0, scannedUnits: 0, unlistedCourses: 0 },
    });

    expect(screen.queryByRole("button")).toBeNull();
  });
});
