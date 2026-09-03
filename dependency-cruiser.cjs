module.exports = {
  forbidden: [
    {
      name: "no-circular",
      comment: "Avoid circular dependencies.",
      severity: "error",
      from: {},
      to: { circular: true }
    },
    {
      name: "no-worker-node-imports",
      comment: "Workers code must not import Node built-ins.",
      severity: "error",
      from: { path: "^apps/worker/src" },
      to: { path: "^node:" }
    }
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: [".ts", ".tsx", ".mjs", ".js"] }
  }
};
