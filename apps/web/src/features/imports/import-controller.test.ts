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

  it("skips already confirmed chunks when resuming from session", async () => {
    const records = Array.from({ length: 80 }, (_, index) => ({
      CALL: `BG${String(index).padStart(4, "0")}`,
      QSO_DATE: "20260903",
      TIME_ON: "143000",
      STATION_CALLSIGN: "BA4RC",
      BAND: "40M",
      MODE: "SSB",
      IOTA: "AS-136"
    }));

    const fileContent = records
      .map(
        (record) =>
          `<CALL:6>${record.CALL}<QSO_DATE:8>${record.QSO_DATE}<TIME_ON:6>${record.TIME_ON}<STATION_CALLSIGN:5>${record.STATION_CALLSIGN}<BAND:3>${record.BAND}<MODE:3>${record.MODE}<IOTA:6>${record.IOTA}<EOR>`
      )
      .join("");

    const file = { name: "log.adi", text: async () => fileContent } as unknown as File;

    // Simulate pre-existing session in sessionStorage
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(fileContent));
    const fileSha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem("myqsl-import", JSON.stringify({ job_id: "resumed-job-123", file_sha256: fileSha }));

    const uploadedChunkIndexes: number[] = [];
    let completeJobCalledWith: string | null = null;

    const fakeApi = {
      createJob: async () => {
        throw new Error("Should not call createJob when resuming");
      },
      getJob: async (jobId: string) => ({
        id: jobId,
        file_name: "log.adi",
        file_sha256: fileSha,
        total_records: 80,
        chunk_size: 40,
        protocol_version: 1,
        status: "running" as const,
        counts: { accepted: 40, warning: 0, duplicate: 0, rejected: 0, processed: 40 },
        confirmed_chunks: [{ chunk_index: 0, checksum: "fake-cs-0", records_count: 40 }],
        created_at: 1,
        updated_at: 1,
        completed_at: null
      }),
      uploadChunk: async (_jobId: string, cmd: { chunk_index: number }) => {
        uploadedChunkIndexes.push(cmd.chunk_index);
        return {};
      },
      completeJob: async (jobId: string) => {
        completeJobCalledWith = jobId;
        return { status: "completed" };
      }
    };

    const result = await runImport(file, fakeApi, { chunkSize: 40, concurrency: 1, session: true });
    // Chunk 0 was already confirmed, so only chunk 1 was uploaded!
    expect(uploadedChunkIndexes).toEqual([1]);
    expect(result.job_id).toBe("resumed-job-123");
    expect(completeJobCalledWith).toBe("resumed-job-123");
  });

  it("aborts when signal is aborted and does not call completeJob", async () => {
    const records = Array.from({ length: 80 }, (_, index) => ({
      CALL: `BG${String(index).padStart(4, "0")}`,
      QSO_DATE: "20260903",
      TIME_ON: "143000",
      STATION_CALLSIGN: "BA4RC",
      BAND: "40M",
      MODE: "SSB",
      IOTA: "AS-136"
    }));

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

    const controller = new AbortController();
    let completeCalled = false;
    let uploadedCount = 0;

    const fakeApi = {
      createJob: async () => ({ id: "abort-job" }),
      uploadChunk: async () => {
        uploadedCount++;
        controller.abort(); // abort after first chunk
        return {};
      },
      completeJob: async () => {
        completeCalled = true;
      }
    };

    await expect(runImport(file, fakeApi, { chunkSize: 40, concurrency: 1, signal: controller.signal, session: false })).rejects.toThrow(/aborted/i);
    expect(uploadedCount).toBe(1);
    expect(completeCalled).toBe(false);
  });
});

