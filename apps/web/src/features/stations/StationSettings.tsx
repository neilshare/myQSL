import { useEffect, useState, useCallback } from "react";
import { api } from "../../lib/api-client";

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
  const [stations, setStations] = useState<Station[]>([]);
  const [callsign, setCallsign] = useState("");
  const [operator, setOperator] = useState("");
  const [grid, setGrid] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadStations = useCallback(async () => {
    try {
      const res = await api.stations.list();
      setStations((res.data.data as Station[]) ?? []);
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
      setMessage("台站已保存");
      setCallsign("");
      setOperator("");
      setGrid("");
      setIsDefault(false);
      void loadStations();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  };

  return (
    <section>
      <h2>台站设置</h2>
      <p>管理默认台站和操作员信息。</p>
      {message && <output role="status">{message}</output>}

      <form onSubmit={handleSubmit} aria-label="台站设置表单">
        <label>
          本台呼号
          <input
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
            placeholder="例如 BI1ABC"
            required
          />
        </label>
        <label>
          操作员呼号
          <input
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            placeholder="例如 BI1ABC"
          />
        </label>
        <label>
          网格坐标
          <input
            value={grid}
            onChange={(e) => setGrid(e.target.value)}
            placeholder="例如 OM89xx"
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          设为默认台站
        </label>
        <button type="submit">添加台站</button>
      </form>

      <div className="station-list" style={{ marginTop: "1rem" }}>
        <h3>现有台站</h3>
        {stations.length === 0 ? (
          <p>暂无台站配置</p>
        ) : (
          stations.map((s) => (
            <article key={s.id}>
              <strong>{s.callsign}</strong>
              {s.operator_callsign && <span> (操作员: {s.operator_callsign})</span>}
              {s.grid_square && <span> [网格: {s.grid_square}]</span>}
              {Boolean(s.is_default) && <em> (默认)</em>}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
