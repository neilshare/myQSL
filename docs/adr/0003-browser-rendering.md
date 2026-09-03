# ADR 0003：浏览器解析与 Canvas 渲染

ADIF 解析/序列化和 QSL Canvas 渲染放在浏览器 Worker 或主线程边界之外，Worker 负责逐记录校验、持久化和 R2 流式传输。这样避开 Worker CPU/内存上限，并让预览与导出使用同一渲染实现。
