import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ImportPage } from "./ImportPage";
import * as importController from "./import-controller";

describe("ImportPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("displays progress and 4-bucket breakdown during and after import", async () => {
    vi.spyOn(importController, "runImport").mockImplementation(async (_file, _api, options) => {
      options?.onProgress?.({
        currentChunk: 1,
        totalChunks: 2,
        processedRecords: 40,
        totalRecords: 50,
        counts: { ready: 35, warning: 3, duplicate: 2, rejected: 0 }
      });

      return {
        job_id: "test-job-1",
        total: 50,
        chunks: 2,
        counts: { ready: 45, warning: 3, duplicate: 2, rejected: 0 }
      };
    });

    render(<ImportPage />);
    expect(screen.getByText("请选择 ADIF 文件")).toBeTruthy();

    const file = new File(["<CALL:6>BG4YYY<EOR>"], "test.adi", { type: "text/plain" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (!input) throw new Error("File input not found");

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/导入成功！共处理 50 条通联记录/)).toBeTruthy();
    });

    expect(screen.getByText("就绪入库 (Ready)")).toBeTruthy();
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.getByText("软重复警告 (Warning)")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("精确重复跳过 (Duplicate)")).toBeTruthy();
    expect(screen.getByText("2")).toBeTruthy();
    expect(screen.getByText("格式校验拒绝 (Rejected)")).toBeTruthy();
  });

  it("cancels import when cancel button is clicked", async () => {
    let abortSignalObserved: AbortSignal | undefined;

    vi.spyOn(importController, "runImport").mockImplementation(async (_file, _api, options) => {
      abortSignalObserved = options?.signal;
      options?.onProgress?.({
        currentChunk: 1,
        totalChunks: 5,
        processedRecords: 40,
        totalRecords: 200,
        counts: { ready: 40, warning: 0, duplicate: 0, rejected: 0 }
      });

      return new Promise((_, reject) => {
        options?.signal?.addEventListener("abort", () => {
          reject(new Error("Import aborted by user"));
        });
      });
    });

    render(<ImportPage />);
    const file = new File(["dummy"], "test.adi", { type: "text/plain" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    const cancelBtn = await screen.findByRole("button", { name: "取消导入" });
    expect(cancelBtn).toBeTruthy();

    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(abortSignalObserved?.aborted).toBe(true);
      expect(screen.getByText("导入已取消")).toBeTruthy();
    });
  });
});
