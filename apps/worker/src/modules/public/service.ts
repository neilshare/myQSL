import { CardRepository, type CardRow } from "../cards/repository";

export interface PublicCardProjection { public_id: string; status: "published"; image_url: string | null; qso: { call: string; station_callsign: string; qso_date: string; time_on: string; band: string; mode: string; rst_sent: string | null; rst_rcvd: string | null } }
export class PublicCardService {
  constructor(private readonly cards: CardRepository, private readonly origin = "") {}
  get(publicId: string): Promise<PublicCardProjection | null> { return this.cards.getPublic(publicId).then((row) => row && row.status === "published" ? this.project(row) : null); }
  getRaw(publicId: string): Promise<CardRow | null> { return this.cards.getPublic(publicId); }
  async lookup(call: string, qsoDate: string): Promise<Array<{ public_id: string; call: string; qso_date: string; image_url: string | null }>> { const rows = await this.cards.lookup(call, qsoDate); return rows.map((row) => { const qso = JSON.parse(row.qso_snapshot_json) as PublicCardProjection["qso"]; return { public_id: row.public_id, call: qso.call, qso_date: qso.qso_date, image_url: row.image_r2_key ? `${this.origin}/api/v1/public/cards/${row.public_id}/image` : null }; }); }
  private project(row: CardRow): PublicCardProjection { const qso = JSON.parse(row.qso_snapshot_json) as PublicCardProjection["qso"]; return { public_id: row.public_id, status: "published", image_url: row.image_r2_key ? `${this.origin}/api/v1/public/cards/${row.public_id}/image` : null, qso: { call: qso.call, station_callsign: qso.station_callsign, qso_date: qso.qso_date, time_on: qso.time_on, band: qso.band, mode: qso.mode, rst_sent: qso.rst_sent ?? null, rst_rcvd: qso.rst_rcvd ?? null } }; }
}
