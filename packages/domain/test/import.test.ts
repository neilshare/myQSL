import { describe, expect, it } from "vitest";
import { calculateChunkChecksum, IMPORT_CHUNK_SIZE, IMPORT_PROTOCOL_VERSION } from "../src";

describe("import domain constants and checksum", () => {
  it("exports correct protocol version and chunk size", () => {
    expect(IMPORT_PROTOCOL_VERSION).toBe(1);
    expect(IMPORT_CHUNK_SIZE).toBe(40);
  });

  it("calculates deterministic checksums invariant of key ordering", async () => {
    const chunkA = [
      { call: "BG4YYY", band: "40M", mode: "SSB", sub: { a: 1, b: 2 } },
      { call: "BA4RC", band: "20M", mode: "CW" }
    ];
    const chunkB = [
      { mode: "SSB", call: "BG4YYY", sub: { b: 2, a: 1 }, band: "40M" },
      { band: "20M", mode: "CW", call: "BA4RC" }
    ];

    const hashA = await calculateChunkChecksum(chunkA);
    const hashB = await calculateChunkChecksum(chunkB);

    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes checksum when record data changes", async () => {
    const chunkA = [{ call: "BG4YYY", band: "40M" }];
    const chunkB = [{ call: "BG4YYY", band: "20M" }];

    const hashA = await calculateChunkChecksum(chunkA);
    const hashB = await calculateChunkChecksum(chunkB);

    expect(hashA).not.toBe(hashB);
  });
});
