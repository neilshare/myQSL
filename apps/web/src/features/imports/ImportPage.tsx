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
    <section style={{ maxWidth: "600px", margin: "40px auto", padding: "0 20px" }}>
      <h2>ADIF 日志批量导入</h2>
      <p style={{ color: "#666" }}>支持标准 ADIF 3.x 格式日志文件（.adi / .adif），自动无损保留全部自定义扩展标签。</p>
      <div style={{ marginTop: "20px" }}>
        <input
          type="file"
          accept=".adi,.adif"
          disabled={busy}
          onChange={handleFileChange}
        />
      </div>
      <p role="status" style={{ marginTop: "16px", color: busy ? "#2563eb" : "#374151" }}>
        {message}
      </p>
    </section>
  );
}
