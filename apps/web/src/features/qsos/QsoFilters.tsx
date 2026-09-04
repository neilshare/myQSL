import { useState } from "react";

export interface QsoFilterValues {
  call?: string;
  band?: string;
  mode?: string;
  date_from?: string;
  date_to?: string;
}

export function QsoFilters({ onFilter }: { onFilter?: (filters: QsoFilterValues) => void }) {
  const [call, setCall] = useState("");
  const [band, setBand] = useState("");
  const [mode, setMode] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFilter?.({
      call: call.trim() || undefined,
      band: band.trim() || undefined,
      mode: mode.trim() || undefined,
      date_from: dateFrom.trim() || undefined,
      date_to: dateTo.trim() || undefined,
    });
  };

  return (
    <form className="filters" onSubmit={handleSubmit} aria-label="QSO 筛选">
      <label>
        呼号筛选
        <input name="call" value={call} onChange={(e) => setCall(e.target.value)} placeholder="例如 BG4YYY" />
      </label>
      <label>
        波段
        <input name="band" value={band} onChange={(e) => setBand(e.target.value)} placeholder="例如 20M" />
      </label>
      <label>
        模式
        <input name="mode" value={mode} onChange={(e) => setMode(e.target.value)} placeholder="例如 SSB, FT8" />
      </label>
      <label>
        起始日期
        <input name="date_from" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="YYYYMMDD" />
      </label>
      <label>
        截止日期
        <input name="date_to" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="YYYYMMDD" />
      </label>
      <button type="submit">筛选</button>
    </form>
  );
}
