import dgram from "node:dgram";
import { hashRadioEvent, type RadioEventV1 } from "@myqsl/domain";
import { decodeDatagram, type N1mmPacket, type WsjtxPacket } from "@myqsl/radio-codec";
import { Outbox } from "./outbox";

export type ReceiverProfile = { profile_id: string; source_kind: "wsjtx" | "n1mm"; source_instance: string; station_callsign: string; bind_address: string; port: number; allowed_peer_ips?: string[] };
export type ReceiverStats = { packets: number; logged: number; ignored: number; parse_errors: number; last_packet_at: number | null; last_error: string | null };

function isoFromQso(qso: { qso_date: string; time_on: string }): string {
  return `${qso.qso_date.slice(0, 4)}-${qso.qso_date.slice(4, 6)}-${qso.qso_date.slice(6, 8)}T${qso.time_on.slice(0, 2)}:${qso.time_on.slice(2, 4)}:${qso.time_on.slice(4, 6)}.000Z`;
}

async function toEvent(profile: ReceiverProfile, packet: WsjtxPacket | N1mmPacket, receivedAt: number): Promise<RadioEventV1 | null> {
  if (packet.kind === "heartbeat" || packet.kind === "ignored") return null;
  const qso = packet.qso;
  const base: Omit<RadioEventV1, "payload_sha256"> = {
    protocol_version: 1,
    event_id: crypto.randomUUID(),
    profile_id: profile.profile_id,
    source_kind: profile.source_kind,
    event_kind: packet.eventKind ?? "qso_logged",
    source_instance: profile.source_instance,
    source_record_id: packet.sourceRecordId ?? `${profile.source_instance}:${receivedAt}`,
    occurred_at: qso ? isoFromQso(qso) : new Date(receivedAt).toISOString(),
    received_at: new Date(receivedAt).toISOString(),
    qso: qso ? {
      station_callsign: qso.station_callsign,
      call: qso.call,
      qso_date: qso.qso_date,
      time_on: qso.time_on,
      band: "band" in qso ? qso.band : "UNKNOWN",
      mode: qso.mode,
      submode: null,
      freq_mhz: "freq_mhz" in qso ? qso.freq_mhz : (qso.freq_hz ? (qso.freq_hz / 1_000_000).toFixed(6) : null),
      rst_sent: qso.rst_sent || null,
      rst_rcvd: qso.rst_rcvd || null,
      gridsquare: "gridsquare" in qso ? qso.gridsquare : null,
      name: qso.name || null,
      qth: "qth" in qso ? qso.qth : null,
      comment: qso.comment || null,
      adif_extra: qso.adif_extra
    } : null,
    extras: {}
  };
  return { ...base, payload_sha256: await hashRadioEvent(base) } as RadioEventV1;
}

export class UdpReceiver {
  private socket: dgram.Socket | null = null;
  private readonly statsValue: ReceiverStats = { packets: 0, logged: 0, ignored: 0, parse_errors: 0, last_packet_at: null, last_error: null };
  constructor(private readonly profile: ReceiverProfile, private readonly outbox: Outbox) {}

  start(): Promise<void> {
    if (this.socket) return Promise.resolve();
    const socket = dgram.createSocket("udp4");
    this.socket = socket;
    return new Promise((resolve, reject) => {
      socket.once("error", reject);
      socket.on("message", (message, remote) => { void this.handle(message, remote.address); });
      socket.bind(this.profile.port, this.profile.bind_address, () => { socket.removeListener("error", reject); resolve(); });
    });
  }

  stop(): Promise<void> {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return Promise.resolve();
    return new Promise((resolve) => socket.close(() => resolve()));
  }

  stats(): ReceiverStats { return { ...this.statsValue }; }

  private async handle(message: Uint8Array, remoteIp: string): Promise<void> {
    if (this.profile.allowed_peer_ips && !this.profile.allowed_peer_ips.includes(remoteIp)) return;
    this.statsValue.packets += 1;
    this.statsValue.last_packet_at = Date.now();
    try {
      const packet = decodeDatagram(message, this.profile.source_kind);
      if (packet.kind === "ignored" || packet.kind === "heartbeat") { this.statsValue.ignored += 1; return; }
      const event = await toEvent(this.profile, packet, this.statsValue.last_packet_at);
      if (!event) return;
      this.outbox.enqueue(event, this.statsValue.last_packet_at);
      this.statsValue.logged += 1;
    } catch (error) {
      this.statsValue.parse_errors += 1;
      this.statsValue.last_error = error instanceof Error ? error.message.slice(0, 240) : "parse error";
    }
  }
}
