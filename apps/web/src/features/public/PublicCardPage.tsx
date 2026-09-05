import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { getPublicCard, type PublicCardDetail } from "./public-api";
import { useI18n } from "../../lib/i18n";

export type PublicCardProp = {
  qso: {
    call: string;
    qso_date: string;
    time_on: string;
    station_callsign?: string;
    band?: string;
    mode?: string;
    rst_sent?: string | null;
    rst_rcvd?: string | null;
  };
  image_url: string | null;
};

export function PublicCardPage({ card: initialCard }: { card?: PublicCardProp }) {
  const { t, locale } = useI18n();
  const { publicId } = useParams<{ publicId: string }>();
  const [card, setCard] = useState<PublicCardProp | null>(initialCard ?? null);
  const [loading, setLoading] = useState(!initialCard && Boolean(publicId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialCard) {
      setCard(initialCard);
      return;
    }
    if (!publicId) return;

    let active = true;
    setLoading(true);
    getPublicCard(publicId)
      .then((detail: PublicCardDetail) => {
        if (active) {
          setCard({
            qso: detail.qso,
            image_url: detail.image_url
          });
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : (locale === "zh" ? "无法加载卡片" : "Failed to load card"));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialCard, publicId, locale]);

  if (loading) {
    return (
      <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 16px", textAlign: "center", color: "var(--text-muted)" }}>
        <p>{locale === "zh" ? "正在加载 QSL 卡片..." : "Loading QSL card..."}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 16px", textAlign: "center" }}>
        <h1>{locale === "zh" ? "卡片查验提示" : "Card Verification"}</h1>
        <p role="alert" style={{ color: "var(--danger, #ef4444)", marginTop: "16px" }}>{error}</p>
        <p style={{ marginTop: "24px" }}>
          <a href="/lookup" style={{ color: "var(--accent-primary)" }}>
            {locale === "zh" ? "返回索卡查询" : "Back to Lookup"}
          </a>
        </p>
      </div>
    );
  }

  if (!card) {
    return (
      <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 16px", textAlign: "center", color: "var(--text-muted)" }}>
        <p>{locale === "zh" ? "未指定有效卡片 ID" : "Invalid card ID"}</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "880px", margin: "0 auto", padding: "0" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem" }}>{t("publicCard.title")}</h1>
        <span
          style={{
            backgroundColor: "var(--success, #10b981)",
            color: "white",
            padding: "4px 12px",
            borderRadius: "9999px",
            fontSize: "13px",
            fontWeight: "bold",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem"
          }}
        >
          {locale === "zh" ? "✓ 已认证签发" : "✓ Verified & Issued"}
        </span>
      </header>

      {card.image_url ? (
        <div
          style={{
            boxShadow: "var(--card-shadow)",
            borderRadius: "10px",
            overflow: "hidden",
            marginBottom: "24px",
            border: "1px solid var(--border-subtle)"
          }}
        >
          <img
            src={card.image_url}
            alt={`${card.qso.call} QSL`}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
      ) : (
        <div
          style={{
            padding: "40px",
            backgroundColor: "var(--bg-card)",
            textAlign: "center",
            borderRadius: "10px",
            marginBottom: "24px",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle)"
          }}
        >
          {locale === "zh" ? "暂无卡片渲染图" : "No rendered image available"}
        </div>
      )}

      <section
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "10px",
          padding: "1.5rem"
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: "1.2rem", marginBottom: "1rem" }}>{t("publicCard.qsoDetails")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem" }}>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>{t("qsos.call")}</span>
            <div style={{ fontWeight: "bold", fontSize: "1.2rem", color: "var(--accent-primary)" }}>{card.qso.call}</div>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>{t("qsos.time")}</span>
            <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.qso_date} {card.qso.time_on}</div>
          </div>
          {card.qso.station_callsign && (
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>{t("qsos.stationCallsign")}</span>
              <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.station_callsign}</div>
            </div>
          )}
          {card.qso.band && (
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>{t("qsos.band")}</span>
              <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.band}</div>
            </div>
          )}
          {card.qso.mode && (
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>{t("qsos.mode")}</span>
              <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.mode}</div>
            </div>
          )}
          {card.qso.rst_sent && (
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>{t("qsos.rstSent")}</span>
              <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.rst_sent}</div>
            </div>
          )}
        </div>
      </section>

      <footer style={{ marginTop: "24px", textAlign: "center" }}>
        <a href="/lookup" style={{ color: "var(--accent-primary)", textDecoration: "none", fontWeight: 500 }}>
          &larr; {locale === "zh" ? "返回索卡查验中心" : "Back to Lookup Center"}
        </a>
      </footer>
    </div>
  );
}
