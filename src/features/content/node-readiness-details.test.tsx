/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "@/test/dom-setup";

import { NodeReadinessDetails } from "@/features/content/node-readiness-details";
import type { NodeCheck } from "@/features/content/use-readiness-snapshots";
import { nodePreview, unitNode } from "@/test/fixtures/publishing";

function item(title: string) {
  return within(screen.getByRole("list", { name: "Adımlar" }))
    .getAllByRole("listitem")
    .find((element) => element.textContent?.includes(title))!;
}

function field(container: HTMLElement, label: string) {
  const term = within(container).getByText(label);
  return term.nextElementSibling?.textContent;
}

describe("NodeReadinessDetails", () => {
  const checks: NodeCheck[] = [
    {
      node: unitNode(1, {
        title: "Çalışma 1",
        type: "study",
        difficulty: "kolay",
      }),
      state: "answered",
      preview: nodePreview(1, {
        required: 4,
        available: 4,
        relaxed: true,
        live_available: 2,
        live_passes: false,
        live_warning: "Öğrenciler şu an 2 soru alıyor; 4 gerekiyor.",
        message: "Yeterli (4/4) — ancak zorluk filtresi gevşetilerek.",
      }),
      error: null,
    },
    {
      node: unitNode(2, {
        title: "Mini Challenge",
        type: "mini_challenge",
        difficulty: "zor",
      }),
      state: "answered",
      preview: nodePreview(2, { required: 8, available: 2 }),
      error: null,
    },
    {
      node: unitNode(3, { title: "Bekleyen" }),
      state: "unchecked",
      preview: undefined,
      error: null,
    },
    {
      node: unitNode(4, { title: "Sürüyor" }),
      state: "checking",
      preview: undefined,
      error: null,
    },
    {
      node: unitNode(5, { title: "Bozuk" }),
      state: "error",
      preview: undefined,
      error: { kind: "server", status: 500, message: "Sunucu hatası." },
    },
  ];

  it("shows every backend field verbatim", () => {
    render(<NodeReadinessDetails checks={checks} label="Adımlar" />);

    const relaxed = item("Çalışma 1");
    expect(within(relaxed).getByText("Çalışma · Kolay")).toBeDefined();
    expect(within(relaxed).getByText("Havuz dar")).toBeDefined();
    expect(field(relaxed, "Gerekli soru")).toBe("4");
    expect(field(relaxed, "Yayında aday soru")).toBe("4");
    expect(field(relaxed, "Öğrenciye giden soru")).toBe("2");
    expect(field(relaxed, "Yayın kuralı geçiyor")).toBe("Evet");
    expect(field(relaxed, "Şu an geçiyor")).toBe("Hayır");
    expect(field(relaxed, "Gevşetilmiş kural")).toBe("Evet");
    expect(relaxed.textContent).toContain(
      "Sunucu mesajı: Yeterli (4/4) — ancak zorluk filtresi gevşetilerek.",
    );
    expect(relaxed.textContent).toContain(
      "Canlı uyarı: Öğrenciler şu an 2 soru alıyor; 4 gerekiyor.",
    );

    const failing = item("Mini Challenge");
    expect(within(failing).getByText("Yetersiz")).toBeDefined();
    expect(field(failing, "Yayın kuralı geçiyor")).toBe("Hayır");
    expect(failing.textContent).toContain("Canlı uyarı: Yok");
  });

  it("never shows a pass for a node without an answer", () => {
    render(<NodeReadinessDetails checks={checks} label="Adımlar" />);

    expect(item("Bekleyen").textContent).toContain("Henüz kontrol edilmedi.");
    expect(item("Sürüyor").textContent).toContain("Kontrol ediliyor…");
    expect(item("Bozuk").textContent).toContain(
      "Hazırlık durumu okunamadı: Sunucu hatası.",
    );
    for (const title of ["Bekleyen", "Sürüyor", "Bozuk"]) {
      expect(within(item(title)).queryByText("Hazır")).toBeNull();
    }
  });

  it("anchors each node so a blocking row can link to it", () => {
    const { container } = render(
      <NodeReadinessDetails checks={checks} label="Adımlar" />,
    );

    expect(container.querySelector("#node-preview-2")).not.toBeNull();
  });
});
