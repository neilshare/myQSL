# ADR 0002：管理端使用 Cloudflare Access

首版不自研密码、会话 JWT 或吊销 KV。管理路径由 Access 保护，Worker 使用 `Cf-Access-Jwt-Assertion` 通过 JWKS、issuer、audience 和 RS256 二次校验；本地和 E2E 仅有明确限定的开发令牌。
