import { test, expect, createTestStation } from "./fixtures";
import { parseAdif } from "@myqsl/adif-codec";

test.describe("ADIF lossless import and export journey", () => {
  test("imports .adi with custom tags, renders in list, exports, and verifies 100% roundtrip fidelity", async ({
    authedPage,
    authedRequest
  }) => {
    // Ensure default station exists
    await createTestStation(authedRequest, { callsign: "BI1ABC" }).catch(() => {});

    // 1. Prepare unique ADIF content with custom fields
    const testCall = `VR${Date.now().toString().slice(-4)}AD`;
    const adifContent = `myQSL Lossless ADIF Roundtrip Test
<ADIF_VER:5>3.1.4
<PROGRAMID:5>myQSL
<EOH>
<CALL:${testCall.length}>${testCall}
<STATION_CALLSIGN:6>BI1ABC
<QSO_DATE:8>20260904
<TIME_ON:6>112233
<BAND:3>40M
<MODE:3>SSB
<RST_SENT:2>59
<RST_RCVD:2>59
<APP_MYQSL_CUSTOM:11>HELLO_WORLD
<MY_CUSTOM_TAG:6>E2ETAG
<EOR>
`;

    // 2. Open import page
    await authedPage.goto("/admin/import");
    await expect(authedPage.getByRole("heading", { name: /ADIF/ })).toBeVisible();

    // 3. Upload ADIF buffer
    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: "lossless-test.adi",
      mimeType: "text/plain",
      buffer: Buffer.from(adifContent, "utf-8")
    });

    // Wait for upload completion message
    await expect(authedPage.getByRole("status")).toContainText(/导入成功/i, { timeout: 15_000 });

    // 4. Verify QSO is present in workbench
    await authedPage.goto("/admin/qsos");
    const qsoArticle = authedPage.locator("article", { hasText: testCall });
    await expect(qsoArticle).toBeVisible();

    // 5. Trigger export and intercept download
    const downloadPromise = authedPage.waitForEvent("download");
    await authedPage.getByRole("button", { name: "导出 ADIF" }).click();
    const download = await downloadPromise;

    // Read exported ADIF text
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    if (stream) {
      for await (const chunk of stream) {
        chunks.push(Buffer.from(chunk));
      }
    }
    const exportedText = Buffer.concat(chunks).toString("utf-8");

    // 6. Verify lossless roundtrip via ADIF parser
    const parsed = parseAdif(exportedText);
    expect(parsed.errors).toHaveLength(0);

    const record = parsed.records.find((r) => r.fields.CALL === testCall);
    expect(record).toBeDefined();
    if (!record) return;

    // Standard fields verification
    expect(record.fields.CALL).toBe(testCall);
    expect(record.fields.STATION_CALLSIGN).toBe("BI1ABC");
    expect(record.fields.QSO_DATE).toBe("20260904");
    expect(record.fields.BAND).toBe("40M");
    expect(record.fields.MODE).toBe("SSB");

    // Custom tags lossless retention verification
    expect(record.fields.APP_MYQSL_CUSTOM).toBe("HELLO_WORLD");
    expect(record.fields.MY_CUSTOM_TAG).toBe("E2ETAG");
  });
});
