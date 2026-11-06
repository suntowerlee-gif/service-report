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
  // 已填好你实际部署的Worker访问地址——使用绑定在 zkpykj.com 上的自定义域名，
  // 而不是 Cloudflare 默认分配的 workers.dev 子域名，因为 workers.dev 在中国大陆
  // 被SNI阻断、无法直接访问，导致之前大部分工程师的报告无法静默同步。自定义域名
  // 走 Cloudflare 常规边缘节点，大陆通常可以正常访问。
  // Already filled in with your actually deployed Worker URL — using the custom
  // domain bound on zkpykj.com instead of Cloudflare's default workers.dev
  // subdomain, because workers.dev is SNI-blocked in mainland China (this was
  // why most engineers' reports previously failed to sync silently). The custom
  // domain rides Cloudflare's normal edge network, which is generally reachable
  // from mainland China.
  endpoint: "https://sync.zkpykj.com",
  // 已为你生成好的共享口令（不是GitHub密钥），部署Worker时把它原样填入
  // Worker的 APP_TOKEN 环境变量即可，两边必须完全一致。
  // A shared token already generated for you (not a GitHub credential) — paste this
  // exact value into the Worker's APP_TOKEN environment variable when you deploy it.
  appToken: "tK1HVjj3eZfv3tANdHFRGf9plWfHitzNZ6mUXsUf"
};
