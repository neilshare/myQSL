import { useState } from "react";
import { exportAdif } from "./export-controller";
import { api } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";

export function ExportButton() {
  const { locale, t } = useI18n();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const adiContent = await exportAdif(api.qsos as any);
      const blob = new Blob([adiContent], { type: "text/plain;charset=us-ascii" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `myqsl-export-${new Date().toISOString().slice(0, 10)}.adi`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : (locale === "zh" ? "导出失败" : "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={exporting}
      style={{
        padding: "8px 16px",
        backgroundColor: "var(--success, #059669)",
        color: "white",
        border: "none",
        borderRadius: "6px",
        fontWeight: 500,
        cursor: exporting ? "not-allowed" : "pointer"
      }}
    >
      {exporting ? (locale === "zh" ? "正在导出..." : "Exporting...") : t("qsos.exportAdif")}
    </button>
  );
}
