import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const stations = sqliteTable(
  "stations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    callsign: text("callsign").notNull(),
    stationCallsign: text("station_callsign"),
    operatorCallsign: text("operator_callsign"),
    gridSquare: text("grid_square"),
    qth: text("qth"),
    rig: text("rig"),
    antenna: text("antenna"),
    powerW: integer("power_w"),
    isDefault: integer("is_default").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull()
  },
  (table) => ({
    defaultIdx: uniqueIndex("uq_stations_one_default").on(table.isDefault).where(sql`is_default = 1`)
  })
);

export const qsos = sqliteTable(
  "qsos",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    stationId: integer("station_id").notNull().references(() => stations.id),
    stationCallsign: text("station_callsign").notNull(),
    call: text("call").notNull(),
    qsoDate: text("qso_date").notNull(),
    timeOn: text("time_on").notNull(),
    qsoAt: integer("qso_at").notNull(),
    band: text("band").notNull(),
    freqHz: integer("freq_hz"),
    mode: text("mode").notNull(),
    submode: text("submode"),
    rstSent: text("rst_sent"),
    rstRcvd: text("rst_rcvd"),
    gridsquare: text("gridsquare"),
    name: text("name"),
    qth: text("qth"),
    comment: text("comment"),
    myGrid: text("my_grid"),
    myRig: text("my_rig"),
    myAntenna: text("my_antenna"),
    myPowerW: integer("my_power_w"),
    adifExtraJson: text("adif_extra_json").notNull().default("{}"),
    dedupeKey: text("dedupe_key").notNull(),
    duplicateOrdinal: integer("duplicate_ordinal").notNull().default(0),
    source: text("source").notNull().default("manual"),
    version: integer("version").notNull().default(1),
    deletedAt: integer("deleted_at"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull()
  },
  (table) => ({
    timeIdx: index("idx_qsos_time").on(table.qsoAt, table.id),
    callDateIdx: index("idx_qsos_call_date").on(table.call, table.qsoDate),
    stationIdx: index("idx_qsos_station").on(table.stationId, table.qsoAt),
    dedupeIdx: uniqueIndex("uq_qsos_dedupe").on(table.dedupeKey, table.duplicateOrdinal)
  })
);

