import React, { useState, useRef } from "react";
import { runImport, type ImportProgress } from "./import-controller";
import { api } from "../../lib/api-client";

export function ImportPage() {
  const [message, setMessage] = useState("请选择 ADIF 文件");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setBusy(true);
    setMessage("正在解析与上传 ADIF 日志...");
    setProgress(null);

    try {
      const result = await runImport(file, api.imports, {
        signal: controller.signal,
        onProgress: (p) => setProgress(p)
      });
      setMessage(`导入成功！共处理 ${result.total} 条通联记录（${result.chunks} 个分块）。`);
      if (result.counts) {
        setProgress({
          currentChunk: result.chunks,
          totalChunks: result.chunks,
          processedRecords: result.total,
          totalRecords: result.total,
          counts: result.counts
        });
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof Error && /abort/i.test(error.message))) {
        setMessage("导入已取消");
      } else {
        setMessage(error instanceof Error ? error.message : "导入失败");
      }
    } finally {
      setBusy(false);
      abortControllerRef.current = null;
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setMessage("正在取消导入...");
    }
  };

  const percentage = progress && progress.totalRecords > 0
    ? Math.min(100, Math.round((progress.processedRecords / progress.totalRecords) * 100))
    : 0;

  return (
    <section style={{ maxWidth: "680px", margin: "0 auto", padding: "0" }}>
      <div className="card-section" style={{ padding: "1.75rem" }}>
        <h2 style={{ marginTop: 0, fontSize: "1.5rem" }}>📥 ADIF 日志批量导入</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.95rem", lineHeight: 1.5 }}>
          支持标准 ADIF 3.x 格式日志文件（.adi / .adif），自动无损保留全部自定义扩展标签，支持千万级通联分块导入。
        </p>

        <div style={{ marginTop: "1.5rem", padding: "1.5rem", border: "2px dashed var(--border-subtle)", borderRadius: "8px", textAlign: "center", background: "#0b132b" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".adi,.adif"
            disabled={busy}
            onChange={handleFileChange}
            style={{ maxWidth: "320px", margin: "0 auto" }}
          />
        </div>

        {progress && progress.totalRecords > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>
              <span>上传进度: {progress.currentChunk} / {progress.totalChunks} 块 ({progress.processedRecords} / {progress.totalRecords} 条)</span>
              <span>{percentage}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={percentage}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ width: "100%", height: "8px", background: "rgba(255,255,255,0.1)", borderRadius: "4px", overflow: "hidden" }}
            >
              <div
                style={{
                  width: `${percentage}%`,
                  height: "100%",
                  background: "#3b82f6",
                  transition: "width 0.2s ease"
                }}
              />
            </div>

            {/* 4-bucket breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.75rem", marginTop: "1rem" }}>
              <div style={{ padding: "0.75rem", borderRadius: "6px", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "#34d399" }}>就绪入库 (Ready)</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#10b981", marginTop: "0.25rem" }}>{progress.counts.ready}</div>
              </div>
              <div style={{ padding: "0.75rem", borderRadius: "6px", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.3)", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "#fbbf24" }}>软重复警告 (Warning)</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#f59e0b", marginTop: "0.25rem" }}>{progress.counts.warning}</div>
              </div>
              <div style={{ padding: "0.75rem", borderRadius: "6px", background: "rgba(59, 130, 246, 0.1)", border: "1px solid rgba(59, 130, 246, 0.3)", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "#60a5fa" }}>精确重复跳过 (Duplicate)</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#3b82f6", marginTop: "0.25rem" }}>{progress.counts.duplicate}</div>
              </div>
              <div style={{ padding: "0.75rem", borderRadius: "6px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", textAlign: "center" }}>
                <div style={{ fontSize: "0.75rem", color: "#f87171" }}>格式校验拒绝 (Rejected)</div>
                <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "#ef4444", marginTop: "0.25rem" }}>{progress.counts.rejected}</div>
              </div>
            </div>
          </div>
        )}

        {busy && (
          <div style={{ marginTop: "1rem", textAlign: "center" }}>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                padding: "0.5rem 1.25rem",
                background: "transparent",
                color: "#ef4444",
                border: "1px solid #ef4444",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: 500,
                fontSize: "0.9rem"
              }}
            >
              取消导入
            </button>
          </div>
        )}

        <p
          role="status"
          style={{
            marginTop: "1.25rem",
            color: busy ? "#60a5fa" : message.includes("成功") || message.includes("完成") ? "#34d399" : message.includes("取消") ? "#fbbf24" : "var(--text-muted)",
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

