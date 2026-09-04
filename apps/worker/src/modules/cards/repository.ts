export interface CardRow {
  id: string;
  qso_id: number;
  template_id: number;
  public_id: string;
  status: "draft" | "ready" | "published" | "void";
  qso_snapshot_json: string;
  template_snapshot_json: string;
  render_version: string;
  image_r2_key: string | null;
  content_sha256: string | null;
  lookup_call?: string | null;
  lookup_qso_date?: string | null;
  published_at: number | null;
  voided_at: number | null;
  created_at: number;
  updated_at: number;
}

export class CardRepository {
  constructor(private readonly db: D1Database) {}
  async create(input: {
    id: string;
    qsoId: number;
    templateId: number;
    publicId: string;
    qsoSnapshot: string;
    templateSnapshot: string;
    lookupCall?: string | null;
    lookupQsoDate?: string | null;
    now: number;
  }): Promise<CardRow> {
    await this.db
      .prepare(
        "INSERT INTO qsl_cards (id, qso_id, template_id, public_id, status, qso_snapshot_json, template_snapshot_json, render_version, lookup_call, lookup_qso_date, created_at, updated_at) VALUES (?, ?, ?, ?, 'draft', ?, ?, 'canvas-v1', ?, ?, ?, ?)"
      )
      .bind(
        input.id,
        input.qsoId,
        input.templateId,
        input.publicId,
        input.qsoSnapshot,
        input.templateSnapshot,
        input.lookupCall ?? null,
        input.lookupQsoDate ?? null,
        input.now,
        input.now
      )
      .run();
    return this.get(input.id) as Promise<CardRow>;
  }
  get(id: string): Promise<CardRow | null> {
    return this.db.prepare("SELECT * FROM qsl_cards WHERE id = ?").bind(id).first<CardRow>();
  }
  getPublic(publicId: string): Promise<CardRow | null> {
    return this.db.prepare("SELECT * FROM qsl_cards WHERE public_id = ?").bind(publicId).first<CardRow>();
  }
  async attach(id: string, key: string, hash: string, now: number): Promise<CardRow | null> {
    const result = await this.db
      .prepare("UPDATE qsl_cards SET status = 'ready', image_r2_key = ?, content_sha256 = ?, updated_at = ? WHERE id = ? AND status = 'draft'")
      .bind(key, hash, now, id)
      .run();
    if (!result.meta.changes) return this.get(id);
    return this.get(id);
  }
  async publish(id: string, now: number): Promise<CardRow | null> {
    const result = await this.db
      .prepare("UPDATE qsl_cards SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND status = 'ready'")
      .bind(now, now, id)
      .run();
    if (!result.meta.changes) return this.get(id);
    return this.get(id);
  }
  async void(id: string, now: number): Promise<CardRow | null> {
    const result = await this.db
      .prepare("UPDATE qsl_cards SET status = 'void', voided_at = ?, updated_at = ? WHERE id = ? AND status = 'published'")
      .bind(now, now, id)
      .run();
    if (!result.meta.changes) return null;
    return this.get(id);
  }
  async lookup(call: string, qsoDate: string): Promise<CardRow[]> {
    const result = await this.db
      .prepare("SELECT * FROM qsl_cards WHERE status = 'published' AND lookup_call = ? AND lookup_qso_date = ? ORDER BY published_at DESC")
      .bind(call, qsoDate)
      .all<CardRow>();
    return result.results;
  }
  async list(cursor?: { created_at: number; id: string }, limit = 50): Promise<CardRow[]> {
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (cursor) {
      clauses.push("(created_at < ? OR (created_at = ? AND id < ?))");
      params.push(cursor.created_at, cursor.created_at, cursor.id);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.db
      .prepare(`SELECT * FROM qsl_cards ${where} ORDER BY created_at DESC, id DESC LIMIT ?`)
      .bind(...params, limit)
      .all<CardRow>();
    return result.results;
  }
}
