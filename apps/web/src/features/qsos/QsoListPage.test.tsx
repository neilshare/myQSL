import { cleanup, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { QsoListPage } from "./QsoListPage";
import { api } from "../../lib/api-client";

describe("QsoListPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders QSO list and handles filter submission", async () => {
    const listSpy = vi.spyOn(api.qsos, "list").mockResolvedValue({
      data: [
        {
          id: 1,
          call: "BG4YYY",
          qso_date: "20260903",
          time_on: "1430",
          band: "40M",
          mode: "SSB"
        }
      ],
      etag: null
    } as any);

    render(<QsoListPage />);

    // Check initial fetch
    await waitFor(() => {
      expect(listSpy).toHaveBeenCalled();
    });

    expect(await screen.findByText("BG4YYY")).toBeTruthy();

    // Trigger filter submission
    const callFilterInput = screen.getByLabelText("呼号筛选");
    fireEvent.change(callFilterInput, { target: { value: "BG4YYY" } });
    const filterBtn = screen.getByRole("button", { name: "筛选" });
    fireEvent.click(filterBtn);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith(expect.stringContaining("call=BG4YYY"));
    });
  });

  it("renders time and QSL summary cards from the available records", async () => {
    vi.spyOn(api.qsos, "list").mockResolvedValue({
      data: [{ id: 9, call: "BG4YYY", qso_date: "20260903", time_on: "143000", band: "20M", mode: "SSB" }],
      etag: null
    } as any);
    vi.spyOn(api.cards, "list").mockResolvedValue({
      data: [
        { id: "card-1", status: "published" },
        { id: "card-2", status: "draft" }
      ],
      etag: null
    } as any);

    render(<QsoListPage />);

    const summary = await screen.findByLabelText("QSO 摘要");
    expect(within(summary).getByText("本地时间")).toBeTruthy();
    expect(within(summary).getByText("UTC 时间")).toBeTruthy();
    expect(within(summary).getByText("我的通联")).toBeTruthy();
    expect(within(summary).getByText("我的 QSL")).toBeTruthy();
    expect(within(summary).getAllByText("1")).toHaveLength(2);
  });
});
