import React, { useEffect, useState } from "react";
import { useParams } from "react-router";
import { getPublicCard, type PublicCardDetail } from "./public-api";

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
          setError(err instanceof Error ? err.message : "无法加载卡片");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialCard, publicId]);

  if (loading) {
    return (
      <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 16px", textAlign: "center", color: "var(--text-muted)" }}>
        <p>正在加载 QSL 卡片...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 16px", textAlign: "center" }}>
        <h1>卡片查验提示</h1>
        <p role="alert" style={{ color: "var(--danger, #ef4444)", marginTop: "16px" }}>{error}</p>
        <p style={{ marginTop: "24px" }}>
          <a href="/lookup" style={{ color: "#60a5fa" }}>返回索卡查询</a>
        </p>
      </div>
    );
  }

  if (!card) {
    return (
      <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 16px", textAlign: "center", color: "var(--text-muted)" }}>
        <p>未指定有效卡片 ID</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "880px", margin: "0 auto", padding: "0" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "0.75rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.6rem" }}>电子 QSL 卡片查验</h1>
        <span
          style={{
            backgroundColor: "#10b981",
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
          ✓ 已认证签发
        </span>
      </header>

      {card.image_url ? (
        <div
          style={{
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.4)",
            borderRadius: "10px",
            overflow: "hidden",
            marginBottom: "24px",
            border: "1px solid var(--border-subtle, #2c3e66)"
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
            backgroundColor: "var(--bg-card, #1c2541)",
            textAlign: "center",
            borderRadius: "10px",
            marginBottom: "24px",
            color: "var(--text-muted)",
            border: "1px solid var(--border-subtle, #2c3e66)"
          }}
        >
          暂无卡片渲染图
        </div>
      )}

      <section
        style={{
          backgroundColor: "var(--bg-card, #1c2541)",
          border: "1px solid var(--border-subtle, #2c3e66)",
          borderRadius: "10px",
          padding: "1.5rem"
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: "1.2rem", marginBottom: "1rem" }}>通联 QSO 快照</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem" }}>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>对方呼号</span>
            <div style={{ fontWeight: "bold", fontSize: "1.2rem", color: "#60a5fa" }}>{card.qso.call}</div>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>通联时间 (UTC)</span>
            <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.qso_date} {card.qso.time_on}</div>
          </div>
          {card.qso.station_callsign && (
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>本台呼号</span>
              <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.station_callsign}</div>
            </div>
          )}
          {card.qso.band && (
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>波段</span>
              <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.band}</div>
            </div>
          )}
          {card.qso.mode && (
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>模式</span>
              <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.mode}</div>
            </div>
          )}
          {card.qso.rst_sent && (
            <div>
              <span style={{ color: "var(--text-muted)", fontSize: "13px", display: "block" }}>RST 发送</span>
              <div style={{ fontWeight: "bold", fontSize: "1.1rem" }}>{card.qso.rst_sent}</div>
            </div>
          )}
        </div>
      </section>

      <footer style={{ marginTop: "24px", textAlign: "center" }}>
        <a href="/lookup" style={{ color: "#60a5fa", textDecoration: "none", fontWeight: 500 }}>&larr; 返回索卡查验中心</a>
      </footer>
    </div>
  );
}
