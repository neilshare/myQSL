import { useState } from "react";
import { runImport } from "./import-controller";
import { api } from "../../lib/api-client";

export function ImportPage() { const [message, setMessage] = useState("请选择 ADIF 文件"); return <section><h2>ADIF 导入</h2><input type="file" accept=".adi,.adif" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const result = await runImport(file, api.imports); setMessage(`已处理 ${result.total} 条`); } catch (error) { setMessage(error instanceof Error ? error.message : "导入失败"); } }} /><p role="status">{message}</p></section>; }
