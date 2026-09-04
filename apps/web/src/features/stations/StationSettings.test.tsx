import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { StationSettings } from "./StationSettings";
import { api } from "../../lib/api-client";

describe("StationSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads station list and handles station creation", async () => {
    const listSpy = vi.spyOn(api.stations, "list").mockResolvedValue({
      data: {
        data: [
          {
            id: 1,
            callsign: "BI1ABC",
            operator_callsign: "BI1ABC",
            grid_square: "OM89xx",
            is_default: 1,
            version: 1
          }
        ]
      },
      etag: null
    } as any);

    const createSpy = vi.spyOn(api.stations, "create").mockResolvedValue({
      data: {
        id: 2,
        callsign: "BG4YYY",
        operator_callsign: null,
        grid_square: null,
        is_default: false,
        version: 1
      },
      etag: null
    } as any);

    render(<StationSettings />);

    await waitFor(() => {
      expect(listSpy).toHaveBeenCalled();
    });

    expect(await screen.findByText("BI1ABC")).toBeTruthy();
    expect(screen.getByText("(默认)")).toBeTruthy();

    const callsignInput = screen.getByLabelText("本台呼号");
    fireEvent.change(callsignInput, { target: { value: "BG4YYY" } });
    const submitBtn = screen.getByRole("button", { name: "添加台站" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          callsign: "BG4YYY",
          is_default: false
        })
      );
    });
  });
});
