import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";

interface Station {
  id: number;
  callsign: string;
  station_callsign?: string | null;
  operator_callsign?: string | null;
  grid_square?: string | null;
  qth?: string | null;
  rig?: string | null;
  antenna?: string | null;
  power_w?: number | null;
  is_default: boolean | number;
  version: number;
}

export function StationSettings() {
  const { t, locale } = useI18n();
  const [stations, setStations] = useState<Station[]>([]);
  const [callsign, setCallsign] = useState("");
  const [operator, setOperator] = useState("");
  const [grid, setGrid] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStations = useCallback(async () => {
    try {
      const res = await api.stations.list();
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : (Array.isArray((raw as any)?.data) ? (raw as any).data : []);
      setStations(list as Station[]);
    } catch {
      setStations([]);
    }
  }, []);

  useEffect(() => {
    void loadStations();
  }, [loadStations]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.stations.create({
        callsign: callsign.trim().toUpperCase(),
        operator_callsign: operator.trim() ? operator.trim().toUpperCase() : null,
        grid_square: grid.trim() ? grid.trim().toUpperCase() : null,
        is_default: isDefault,
      });
      setMessage(locale === "zh" ? "台站已保存" : "Station saved");
      setCallsign("");
      setOperator("");
      setGrid("");
      setIsDefault(false);
      void loadStations();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : (locale === "zh" ? "保存失败" : "Save failed"));
    }
  };

  const callsignLabel = locale === "zh" ? "本台呼号" : t("stations.callsign");
  const operatorLabel = locale === "zh" ? "操作员呼号" : t("stations.operator");
  const gridLabel = locale === "zh" ? "网格坐标" : t("stations.grid");
  const isDefaultLabel = locale === "zh" ? "设为默认台站" : t("stations.isDefault");
  const addBtnLabel = locale === "zh" ? "添加台站" : t("stations.addBtn");

  return (
    <section>
      <h2>{t("stations.title")}</h2>
      <p style={{ color: "var(--text-muted)" }}>{t("stations.subtitle")}</p>
      {message && <output role="status" style={{ color: "var(--success)" }}>{message}</output>}

      <form onSubmit={handleSubmit} aria-label={locale === "zh" ? "台站设置表单" : "Station Settings Form"} style={{ display: "grid", gap: "1rem" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
          <label>
            {callsignLabel}
            <input
              value={callsign}
              onChange={(e) => setCallsign(e.target.value)}
              placeholder="BI1ABC"
              required
            />
          </label>
          <label>
            {operatorLabel}
            <input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="BI1ABC"
            />
          </label>
          <label>
            {gridLabel}
            <input
              value={grid}
              onChange={(e) => setGrid(e.target.value)}
              placeholder="OM89xx"
            />
          </label>
        </div>
        <label
          className="checkbox-label"
          style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", minHeight: "44px" }}
        >
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            style={{ width: "1.25rem", height: "1.25rem", minHeight: "1.25rem" }}
          />
          <span>{isDefaultLabel}</span>
        </label>
        <button type="submit" style={{ maxWidth: "240px" }}>{addBtnLabel}</button>
      </form>

      <div className="station-list" style={{ display: "grid", gap: "0.75rem", marginTop: "1.5rem" }}>
        <h3>{t("stations.existing")}</h3>
        {stations.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>{t("stations.empty")}</p>
        ) : (
          stations.map((s) => (
            <article
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                padding: "0.85rem 1rem",
                background: "var(--bg-card)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "8px"
              }}
            >
              <div>
                <strong style={{ fontSize: "1.1rem" }}>{s.callsign}</strong>
                {s.operator_callsign && (
                  <span style={{ color: "var(--text-muted)", marginLeft: "0.75rem" }}>
                    {locale === "zh" ? "操作员: " : "Operator: "}{s.operator_callsign}
                  </span>
                )}
                {s.grid_square && (
                  <span style={{ color: "var(--text-muted)", marginLeft: "0.75rem" }}>
                    {locale === "zh" ? "网格: " : "Grid: "}{s.grid_square}
                  </span>
                )}
              </div>
              {Boolean(s.is_default) && (
                <span
                  style={{
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "var(--success, #34d399)",
                    padding: "2px 8px",
                    borderRadius: "9999px",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    border: "1px solid rgba(16, 185, 129, 0.3)"
                  }}
                >
                  {locale === "zh" ? "(默认)" : "(Default)"}
                </span>
              )}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
