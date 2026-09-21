/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import { ExportCsvButton } from "@/components/export-csv-button";

type Row = Readonly<{ name: string }>;
const columns = [{ header: "Ad", value: (row: Row) => row.name }];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ExportCsvButton", () => {
  it("is disabled when there are no rows", () => {
    render(
      <ExportCsvButton columns={columns} filename="x.csv" rows={[]} />,
    );

    expect(
      (screen.getByRole("button") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("triggers a CSV download when clicked", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(
      <ExportCsvButton
        columns={columns}
        filename="dersler.csv"
        rows={[{ name: "TYT Matematik" }]}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });
});
