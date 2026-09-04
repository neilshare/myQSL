import React, { useState } from "react";
import { lookupCards, type PublicCardLookupItem } from "./public-api";

export function CardLookupPage() {
  const [call, setCall] = useState("");
  const [qsoDate, setQsoDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<PublicCardLookupItem[] | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await lookupCards(call, qsoDate);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "索卡查询失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: "680px", margin: "40px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <h1>公开查验与精确索卡</h1>
      <p style={{ color: "#666" }}>请输入完整对方呼号与 UTC 日期进行精确索卡与真伪查验。</p>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "24px" }}>
        <div>
          <label htmlFor="call-input" style={{ display: "block", marginBottom: "6px", fontWeight: "bold" }}>
            对方呼号
          </label>
          <input
            id="call-input"
            type="text"
            required
            placeholder="例如: BG4YYY"
            value={call}
            onChange={(e) => setCall(e.target.value.toUpperCase())}
            style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "16px", boxSizing: "border-box" }}
          />
        </div>

        <div>
          <label htmlFor="date-input" style={{ display: "block", marginBottom: "6px", fontWeight: "bold" }}>
            UTC 日期 (YYYYMMDD)
          </label>
          <input
            id="date-input"
            type="text"
            required
            pattern="^\d{8}$"
            placeholder="例如: 20260903"
            value={qsoDate}
            onChange={(e) => setQsoDate(e.target.value.trim())}
            style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #ccc", fontSize: "16px", boxSizing: "border-box" }}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "12px 20px",
            backgroundColor: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "16px",
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer"
          }}
        >
          {loading ? "正在查询..." : "查询 / 索卡"}
        </button>
      </form>

      {error && (
        <div role="alert" style={{ marginTop: "20px", padding: "12px", backgroundColor: "#fee2e2", color: "#991b1b", borderRadius: "6px" }}>
          {error}
        </div>
      )}

      {results !== null && (
        <section style={{ marginTop: "32px" }}>
          <h2>查询结果</h2>
          {results.length === 0 ? (
            <p style={{ color: "#666" }}>未检索到符合条件的已签发 QSL 卡片，请核对呼号与 UTC 日期。</p>
          ) : (
            <div style={{ display: "grid", gap: "16px", marginTop: "16px" }}>
              {results.map((item) => (
                <div key={item.public_id} style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px", display: "flex", gap: "16px", alignItems: "center" }}>
                  {item.image_url ? (
                    <img src={item.image_url} alt={`${item.call} QSL preview`} style={{ width: "120px", height: "80px", objectFit: "cover", borderRadius: "4px" }} />
                  ) : (
                    <div style={{ width: "120px", height: "80px", backgroundColor: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "4px", color: "#9ca3af" }}>
                      暂无图片
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: "bold", fontSize: "18px" }}>{item.call}</div>
                    <div style={{ color: "#666", fontSize: "14px" }}>通联日期: {item.qso_date} UTC</div>
                    <a href={`/c/${item.public_id}`} style={{ display: "inline-block", marginTop: "8px", color: "#2563eb", textDecoration: "none", fontWeight: 500 }}>
                      查看完整电子 QSL 卡片 &rarr;
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
