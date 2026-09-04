import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { QsoListPage } from "./QsoListPage";
import { api } from "../../lib/api-client";

describe("QsoListPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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
});
