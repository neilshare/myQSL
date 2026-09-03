import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

describe("0001_core migration", () => {
  it("creates every v1 table and enforces QSO dedupe", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    expect(tables.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "app_settings",
        "audit_events",
        "backup_runs",
        "card_templates",
        "import_chunks",
        "import_jobs",
        "qsl_cards",
        "qsos",
        "stations"
      ])
    );
  });

  it("enforces the dedupe key and duplicate ordinal uniqueness", async () => {
    await env.DB.exec(
      "INSERT INTO stations (callsign, is_default, created_at, updated_at) VALUES ('BA4RC', 1, 1, 1)"
    );
    const station = await env.DB.prepare("SELECT id FROM stations LIMIT 1").first<{ id: number }>();
    const values = {
      station_id: station?.id,
      station_callsign: "BA4RC",
      call: "BG4YYY",
      qso_date: "20260903",
      time_on: "143000",
      qso_at: 1,
      band: "40M",
      mode: "SSB",
      dedupe_key: "duplicate-test",
      duplicate_ordinal: 0,
      created_at: 1,
      updated_at: 1
    };
    await env.DB.prepare(
      `INSERT INTO qsos (station_id, station_callsign, call, qso_date, time_on, qso_at, band, mode,
       dedupe_key, duplicate_ordinal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        values.station_id,
        values.station_callsign,
        values.call,
        values.qso_date,
        values.time_on,
        values.qso_at,
        values.band,
        values.mode,
        values.dedupe_key,
        values.duplicate_ordinal,
        values.created_at,
        values.updated_at
      )
      .run();
    await expect(
      env.DB.prepare(
        `INSERT INTO qsos (station_id, station_callsign, call, qso_date, time_on, qso_at, band, mode,
         dedupe_key, duplicate_ordinal, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          values.station_id,
          values.station_callsign,
          values.call,
          values.qso_date,
          values.time_on,
          values.qso_at,
          values.band,
          values.mode,
          values.dedupe_key,
          values.duplicate_ordinal,
          values.created_at,
          values.updated_at
        )
        .run()
    ).rejects.toThrow();
  });
});
