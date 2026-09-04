import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TrashPage } from "./TrashPage";
import { api } from "../../lib/api-client";

describe("TrashPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads deleted QSOs and triggers restore", async () => {
    const listSpy = vi.spyOn(api.qsos, "list").mockResolvedValue({
      data: [
        {
          id: 42,
          call: "BH1ZZZ",
          qso_date: "20260901",
          time_on: "1200",
          band: "20M",
          mode: "CW",
          deleted_at: 1725360000
        }
      ],
      etag: null
    } as any);

    const restoreSpy = vi.spyOn(api.qsos, "restore").mockResolvedValue({
      data: { id: 42, deleted_at: null },
      etag: null
    });

    render(<TrashPage />);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalledWith("?include_deleted=true");
    });

    expect(await screen.findByText("BH1ZZZ")).toBeTruthy();

    const restoreBtn = screen.getByRole("button", { name: "恢复" });
    fireEvent.click(restoreBtn);

    await waitFor(() => {
      expect(restoreSpy).toHaveBeenCalledWith(42);
    });
  });
});
