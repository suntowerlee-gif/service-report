// 同步配置：部署好 cloudflare-worker/worker.js 后，把它的访问地址和共享口令填在这里。
// Sync config: after deploying cloudflare-worker/worker.js, fill in its URL and shared token here.
//
// 留空（保持默认空字符串）则同步功能自动关闭，App其余功能不受影响 —— 也就是说，
// 不配置这两项完全可以正常使用本工具，只是签字后的报告不会自动同步到仓库，
// 需要工程师自己导出转发（与之前版本行为一致）。
// Leaving these blank disables sync entirely and the rest of the app is unaffected —
// the tool works fully without this, engineers just won't get automatic repo backup
// and should keep exporting/forwarding manually (same as before this feature existed).
const SYNC_CONFIG = {
  // 部署Worker后，把它的访问地址填在这里，例如：
  // "https://service-report-sync.your-subdomain.workers.dev"
  // After deploying the Worker, put its URL here.
  endpoint: "",
  // 已为你生成好的共享口令（不是GitHub密钥），部署Worker时把它原样填入
  // Worker的 APP_TOKEN 环境变量即可，两边必须完全一致。
  // A shared token already generated for you (not a GitHub credential) — paste this
  // exact value into the Worker's APP_TOKEN environment variable when you deploy it.
  appToken: "tK1HVjj3eZfv3tANdHFRGf9plWfHitzNZ6mUXsUf"
};
