import { describe, expect, it } from "vitest";
import { BinaryPacketError, decodeWsjtx, encodeByteArray } from "../src";

function u32(value: number): Uint8Array { const bytes = new Uint8Array(4); new DataView(bytes.buffer).setUint32(0, value, false); return bytes; }
function packet(type: number, payload: Uint8Array[] = []): Uint8Array { const head = [u32(0xadbccbda), u32(3), u32(type), encodeByteArray("WSJT-X")]; const all = [...head, ...payload]; const result = new Uint8Array(all.reduce((sum, item) => sum + item.byteLength, 0)); let offset = 0; for (const item of all) { result.set(item, offset); offset += item.byteLength; } return result; }

describe("WSJT-X binary codec", () => {
  it("decodes heartbeat and Logged ADIF while preserving null values", () => {
    expect(decodeWsjtx(packet(0)).kind).toBe("heartbeat");
    const adif = "<CALL:5>K1ABC<MODE:3>FT8<MY_CALL:5>BA4RC<QSO_DATE:8>20260906<TIME_ON:6>010203<FREQ:6>14.074<EOR>";
    const decoded = decodeWsjtx(packet(12, [encodeByteArray(adif)]));
    expect(decoded.qso?.call).toBe("K1ABC"); expect(decoded.qso?.freq_hz).toBe(14074000); expect(decoded.qso?.qso_date).toBe("20260906");
  });

  it("rejects truncation, invalid magic, unsupported schema and oversized strings", () => {
    expect(() => decodeWsjtx(packet(0).subarray(0, 7))).toThrow(BinaryPacketError);
    const bad = packet(0); bad[0] = 0; expect(() => decodeWsjtx(bad)).toThrow(/magic/i);
    const unsupported = packet(0); new DataView(unsupported.buffer).setUint32(4, 99, false); expect(() => decodeWsjtx(unsupported)).toThrow(/schema/i);
    expect(() => decodeWsjtx(new Uint8Array(64 * 1024 + 1))).toThrow(/64 KiB/i);
  });
});
