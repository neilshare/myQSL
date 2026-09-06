export class BinaryPacketError extends Error {}

export class BinaryReader {
  private readonly view: DataView;
  private offset = 0;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  get remaining(): number { return this.view.byteLength - this.offset; }
  get position(): number { return this.offset; }

  private need(size: number): void {
    if (size < 0 || this.remaining < size) throw new BinaryPacketError(`Truncated packet at ${this.offset}, need ${size} bytes`);
  }

  u8(): number { this.need(1); return this.view.getUint8(this.offset++); }
  u32(): number { this.need(4); const value = this.view.getUint32(this.offset, false); this.offset += 4; return value; }
  u64(): bigint { this.need(8); const value = this.view.getBigUint64(this.offset, false); this.offset += 8; return value; }
  i64(): bigint { this.need(8); const value = this.view.getBigInt64(this.offset, false); this.offset += 8; return value; }
  i32(): number { this.need(4); const value = this.view.getInt32(this.offset, false); this.offset += 4; return value; }
  f64(): number { this.need(8); const value = this.view.getFloat64(this.offset, false); this.offset += 8; return value; }
  bool(): boolean { return this.u8() !== 0; }

  bytes(): Uint8Array | null {
    const length = this.u32();
    if (length === 0xffffffff) return null;
    if (length > 64 * 1024 || length > this.remaining) throw new BinaryPacketError(`Invalid byte-array length ${length}`);
    this.need(length);
    const result = new Uint8Array(this.view.buffer, this.view.byteOffset + this.offset, length).slice();
    this.offset += length;
    return result;
  }

  utf8(): string | null {
    const bytes = this.bytes();
    return bytes === null ? null : new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  }

  qDateTime(): Date {
    const julianDay = this.i64();
    const milliseconds = this.i64();
    const timeSpec = this.u8();
    if (timeSpec === 0 || timeSpec === 3) throw new BinaryPacketError("Local/timezone QDateTime is not supported; UTC or offset required");
    let offsetSeconds = 0;
    if (timeSpec === 2) offsetSeconds = this.i32();
    if (milliseconds < 0 || milliseconds >= 86_400_000) throw new BinaryPacketError("Invalid QDateTime milliseconds");
    const unix = (julianDay - 2_440_588n) * 86_400_000n + milliseconds - BigInt(offsetSeconds) * 1000n;
    const value = Number(unix);
    const date = new Date(value);
    if (!Number.isSafeInteger(value) || Number.isNaN(date.getTime())) throw new BinaryPacketError("Invalid QDateTime value");
    return date;
  }

}

export function encodeByteArray(value: string | null): Uint8Array {
  const data = value === null ? null : new TextEncoder().encode(value);
  const result = new Uint8Array(4 + (data?.byteLength ?? 0));
  new DataView(result.buffer).setUint32(0, data === null ? 0xffffffff : data.byteLength, false);
  if (data) result.set(data, 4);
  return result;
}
