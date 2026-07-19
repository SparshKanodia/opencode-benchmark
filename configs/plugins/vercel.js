export const VercelPlugin = async ({ project, client, $, directory, worktree }) => {
  return {
    "session.created": async (input, output) => {
      console.log("[vercel-plugin] Vercel ecosystem context available")
    },
    "tool.execute.before": async (input, output) => {
      const bash = input.tool === "bash"
      const read = input.tool === "read"
      const cmd = output.args?.command || ""
      const path = output.args?.filePath || ""

      const vercelPatterns = [
        /vercel/i, /next\.config/, /next\.js/i, /turbopack/i,
        /ai-sdk/i, /ai-gateway/i, /vercel\.json/i,
        /middleware\.ts/, /proxy\.ts/, /app\/api\//,
        /\.env/, /\.env\.local/
      ]

      const isVercel = (bash && vercelPatterns.some(p => p.test(cmd))) ||
                       (read && vercelPatterns.some(p => p.test(path)))

      if (isVercel) {
        output.env.VERCEL_PLUGIN_ACTIVE = "1"
      }
    }
  }
}
