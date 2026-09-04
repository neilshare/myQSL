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
      <main style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px", fontFamily: "sans-serif", textAlign: "center" }}>
        <p>正在加载 QSL 卡片...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px", fontFamily: "sans-serif", textAlign: "center" }}>
        <h1>卡片查验提示</h1>
        <p role="alert" style={{ color: "#b91c1c", marginTop: "16px" }}>{error}</p>
        <p style={{ marginTop: "24px" }}>
          <a href="/lookup" style={{ color: "#2563eb" }}>返回索卡查询</a>
        </p>
      </main>
    );
  }

  if (!card) {
    return (
      <main style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px", fontFamily: "sans-serif", textAlign: "center" }}>
        <p>未指定有效卡片 ID</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "800px", margin: "40px auto", padding: "0 20px", fontFamily: "sans-serif" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
        <h1 style={{ margin: 0 }}>电子 QSL 卡片查验</h1>
        <span style={{ backgroundColor: "#10b981", color: "white", padding: "4px 10px", borderRadius: "12px", fontSize: "12px", fontWeight: "bold" }}>
          已认证签发
        </span>
      </header>

      {card.image_url ? (
        <div style={{ boxShadow: "0 4px 12px rgba(0,0,0,0.15)", borderRadius: "8px", overflow: "hidden", marginBottom: "24px" }}>
          <img
            src={card.image_url}
            alt={`${card.qso.call} QSL`}
            style={{ width: "100%", height: "auto", display: "block" }}
          />
        </div>
      ) : (
        <div style={{ padding: "40px", backgroundColor: "#f3f4f6", textAlign: "center", borderRadius: "8px", marginBottom: "24px" }}>
          暂无卡片渲染图
        </div>
      )}

      <section style={{ backgroundColor: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "20px" }}>
        <h2 style={{ marginTop: 0, fontSize: "18px" }}>通联 QSO 快照</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px" }}>
          <div>
            <span style={{ color: "#6b7280", fontSize: "13px" }}>对方呼号</span>
            <div style={{ fontWeight: "bold", fontSize: "16px" }}>{card.qso.call}</div>
          </div>
          <div>
            <span style={{ color: "#6b7280", fontSize: "13px" }}>通联时间 (UTC)</span>
            <div style={{ fontWeight: "bold", fontSize: "16px" }}>{card.qso.qso_date} {card.qso.time_on}</div>
          </div>
          {card.qso.station_callsign && (
            <div>
              <span style={{ color: "#6b7280", fontSize: "13px" }}>本台呼号</span>
              <div style={{ fontWeight: "bold", fontSize: "16px" }}>{card.qso.station_callsign}</div>
            </div>
          )}
          {card.qso.band && (
            <div>
              <span style={{ color: "#6b7280", fontSize: "13px" }}>波段</span>
              <div style={{ fontWeight: "bold", fontSize: "16px" }}>{card.qso.band}</div>
            </div>
          )}
          {card.qso.mode && (
            <div>
              <span style={{ color: "#6b7280", fontSize: "13px" }}>模式</span>
              <div style={{ fontWeight: "bold", fontSize: "16px" }}>{card.qso.mode}</div>
            </div>
          )}
          {card.qso.rst_sent && (
            <div>
              <span style={{ color: "#6b7280", fontSize: "13px" }}>RST 发送</span>
              <div style={{ fontWeight: "bold", fontSize: "16px" }}>{card.qso.rst_sent}</div>
            </div>
          )}
        </div>
      </section>

      <footer style={{ marginTop: "24px", textAlign: "center" }}>
        <a href="/lookup" style={{ color: "#2563eb", textDecoration: "none" }}>&larr; 返回索卡查验中心</a>
      </footer>
    </main>
  );
}
