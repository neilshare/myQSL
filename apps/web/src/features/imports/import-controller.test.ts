import { describe, expect, it } from "vitest";
import { runImport } from "./import-controller";

describe("runImport", () => {
  it("resumes import from the first missing chunk with concurrency two", async () => {
    const records = Array.from({ length: 121 }, (_, index) => ({ CALL: `BG${String(index).padStart(4, "0")}`, QSO_DATE: "20260903", TIME_ON: "143000", STATION_CALLSIGN: "BA4RC", BAND: "40M", MODE: "SSB" }));
    const uploadedChunkIndexes: number[] = [];
    const fakeApi = {
      createJob: async () => ({ id: "job-1" }),
      uploadChunk: async (_jobId: string, command: { chunk_index: number }) => { uploadedChunkIndexes.push(command.chunk_index); return {}; }
    };
    const file = { name: "log.adi", text: async () => records.map((record) => `<CALL:6>${record.CALL}<QSO_DATE:8>${record.QSO_DATE}<TIME_ON:6>${record.TIME_ON}<STATION_CALLSIGN:5>${record.STATION_CALLSIGN}<BAND:3>${record.BAND}<MODE:3>${record.MODE}<EOR>`).join("") } as unknown as File;
    const result = await runImport(file, fakeApi, { chunkSize: 40, concurrency: 2, session: false });
    expect(uploadedChunkIndexes).toEqual([0, 1, 2, 3]);
    expect(result.total).toBe(121);
  });
});
