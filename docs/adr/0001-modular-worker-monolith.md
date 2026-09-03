# ADR 0001：单 Worker 模块化单体

采用一个 Cloudflare Worker 搭配 Static Assets，内部按 stations、qsos、imports、templates、cards、public、backup 分模块。这样前后端同域同版本发布，减少 CORS、Cookie 和回滚复杂度；未来可按模块拆分，而不提前承担微服务运维成本。
