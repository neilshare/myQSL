import { useState } from "react";
import { useI18n } from "../../lib/i18n";

export interface QsoFilterValues {
  call?: string;
  band?: string;
  mode?: string;
  date_from?: string;
  date_to?: string;
}

export function QsoFilters({ onFilter }: { onFilter?: (filters: QsoFilterValues) => void }) {
  const { t } = useI18n();
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
    <form className="filters" onSubmit={handleSubmit} aria-label={t("qsos.filterTitle")}>
      <label>
        {t("common.filter") === "筛选" ? "呼号筛选" : t("qsos.call")}
        <input name="call" value={call} onChange={(e) => setCall(e.target.value)} placeholder="BG4YYY" />
      </label>
      <label>
        {t("qsos.band")}
        <input name="band" value={band} onChange={(e) => setBand(e.target.value)} placeholder="20M" />
      </label>
      <label>
        {t("qsos.mode")}
        <input name="mode" value={mode} onChange={(e) => setMode(e.target.value)} placeholder="SSB, FT8" />
      </label>
      <label>
        {t("qsos.dateFrom")}
        <input name="date_from" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="YYYYMMDD" />
      </label>
      <label>
        {t("qsos.dateTo")}
        <input name="date_to" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="YYYYMMDD" />
      </label>
      <button type="submit">{t("common.filter")}</button>
    </form>
  );
}
