export interface ImmutablePutResult {
  key: string;
  etag: string;
  created: boolean;
  size?: number;
}

export class MediaStore {
  constructor(private readonly bucket: R2Bucket) {}

  async putImmutable(
    key: string,
    body: ReadableStream | ArrayBuffer | ArrayBufferView | Blob | string,
    contentType = "application/octet-stream"
  ): Promise<ImmutablePutResult> {
    const existing = await this.bucket.head(key);
    if (existing) {
      return { key, etag: existing.etag, created: false, size: existing.size };
    }

    const object = await this.bucket.put(key, body, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" }
    });
    if (object) return { key, etag: object.etag, created: true, size: object.size };

    const raced = await this.bucket.head(key);
    if (!raced) throw new Error(`R2 immutable write did not produce ${key}`);
    return { key, etag: raced.etag, created: false, size: raced.size };
  }
}
