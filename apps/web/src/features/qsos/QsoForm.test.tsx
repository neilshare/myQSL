import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QsoForm } from "./QsoForm";
import { FREQ_STORAGE_KEY } from "./frequency-helpers";

const storageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    }
  };
})();

Object.defineProperty(globalThis, "localStorage", {
  value: storageMock,
  writable: true,
  configurable: true
});
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: storageMock,
    writable: true,
    configurable: true
  });
}

beforeEach(() => {
  storageMock.clear();
});

afterEach(() => {
  cleanup();
});

describe("QsoForm", () => {
  it("submits patch payload and the current ETag in edit mode", async () => {
    const patch = vi.fn().mockResolvedValue({});
    render(
      <QsoForm
        initial={{ id: 10, call: "BG4AAA", station_callsign: "BA4RC", qso_date: "20260903", time_on: "143000", band: "40M", freq_mhz: "7.050", mode: "SSB" }}
        etag={'W/"qso-10-2"'}
        api={{ patch }}
      />
    );
    const bandInput = screen.getByLabelText("波段");
    fireEvent.change(bandInput, { target: { value: "20M" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(patch).toHaveBeenCalledWith(
      10,
      expect.objectContaining({ band: "20M", mode: "SSB" }),
      'W/"qso-10-2"'
    );
  });

  it("submits normalized call and frequency in create mode", async () => {
    const create = vi.fn().mockResolvedValue({});
    const patch = vi.fn().mockResolvedValue({});
    render(
      <QsoForm
        initial={{ call: "bg4aaa", station_callsign: "BA4RC", qso_date: "20260903", time_on: "143000", band: "40M", freq_mhz: "7.050", mode: "SSB" }}
        api={{ patch, create }}
      />
    );
    const callInput = screen.getByLabelText("对方呼号");
    fireEvent.change(callInput, { target: { value: "bg4yyy/p" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ call: "BG4YYY/P", freq_mhz: "7.050" })
    );
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

  it("updates frequency automatically when band changes", () => {
    render(
      <QsoForm
        initial={{ call: "", station_callsign: "BI1ABC", qso_date: "", time_on: "", band: "", mode: "" }}
      />
    );
    const bandInput = screen.getByLabelText("波段") as HTMLInputElement;
    const freqInput = screen.getByLabelText("频率 (MHz)") as HTMLInputElement;

    // Change band to 70CM -> should set freq to 438.500
    fireEvent.change(bandInput, { target: { value: "70CM" } });
    expect(freqInput.value).toBe("438.500");

    // Change band to 20M -> should set freq to 14.270
    fireEvent.change(bandInput, { target: { value: "20M" } });
    expect(freqInput.value).toBe("14.270");

    // Change band to 40M -> should set freq to 7.050
    fireEvent.change(bandInput, { target: { value: "40M" } });
    expect(freqInput.value).toBe("7.050");
  });

  it("updates band automatically when frequency changes", () => {
    render(
      <QsoForm
        initial={{ call: "", station_callsign: "BI1ABC", qso_date: "", time_on: "", band: "", mode: "" }}
      />
    );
    const bandInput = screen.getByLabelText("波段") as HTMLInputElement;
    const freqInput = screen.getByLabelText("频率 (MHz)") as HTMLInputElement;

    // Type 439.750 -> band should automatically become 70CM
    fireEvent.change(freqInput, { target: { value: "439.750" } });
    expect(bandInput.value).toBe("70CM");

    // Type 14.270 -> band should automatically become 20M
    fireEvent.change(freqInput, { target: { value: "14.270" } });
    expect(bandInput.value).toBe("20M");

    // Type 145.000 -> band should automatically become 2M
    fireEvent.change(freqInput, { target: { value: "145.000" } });
    expect(bandInput.value).toBe("2M");
  });

  it("supports quick selection from dropdown and saves to history on submit", async () => {
    const create = vi.fn().mockResolvedValue({});
    render(
      <QsoForm
        initial={{ call: "BG1XYZ", station_callsign: "BA4RC", qso_date: "20260905", time_on: "120000", band: "", mode: "FM" }}
        api={{ patch: vi.fn(), create }}
      />
    );

    const select = screen.getByLabelText("选择常用/历史频率") as HTMLSelectElement;
    const freqInput = screen.getByLabelText("频率 (MHz)") as HTMLInputElement;
    const bandInput = screen.getByLabelText("波段") as HTMLInputElement;

    // Select 439.460 from dropdown
    fireEvent.change(select, { target: { value: "439.460" } });
    expect(freqInput.value).toBe("439.460");
    expect(bandInput.value).toBe("70CM");

    // Enter a custom frequency not in top 10
    fireEvent.change(freqInput, { target: { value: "438.125" } });
    expect(bandInput.value).toBe("70CM");

    // Submit form
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ freq_mhz: "438.125", band: "70CM" })
    );

    // Verify localStorage has saved 438.125
    const stored = JSON.parse(storageMock.getItem(FREQ_STORAGE_KEY) || "[]");
    expect(stored).toContain("438.125");
  });
});