export const importJobs = sqliteTable("import_jobs", {
  id: text("id").primaryKey(),
  fileName: text("file_name").notNull(),
  fileSha256: text("file_sha256").notNull(),
  totalRecords: integer("total_records").notNull(),
  acceptedCount: integer("accepted_count").notNull().default(0),
  warningCount: integer("warning_count").notNull().default(0),
  duplicateCount: integer("duplicate_count").notNull().default(0),
  rejectedCount: integer("rejected_count").notNull().default(0),
  status: text("status").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const importChunks = sqliteTable("import_chunks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: text("job_id").notNull().references(() => importJobs.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  checksum: text("checksum").notNull(),
  resultJson: text("result_json").notNull(),
  createdAt: integer("created_at").notNull()
}, (table) => ({ jobChunkIdx: uniqueIndex("uq_import_chunks_job_chunk").on(table.jobId, table.chunkIndex) }));

export const cardTemplates = sqliteTable("card_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  schemaVersion: integer("schema_version").notNull().default(1),
  baseWidth: integer("base_width").notNull(),
  baseHeight: integer("base_height").notNull(),
  layoutJson: text("layout_json").notNull(),
  backgroundR2Key: text("background_r2_key"),
  backgroundSha256: text("background_sha256"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const qslCards = sqliteTable("qsl_cards", {
  id: text("id").primaryKey(),
  qsoId: integer("qso_id").notNull().references(() => qsos.id),
  templateId: integer("template_id").notNull().references(() => cardTemplates.id),
  publicId: text("public_id").notNull().unique(),
  status: text("status").notNull(),
  qsoSnapshotJson: text("qso_snapshot_json").notNull(),
  templateSnapshotJson: text("template_snapshot_json").notNull(),
  renderVersion: text("render_version").notNull(),
  imageR2Key: text("image_r2_key"),
  contentSha256: text("content_sha256"),
  publishedAt: integer("published_at"),
  voidedAt: integer("voided_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  requestId: text("request_id").notNull(),
  detailJson: text("detail_json").notNull().default("{}"),
  ipHash: text("ip_hash"),
  createdAt: integer("created_at").notNull()
});

export const backupRuns = sqliteTable("backup_runs", {
  id: text("id").primaryKey(),
  workflowInstanceId: text("workflow_instance_id").notNull().unique(),
  exportBookmark: text("export_bookmark"),
  objectKey: text("object_key"),
  r2Etag: text("r2_etag"),
  contentSha256: text("content_sha256"),
  sizeBytes: integer("size_bytes"),
  status: text("status").notNull(),
  errorCode: text("error_code"),
  startedAt: integer("started_at").notNull(),
  finishedAt: integer("finished_at"),
  verifiedAt: integer("verified_at")
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const agentDevices = sqliteTable("agent_devices", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tokenSha256: text("token_sha256").notNull().unique(),
  tokenExpiresAt: integer("token_expires_at").notNull(),
  revokedAt: integer("revoked_at"),
  createdAt: integer("created_at").notNull(),
  lastSeenAt: integer("last_seen_at")
});

export const agentProfiles = sqliteTable("agent_profiles", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => agentDevices.id),
  stationId: integer("station_id").notNull().references(() => stations.id),
  sourceKind: text("source_kind").notNull(),
  sourceInstance: text("source_instance").notNull(),
  expectedStationCallsign: text("expected_station_callsign").notNull(),
  enabled: integer("enabled").notNull().default(1),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull()
});

export const ingestEvents = sqliteTable("ingest_events", {
  id: text("id").primaryKey(),
  deviceId: text("device_id").notNull().references(() => agentDevices.id),
  eventId: text("event_id").notNull(),
  payloadSha256: text("payload_sha256").notNull(),
  profileId: text("profile_id").notNull().references(() => agentProfiles.id),
  sourceKind: text("source_kind").notNull(),
  sourceInstance: text("source_instance").notNull(),
  sourceRecordId: text("source_record_id").notNull(),
  eventKind: text("event_kind").notNull(),
  payloadJson: text("payload_json").notNull(),
  outcome: text("outcome").notNull(),
  qsoId: integer("qso_id").references(() => qsos.id),
  duplicateOf: integer("duplicate_of").references(() => qsos.id),
  issuesJson: text("issues_json").notNull().default("[]"),
  createdAt: integer("created_at").notNull(),
  payloadExpiresAt: integer("payload_expires_at").notNull()
});

export const qsoSourceLinks = sqliteTable("qso_source_links", {
  sourceKind: text("source_kind").notNull(),
  sourceInstance: text("source_instance").notNull(),
  sourceRecordId: text("source_record_id").notNull(),
  qsoId: integer("qso_id").references(() => qsos.id),
  payloadSha256: text("payload_sha256").notNull(),
  lastEventId: text("last_event_id").notNull(),
  tombstonedAt: integer("tombstoned_at"),
  createdAt: integer("created_at").notNull()
});

export const printBatches = sqliteTable("print_batches", {
  id: text("id").primaryKey(), idempotencyKey: text("idempotency_key").notNull().unique(), requestHash: text("request_hash").notNull(), kind: text("kind").notNull(), profileJson: text("profile_json").notNull(), status: text("status").notNull(), rendererVersion: text("renderer_version").notNull(), fontManifestVersion: text("font_manifest_version").notNull(), manifestHash: text("manifest_hash").notNull(), resultHash: text("result_hash"), resultSize: integer("result_size"), pageCount: integer("page_count"), createdAt: integer("created_at").notNull(), expiresAt: integer("expires_at").notNull()
});

export const printBatchItems = sqliteTable("print_batch_items", {
  batchId: text("batch_id").notNull().references(() => printBatches.id), position: integer("position").notNull(), qsoId: integer("qso_id").references(() => qsos.id), cardId: text("card_id").references(() => qslCards.id), snapshotJson: text("snapshot_json").notNull(), snapshotHash: text("snapshot_hash").notNull(), backgroundAssetId: text("background_asset_id"), backgroundSha256: text("background_sha256"), publicUrl: text("public_url"), qrOmitted: integer("qr_omitted").notNull().default(0)
});

export const cardBatches = sqliteTable("card_batches", { id: text("id").primaryKey(), requestKey: text("request_key").notNull().unique(), requestHash: text("request_hash").notNull(), createdAt: integer("created_at").notNull() });
export const cardBatchItems = sqliteTable("card_batch_items", { batchId: text("batch_id").notNull().references(() => cardBatches.id), position: integer("position").notNull(), qsoId: integer("qso_id").notNull().references(() => qsos.id), templateVersion: integer("template_version").notNull(), cardId: text("card_id").references(() => qslCards.id) });

export const deliveryBatches = sqliteTable("delivery_batches", { id: text("id").primaryKey(), requestKey: text("request_key").notNull().unique(), requestHash: text("request_hash").notNull(), status: text("status").notNull(), version: integer("version").notNull().default(1), requestItemsJson: text("request_items_json").notNull(), language: text("language").notNull(), attachmentMode: text("attachment_mode").notNull(), createdAt: integer("created_at").notNull(), readyAt: integer("ready_at"), expiresAt: integer("expires_at"), errorCode: text("error_code") });
export const deliveryBatchItems = sqliteTable("delivery_batch_items", { batchId: text("batch_id").notNull().references(() => deliveryBatches.id), position: integer("position").notNull(), cardId: text("card_id").notNull().references(() => qslCards.id), preparationStatus: text("preparation_status").notNull(), directoryContactId: text("directory_contact_id"), deliveryId: text("delivery_id"), existingDeliveryId: text("existing_delivery_id"), aliasConfirmedAt: integer("alias_confirmed_at"), confirmedResolvedCall: text("confirmed_resolved_call"), errorCode: text("error_code"), updatedAt: integer("updated_at").notNull() });

export const schema = { stations, qsos, importJobs, importChunks, cardTemplates, qslCards, auditEvents, backupRuns, appSettings, agentDevices, agentProfiles, ingestEvents, qsoSourceLinks, printBatches, printBatchItems, cardBatches, cardBatchItems, deliveryBatches, deliveryBatchItems };
