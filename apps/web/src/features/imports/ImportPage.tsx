import React, { useState } from "react";
import { runImport } from "./import-controller";
import { api } from "../../lib/api-client";

export function ImportPage() {
  const [message, setMessage] = useState("请选择 ADIF 文件");
  const [busy, setBusy] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setMessage("正在解析与上传 ADIF 日志...");

    try {
      const result = await runImport(file, api.imports);
      setMessage(`导入成功！共处理 ${result.total} 条通联记录（${result.chunks} 个分块）。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "导入失败");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ maxWidth: "680px", margin: "0 auto", padding: "0" }}>
      <div className="card-section" style={{ padding: "1.75rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.5rem" }}>📥 ADIF 日志批量导入</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.5 }}>
          支持标准 ADIF 3.x 格式日志文件（.adi / .adif），自动无损保留全部自定义扩展标签，支持千万级通联分块导入。
        </p>

        <div style={{ marginTop: "1.5rem", padding: "1.5rem", border: "2px dashed var(--border-subtle)", borderRadius: "8px", textAlign: "center", background: "#0b132b" }}>
          <input
            type="file"
            accept=".adi,.adif"
            disabled={busy}
            onChange={handleFileChange}
            style={{ maxWidth: "320px", margin: "0 auto" }}
          />
        </div>

        <p
          role="status"
          style={{
            marginTop: "1.25rem",
            color: busy ? "#60a5fa" : message.includes("成功") ? "#34d399" : "var(--text-muted)",
            fontWeight: 500,
            fontSize: "0.95rem"
          }}
        >
          {message}
        </p>
      </div>
    </section>
  );
}
