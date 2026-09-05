import React, { useState } from "react";
import { lookupCards, type PublicCardLookupItem } from "./public-api";
import { useI18n } from "../../lib/i18n";

export function CardLookupPage() {
  const { t, locale } = useI18n();
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
      setError(err instanceof Error ? err.message : (locale === "zh" ? "索卡查询失败" : "Lookup failed"));
    } finally {
      setLoading(false);
    }
  };

  const callLabel = locale === "zh" ? "对方呼号" : t("lookup.call");
  const dateLabel = locale === "zh" ? "UTC 日期 (YYYYMMDD)" : t("lookup.date");
  const btnLabel = loading
    ? (locale === "zh" ? "正在查询..." : "Searching...")
    : (locale === "zh" ? "查询 / 索卡" : "Search Card");

  return (
    <section style={{ maxWidth: "720px", margin: "0 auto", padding: "0" }}>
      <div className="card-section" style={{ padding: "1.5rem" }}>
        <h1 style={{ margin: "0 0 0.5rem", fontSize: "1.6rem" }}>{t("lookup.title")}</h1>
        <p style={{ color: "var(--text-muted)", margin: "0 0 1.5rem", fontSize: "0.95rem" }}>
          {t("lookup.subtitle")}
        </p>

        <form onSubmit={handleSubmit} style={{ display: "grid", gap: "1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "1rem" }}>
            <label htmlFor="call-input">
              {callLabel}
              <input
                id="call-input"
                type="text"
                required
                placeholder={locale === "zh" ? "例如: BG4YYY" : "e.g. BG4YYY"}
                value={call}
                onChange={(e) => setCall(e.target.value.toUpperCase())}
              />
            </label>

            <label htmlFor="date-input">
              {dateLabel}
              <input
                id="date-input"
                type="text"
                required
                pattern="^\d{8}$"
                placeholder={locale === "zh" ? "例如: 20260903" : "e.g. 20260903"}
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
            {btnLabel}
          </button>
        </form>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: "1.25rem",
              padding: "0.85rem 1rem",
              backgroundColor: "rgba(239, 68, 68, 0.15)",
              color: "var(--danger, #fca5a5)",
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
          <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>{t("lookup.results")}</h2>
          {results.length === 0 ? (
            <div className="card-section" style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
              {t("lookup.notFound")}
            </div>
          ) : (
            <div style={{ display: "grid", gap: "1rem" }}>
              {results.map((item) => (
                <article
                  key={item.public_id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "1rem",
                    padding: "1rem 1.25rem",
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "8px"
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "1.2rem", letterSpacing: "0.02em" }}>{item.call}</strong>
                    <span style={{ color: "var(--text-muted)", marginLeft: "1rem", fontSize: "0.95rem" }}>
                      UTC: {item.qso_date}
                    </span>
                  </div>
                  <a
                    href={`/c/${item.public_id}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.4rem",
                      padding: "0.5rem 1rem",
                      background: "var(--accent-primary)",
                      color: "#fff",
                      textDecoration: "none",
                      borderRadius: "6px",
                      fontWeight: 500,
                      fontSize: "0.9rem"
                    }}
                  >
                    {t("lookup.viewBtn")} &rarr;
                  </a>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
