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
    <section style={{ maxWidth: "720px", margin: "0 auto", padding: "0" }}>
      <div className="card-section" style={{ padding: "1.5rem" }}>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.6rem" }}>🔍 公开查验与精确索卡</h1>
        <p style={{ color: "var(--text-muted)", margin: "0 0 1.5rem", fontSize: "0.95rem" }}>
          请输入完整对方呼号与 UTC 日期（8位数字）进行精确索卡与防伪认证查验。
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            <label htmlFor="call-input">
              对方呼号
              <input
                id="call-input"
                type="text"
                required
                placeholder="例如: BG4YYY"
                value={call}
                onChange={(e) => setCall(e.target.value.toUpperCase())}
              />
            </label>

            <label htmlFor="date-input">
              UTC 日期 (YYYYMMDD)
              <input
                id="date-input"
                type="text"
                required
                pattern="^\d{8}$"
                placeholder="例如: 20260903"
                value={qsoDate}
                onChange={(e) => setQsoDate(e.target.value.trim())}
              />
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ maxWidth: "200px", marginTop: "0.5rem" }}
          >
            {loading ? "正在查询..." : "查询 / 索卡"}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: "1.25rem",
              padding: "0.85rem 1rem",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "#fca5a5",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "6px"
            }}
          >
            {error}
          </div>
        )}
      </div>

      {results !== null && (
        <div style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>查验结果</h2>
          {results.length === 0 ? (
            <div className="card-section" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
              未检索到符合条件的已签发 QSL 卡片，请核对呼号与 UTC 日期。
            </div>
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              {results.map((item) => (
                <article
                  key={item.public_id}
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "1.25rem",
                    alignItems: "center",
                    padding: "1.25rem",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px"
                  }}
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={`${item.call} QSL preview`}
                      style={{
                        width: "140px",
                        height: "94px",
                        objectFit: "cover",
                        borderRadius: "6px",
                        border: "1px solid var(--border-subtle)"
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "140px",
                        height: "94px",
                        backgroundColor: "#0b132b",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: "6px",
                        color: "var(--text-muted)",
                        fontSize: "0.85rem",
                        border: "1px solid var(--border-subtle)"
                      }}
                    >
                      暂无缩略图
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: "200px" }}>
                    <div style={{ fontWeight: "bold", fontSize: "1.25rem", color: "#f8fafc" }}>
                      {item.call}
                    </div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
                      通联日期: {item.qso_date} UTC
                    </div>
                    <a
                      href={`/c/${item.public_id}`}
                      style={{
                        display: "inline-block",
                        marginTop: "0.75rem",
                        color: "#60a5fa",
                        textDecoration: "none",
                        fontWeight: 600,
                        fontSize: "0.95rem"
                      }}
                    >
                      查看完整电子 QSL 卡片 &rarr;
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
