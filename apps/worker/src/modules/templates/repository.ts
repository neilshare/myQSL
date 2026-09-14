export interface TemplateRow { id: number; name: string; schema_version: number; base_width: number; base_height: number; layout_json: string; background_r2_key: string | null; background_sha256: string | null; version: number; created_at: number; updated_at: number; }
export interface TemplateAssetRow { id: string; template_id: number; r2_key: string; sha256: string; mime: string; width: number; height: number; byte_size: number; created_at: number; }
export interface TemplateCreateRequestRow { idempotency_key: string; request_hash: string; template_id: number | null; created_at: number; }

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
  buildUpdateStatement(id: number, version: number, input: { name: string; layoutJson: string; now: number }): D1PreparedStatement {
    const parsed = JSON.parse(input.layoutJson) as { schema_version: number; base_width: number; base_height: number };
    return this.db.prepare("UPDATE card_templates SET name = ?, schema_version = ?, base_width = ?, base_height = ?, layout_json = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?").bind(input.name, parsed.schema_version, parsed.base_width, parsed.base_height, input.layoutJson, input.now, id, version);
  }
  async update(id: number, version: number, input: { name: string; layoutJson: string; now: number }): Promise<TemplateRow | null> {
    const result = await this.buildUpdateStatement(id, version, input).run();
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

  async getAsset(templateId: number, assetId: string): Promise<TemplateAssetRow | null> {
    return this.db.prepare("SELECT * FROM template_assets WHERE template_id = ? AND id = ?").bind(templateId, assetId).first<TemplateAssetRow>();
  }

  async getAssetByHash(templateId: number, sha256: string): Promise<TemplateAssetRow | null> {
    return this.db.prepare("SELECT * FROM template_assets WHERE template_id = ? AND sha256 = ?").bind(templateId, sha256).first<TemplateAssetRow>();
  }

  async insertAsset(input: Omit<TemplateAssetRow, "created_at"> & { created_at: number }): Promise<TemplateAssetRow> {
    await this.db.prepare(
      "INSERT OR IGNORE INTO template_assets(id,template_id,r2_key,sha256,mime,width,height,byte_size,created_at) VALUES(?,?,?,?,?,?,?,?,?)"
    ).bind(input.id, input.template_id, input.r2_key, input.sha256, input.mime, input.width, input.height, input.byte_size, input.created_at).run();
    const row = await this.getAsset(input.template_id, input.id);
    if (row) return row;
    const existing = await this.getAssetByHash(input.template_id, input.sha256);
    if (!existing) throw new Error("Asset insert returned no row");
    return existing;
  }

  async getCreateRequest(key: string): Promise<TemplateCreateRequestRow | null> {
    return this.db.prepare("SELECT * FROM template_create_requests WHERE idempotency_key = ?").bind(key).first<TemplateCreateRequestRow>();
  }

  async reserveCreateRequest(key: string, requestHash: string, now: number): Promise<{ row: TemplateCreateRequestRow; inserted: boolean }> {
    const result = await this.db.prepare("INSERT OR IGNORE INTO template_create_requests(idempotency_key,request_hash,template_id,created_at) VALUES(?,?,NULL,?)").bind(key, requestHash, now).run();
    const row = await this.getCreateRequest(key);
    if (!row) throw new Error("Idempotency reservation failed");
    return { row, inserted: result.meta.changes > 0 };
  }

  async completeCreateRequest(key: string, templateId: number): Promise<void> {
    await this.db.prepare("UPDATE template_create_requests SET template_id = ? WHERE idempotency_key = ? AND template_id IS NULL").bind(templateId, key).run();
  }

  async releaseCreateRequest(key: string): Promise<void> {
    await this.db.prepare("DELETE FROM template_create_requests WHERE idempotency_key = ? AND template_id IS NULL").bind(key).run();
  }

  async assetsBelongToTemplate(templateId: number, assetIds: string[]): Promise<boolean> {
    if (assetIds.length === 0) return true;
    const placeholders = assetIds.map(() => "?").join(",");
    const result = await this.db.prepare(`SELECT COUNT(*) AS count FROM template_assets WHERE template_id = ? AND id IN (${placeholders})`).bind(templateId, ...assetIds).first<{ count: number }>();
    return Number(result?.count ?? 0) === new Set(assetIds).size;
  }

  buildDeleteTemplateAssetRefs(templateId: number): D1PreparedStatement {
    return this.db.prepare("DELETE FROM template_asset_refs WHERE owner_kind = 'template' AND owner_id = ?").bind(String(templateId));
  }

  buildInsertTemplateAssetRef(templateId: number, assetId: string, now: number): D1PreparedStatement {
    return this.db.prepare("INSERT INTO template_asset_refs(owner_kind,owner_id,asset_id,created_at) VALUES('template',?,?,?) ON CONFLICT DO NOTHING").bind(String(templateId), assetId, now);
  }
}
