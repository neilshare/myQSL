import { describe, expect, it } from "vitest";
import { runImport } from "./import-controller";

describe("runImport", () => {
  it("resumes import from the first missing chunk with concurrency two and calls completeJob", async () => {
    const records = Array.from({ length: 121 }, (_, index) => ({
      CALL: `BG${String(index).padStart(4, "0")}`,
      QSO_DATE: "20260903",
      TIME_ON: "143000",
      STATION_CALLSIGN: "BA4RC",
      BAND: "40M",
      MODE: "SSB",
      IOTA: "AS-136"
    }));
    const uploadedChunkIndexes: number[] = [];
    let completedJobId: string | null = null;
    const uploadedRecords: any[] = [];

    const fakeApi = {
      createJob: async () => ({ id: "job-1" }),
      uploadChunk: async (_jobId: string, command: { chunk_index: number; records: any[] }) => {
        uploadedChunkIndexes.push(command.chunk_index);
        uploadedRecords.push(...command.records);
        return {};
      },
      completeJob: async (jobId: string) => {
        completedJobId = jobId;
        return { status: "completed" };
      }
    };
    const file = {
      name: "log.adi",
      text: async () =>
        records
          .map(
            (record) =>
              `<CALL:6>${record.CALL}<QSO_DATE:8>${record.QSO_DATE}<TIME_ON:6>${record.TIME_ON}<STATION_CALLSIGN:5>${record.STATION_CALLSIGN}<BAND:3>${record.BAND}<MODE:3>${record.MODE}<IOTA:6>${record.IOTA}<EOR>`
          )
          .join("")
    } as unknown as File;

    const result = await runImport(file, fakeApi, { chunkSize: 40, concurrency: 2, session: false });
    expect(uploadedChunkIndexes).toEqual([0, 1, 2, 3]);
    expect(result.total).toBe(121);
    expect(completedJobId).toBe("job-1");

    // Verify adif_extra was preserved in uploaded records
    expect(uploadedRecords[0].adif_extra).toEqual({ IOTA: "AS-136" });
  });

  it("rejects file with non-ASCII content and prevents job creation", async () => {
    let created = false;
    const fakeApi = {
      createJob: async () => {
        created = true;
        return { id: "job-bad" };
      },
      uploadChunk: async () => ({})
    };
    const badFile = {
      name: "bad.adi",
      text: async () => "<CALL:6>BG4YYY<COMMENT:2>测试<EOR>"
    } as unknown as File;

    await expect(runImport(badFile, fakeApi, { session: false })).rejects.toThrow(/NON_ASCII_ADI|Non-ASCII/i);
    expect(created).toBe(false);
  });
});
