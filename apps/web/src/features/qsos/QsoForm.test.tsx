import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QsoForm } from "./QsoForm";

describe("QsoForm", () => {
  it("submits normalized call and the current ETag", async () => {
    const patch = vi.fn().mockResolvedValue({});
    render(<QsoForm initial={{ id: 10, call: "BG4AAA", station_callsign: "BA4RC", qso_date: "20260903", time_on: "143000", band: "40M", mode: "SSB" }} etag={'W/"qso-10-2"'} api={{ patch }} />);
    const input = screen.getByLabelText("对方呼号");
    fireEvent.change(input, { target: { value: "bg4yyy/p" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(patch).toHaveBeenCalledWith(10, expect.objectContaining({ call: "BG4YYY/P" }), 'W/"qso-10-2"');
  });
});
