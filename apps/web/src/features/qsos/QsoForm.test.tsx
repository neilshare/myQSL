import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QsoForm } from "./QsoForm";

afterEach(() => {
  cleanup();
});

describe("QsoForm", () => {
  it("submits patch payload and the current ETag in edit mode", async () => {
    const patch = vi.fn().mockResolvedValue({});
    render(
      <QsoForm
        initial={{ id: 10, call: "BG4AAA", station_callsign: "BA4RC", qso_date: "20260903", time_on: "143000", band: "40M", mode: "SSB" }}
        etag={'W/"qso-10-2"'}
        api={{ patch }}
      />
    );
    const bandInput = screen.getByPlaceholderText("例如 20M");
    fireEvent.change(bandInput, { target: { value: "20M" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(patch).toHaveBeenCalledWith(10, expect.objectContaining({ band: "20M", mode: "SSB" }), 'W/"qso-10-2"');
  });

  it("submits normalized call in create mode", async () => {
    const create = vi.fn().mockResolvedValue({});
    const patch = vi.fn().mockResolvedValue({});
    render(
      <QsoForm
        initial={{ call: "bg4aaa", station_callsign: "BA4RC", qso_date: "20260903", time_on: "143000", band: "40M", mode: "SSB" }}
        api={{ patch, create }}
      />
    );
    const callInput = screen.getByLabelText("对方呼号");
    fireEvent.change(callInput, { target: { value: "bg4yyy/p" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ call: "BG4YYY/P" }));
  });

  it("automatically populates current UTC date and time when initial values are empty", () => {
    render(
      <QsoForm
        initial={{ call: "", station_callsign: "BI1ABC", qso_date: "", time_on: "", band: "", mode: "" }}
      />
    );
    const dateInput = screen.getByLabelText("UTC 日期") as HTMLInputElement;
    const timeInput = screen.getByLabelText("UTC 时间") as HTMLInputElement;
    expect(dateInput.value).toMatch(/^\d{8}$/);
    expect(timeInput.value).toMatch(/^\d{6}$/);

    const refreshBtn = screen.getByRole("button", { name: /当前 UTC/i });
    expect(refreshBtn).toBeTruthy();
    fireEvent.click(refreshBtn);
    expect(dateInput.value).toMatch(/^\d{8}$/);
    expect(timeInput.value).toMatch(/^\d{6}$/);
  });
});

