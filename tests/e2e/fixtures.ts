import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";
import type { CardTemplate, QsoInput, StationInput } from "@myqsl/domain";

export const TEST_OWNER_HEADERS = {
  "X-MYQSL-Test-Actor": "e2e-owner",
  "X-EQSR-Test-Actor": "e2e-owner",
  "Authorization": "Bearer local-e2e-owner",
  "X-MYQSL-Request": "1",
  "X-EQSR-Request": "1",
  "Origin": "http://127.0.0.1:8787"
};

export const SAMPLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

export const SAMPLE_ADIF_CONTENT = `myQSL Lossless ADIF Export/Import Test
<ADIF_VER:5>3.1.4
<PROGRAMID:5>myQSL
<EOH>
<CALL:6>VR2E2E
<STATION_CALLSIGN:6>BI1ABC
<QSO_DATE:8>20260904
<TIME_ON:6>112233
<BAND:3>20M
<MODE:3>SSB
<RST_SENT:2>59
<RST_RCVD:2>59
<APP_EQSR_CUSTOM:11>HELLO_WORLD
<SPECIAL_FEATURE:8>LOSSLESS
<EOR>
`;

export const test = base.extend<{
  authedPage: Page;
  authedRequest: APIRequestContext;
}>({
  authedPage: async ({ page }, use) => {
    await page.setExtraHTTPHeaders(TEST_OWNER_HEADERS);
    await use(page);
  },
  authedRequest: async ({ playwright }, use) => {
    const context = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:8787",
      extraHTTPHeaders: TEST_OWNER_HEADERS
    });
    await use(context);
    await context.dispose();
  }
});

export async function createTestStation(
  request: APIRequestContext,
  overrides: Partial<StationInput> = {}
): Promise<{ id: number; callsign: string; version: number }> {
  const payload: StationInput = {
    callsign: "BI1ABC",
    operator_callsign: "BI1ABC",
    grid_square: "OM89xx",
    is_default: true,
    ...overrides
  };
  const res = await request.post("/api/v1/stations", { data: payload });
  if (!res.ok()) {
    throw new Error(`Failed to create station: ${res.status()} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: { id: number; callsign: string; version: number } };
  return json.data ?? (json as any);
}

export async function createTestQso(
  request: APIRequestContext,
  overrides: Partial<QsoInput> = {}
): Promise<{ id: number; call: string; version: number; station_callsign: string; qso_date: string; time_on: string }> {
  const randomSuffix = Math.floor(Math.random() * 8999 + 1000).toString();
  const hour = Math.floor(Math.random() * 23).toString().padStart(2, "0");
  const min = Math.floor(Math.random() * 59).toString().padStart(2, "0");
  const sec = Math.floor(Math.random() * 59).toString().padStart(2, "0");
  const payload: QsoInput = {
    station_callsign: "BI1ABC",
    call: `BG${randomSuffix}Q`,
    qso_date: "20260904",
    time_on: `${hour}${min}${sec}`,
    band: "20M",
    mode: "SSB",
    ...overrides
  };
  const res = await request.post("/api/v1/qsos", { data: payload });
  if (!res.ok()) {
    throw new Error(`Failed to create QSO: ${res.status()} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: any };
  return json.data ?? json;
}

export async function createTestTemplate(
  request: APIRequestContext,
  name = "E2E 测试模板",
  layoutOverrides: Partial<CardTemplate> = {}
): Promise<{ id: number; name: string }> {
  const layout: CardTemplate = {
    schema_version: 1,
    base_width: 1264,
    base_height: 848,
    elements: [
      {
        type: "text",
        x: 0.1,
        y: 0.2,
        field: "station_callsign",
        font: "sans-serif",
        font_size: 48,
        color: "#FFFFFF",
        align: "left"
      },
      {
        type: "text",
        x: 0.5,
        y: 0.5,
        field: "call",
        font: "sans-serif",
        font_size: 36,
        color: "#FFFFFF",
        align: "center"
      },
      {
        type: "text",
        x: 0.1,
        y: 0.8,
        field: "qso_date",
        font: "sans-serif",
        font_size: 24,
        color: "#FFFFFF",
        align: "left"
      }
    ],
    ...layoutOverrides
  };

  const res = await request.post("/api/v1/card-templates", {
    data: { name, layout }
  });
  if (!res.ok()) {
    throw new Error(`Failed to create template: ${res.status()} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: any };
  return json.data ?? json;
}

export async function uploadTestBackground(
  request: APIRequestContext,
  templateId: number,
  pngBuffer = SAMPLE_PNG
): Promise<{ key: string; etag: string }> {
  const res = await request.post(`/api/v1/card-templates/${templateId}/background`, {
    headers: { "Content-Type": "image/png" },
    data: pngBuffer
  });
  if (!res.ok()) {
    throw new Error(`Failed to upload background: ${res.status()} ${await res.text()}`);
  }
  const json = (await res.json()) as { data?: any };
  return json.data ?? json;
}

export { expect };
