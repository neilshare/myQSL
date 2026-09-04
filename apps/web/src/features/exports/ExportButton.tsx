import React, { useState } from "react";
import { exportAdif } from "./export-controller";
import { api } from "../../lib/api-client";

export function ExportButton() {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const adiContent = await exportAdif(api.qsos as any);
      const blob = new Blob([adiContent], { type: "text/plain;charset=us-ascii" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `eqsr-export-${new Date().toISOString().slice(0, 10)}.adi`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "导出失败");
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
        backgroundColor: "#059669",
        color: "white",
        border: "none",
        borderRadius: "6px",
        fontWeight: 500,
        cursor: exporting ? "not-allowed" : "pointer"
      }}
    >
      {exporting ? "正在导出..." : "导出 ADIF"}
    </button>
  );
}
