export interface TemplateRow { id: number; name: string; schema_version: number; base_width: number; base_height: number; layout_json: string; background_r2_key: string | null; background_sha256: string | null; version: number; created_at: number; updated_at: number; }

export class TemplateRepository {
  constructor(private readonly db: D1Database) {}
  async list(): Promise<TemplateRow[]> { const result = await this.db.prepare("SELECT * FROM card_templates ORDER BY id DESC").all<TemplateRow>(); return result.results; }
  async get(id: number): Promise<TemplateRow | null> { return this.db.prepare("SELECT * FROM card_templates WHERE id = ?").bind(id).first<TemplateRow>(); }
  async create(input: { name: string; layoutJson: string; now: number }): Promise<TemplateRow> {
    const parsed = JSON.parse(input.layoutJson) as { schema_version: number; base_width: number; base_height: number };
    await this.db.prepare("INSERT INTO card_templates (name, schema_version, base_width, base_height, layout_json, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)").bind(input.name, parsed.schema_version, parsed.base_width, parsed.base_height, input.layoutJson, input.now, input.now).run();
    const row = await this.db.prepare("SELECT * FROM card_templates WHERE rowid = last_insert_rowid()").first<TemplateRow>();
    if (!row) throw new Error("Template insert returned no row");
    return row;
  }
  async update(id: number, version: number, input: { name: string; layoutJson: string; now: number }): Promise<TemplateRow | null> {
    const parsed = JSON.parse(input.layoutJson) as { schema_version: number; base_width: number; base_height: number };
    const result = await this.db.prepare("UPDATE card_templates SET name = ?, schema_version = ?, base_width = ?, base_height = ?, layout_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(input.name, parsed.schema_version, parsed.base_width, parsed.base_height, input.layoutJson, input.now, id, version).run();
    if (!result.meta.changes) return null;
    return this.get(id);
  }
  async setBackground(id: number, key: string, sha256: string, now: number): Promise<TemplateRow | null> {
    const result = await this.db
      .prepare(
        "UPDATE card_templates SET background_r2_key = ?, background_sha256 = ?, version = version + 1, updated_at = ? WHERE id = ?"
      )
      .bind(key, sha256, now, id)
      .run();
    return result.meta.changes ? this.get(id) : null;
  }
}
