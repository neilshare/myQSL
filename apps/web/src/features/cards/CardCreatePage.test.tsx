import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { CardCreatePage } from "./CardCreatePage";
import { api } from "../../lib/api-client";

describe("CardCreatePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      fillText: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 10 })),
      font: "",
      fillStyle: "",
      textAlign: ""
    })) as any;

    HTMLCanvasElement.prototype.toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      cb(new Blob(["fake-image-bytes"], { type: "image/png" }));
    }) as any;
  });

  it("selects QSO and template, generates canvas, uploads image and publishes card", async () => {
    vi.spyOn(api.qsos, "list").mockResolvedValue({
      data: [
        {
          id: 1,
          call: "BH1AAA",
          station_callsign: "BI1ABC",
          qso_date: "20260904",
          time_on: "0800",
          band: "20M",
          mode: "CW"
        }
      ],
      etag: null
    } as any);

    vi.spyOn(api.templates, "list").mockResolvedValue({
      data: [
        {
          id: 10,
          name: "Standard Landscape",
          base_width: 1264,
          base_height: 848,
          layout_json: JSON.stringify({
            schema_version: 1,
            base_width: 1264,
            base_height: 848,
            elements: [
              {
                type: "text",
                x: 0.5,
                y: 0.5,
                field: "call",
                font: "Inter",
                font_size: 32,
                color: "#FFFFFF",
                align: "left"
              }
            ]
          }),
          background_r2_key: null,
          version: 1
        }
      ],
      etag: null
    } as any);

    const createSpy = vi.spyOn(api.cards, "create").mockResolvedValue({
      data: { id: "card-123", status: "draft" },
      etag: null
    } as any);

    const uploadImageSpy = vi.spyOn(api.cards, "uploadImage").mockResolvedValue({
      data: { id: "card-123", status: "ready" },
      etag: null
    } as any);

    const publishSpy = vi.spyOn(api.cards, "publish").mockResolvedValue({
      data: { id: "card-123", status: "published", public_id: "pub-xyz" },
      etag: null
    } as any);

    render(<CardCreatePage />);

    // Check loading of QSO options and Template options
    expect(await screen.findByText(/BH1AAA/)).toBeTruthy();
    expect(await screen.findByText(/Standard Landscape/)).toBeTruthy();

    // Click generate card button
    const generateBtn = screen.getByRole("button", { name: /生成并发布卡片|生成卡片/i });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith({ qso_id: 1, template_id: 10 });
      expect(uploadImageSpy).toHaveBeenCalledWith("card-123", expect.any(Blob));
      expect(publishSpy).toHaveBeenCalledWith("card-123");
    });

    expect(await screen.findByText("卡片已发布")).toBeTruthy();
    expect(screen.getByRole("link", { name: /\/c\/pub-xyz/i })).toBeTruthy();
  });
});
