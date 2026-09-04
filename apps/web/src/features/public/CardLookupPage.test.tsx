import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CardLookupPage } from "./CardLookupPage";

describe("CardLookupPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders search inputs and handles query submission", async () => {
    const mockLookupData = [
      {
        public_id: "test-pub-id-1",
        call: "VR2XYZ",
        qso_date: "20260904",
        image_url: "https://example.com/cards/test-pub-id-1/image"
      }
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: mockLookupData })
    } as Response);

    render(<CardLookupPage />);

    const callInput = screen.getByLabelText(/对方呼号|呼号/i);
    const dateInput = screen.getByLabelText(/UTC 日期|日期/i);
    const submitBtn = screen.getByRole("button", { name: /查询|索卡/i });

    fireEvent.change(callInput, { target: { value: "VR2XYZ" } });
    fireEvent.change(dateInput, { target: { value: "20260904" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/v1/public/card-lookup",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ call: "VR2XYZ", qso_date: "20260904" })
        })
      );
    });

    expect(await screen.findByText(/VR2XYZ/i)).toBeTruthy();
  });
});
