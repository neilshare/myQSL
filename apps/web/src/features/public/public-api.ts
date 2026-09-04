import { API_PATHS } from "@eqsr/domain";

export interface PublicCardLookupItem {
  public_id: string;
  call: string;
  qso_date: string;
  image_url: string | null;
}

export interface PublicCardDetail {
  public_id: string;
  status: "published";
  image_url: string | null;
  qso: {
    call: string;
    station_callsign: string;
    qso_date: string;
    time_on: string;
    band: string;
    mode: string;
    rst_sent: string | null;
    rst_rcvd: string | null;
  };
}

export async function lookupCards(call: string, qsoDate: string): Promise<PublicCardLookupItem[]> {
  const res = await fetch(API_PATHS.publicLookup, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call: call.trim().toUpperCase(), qso_date: qsoDate.trim() })
  });
  if (!res.ok) {
    const errorData = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(errorData.detail ?? "查询失败，请检查呼号与日期格式");
  }
  const json = (await res.json()) as { data: PublicCardLookupItem[] };
  return json.data;
}

export async function getPublicCard(publicId: string): Promise<PublicCardDetail> {
  const res = await fetch(`/api/v1/public/cards/${encodeURIComponent(publicId)}`, {
    headers: { Accept: "application/json" }
  });
  if (res.status === 410) {
    throw new Error("该 QSL 卡片已作废 (Voided)");
  }
  if (!res.ok) {
    throw new Error("未找到已发布的 QSL 卡片");
  }
  return res.json() as Promise<PublicCardDetail>;
}
