// ============================================================================
// 售后服务报告 — GitHub 静默同步中转服务 (Cloudflare Worker)
// Service Report — silent GitHub sync relay (Cloudflare Worker)
//
// 作用 / Purpose:
//   手机端PWA不持有任何GitHub密钥；工程师签字生成报告后，手机把报告数据
//   POST 给这个Worker，Worker用只存在服务器端的GitHub令牌，把文件写入
//   一个独立的私有仓库。手机端全程无需登录、无需手动保存。
//   The phone-side PWA never holds a GitHub credential. After an engineer
//   signs a report, the phone POSTs the report data to this Worker, which
//   uses a server-side-only GitHub token to write the files into a separate
//   private repo. No login or manual save is ever required on the phone.
//
// 需要在 Cloudflare Worker 的 Settings → Variables 中配置以下环境变量
// (GITHUB_TOKEN 和 APP_TOKEN 务必用 "Encrypt" 加密保存):
// Configure these in the Worker's Settings → Variables (encrypt
// GITHUB_TOKEN and APP_TOKEN):
//   GITHUB_TOKEN   - GitHub 细粒度个人访问令牌 (Fine-grained PAT)，
//                    仅授权这一个私有仓库、仅 Contents: Read and write 权限
//                    Scoped ONLY to the one private data repo, permission
//                    "Contents: Read and write" — nothing else.
//   REPO_OWNER     - 仓库所有者，例如 suntowerlee-gif
//   REPO_NAME      - 存放报告的私有仓库名，例如 service-reports-data
//                    （必须与发布网站的公开仓库分开，保护客户签名等隐私信息）
//                    (must be separate from the public Pages repo, to keep
//                    customer/signature data out of the public site repo)
//   REPO_BRANCH    - 分支名，例如 main
//   APP_TOKEN      - 一个自定义的共享口令（不是GitHub密钥），客户端请求头
//                    携带它，用于避免陌生人调用此接口向仓库灌垃圾数据。
//                    即使泄露，最坏后果也只是有人能提交垃圾文件到这一个
//                    私有仓库，不会泄露GitHub账号本身的任何权限。
//                    A custom shared secret (NOT a GitHub credential) the
//                    client sends in a header, just to stop strangers from
//                    hitting this endpoint. Even if leaked, the worst case
//                    is spam files in this one private repo — no GitHub
//                    account access is exposed.
// ============================================================================

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });
    if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

    const appToken = request.headers.get("X-App-Token");
    if (!appToken || appToken !== env.APP_TOKEN) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "invalid json body" }, 400);
    }

    const { reportNo, files } = body || {};
    if (!reportNo || !Array.isArray(files) || files.length === 0) {
      return json({ ok: false, error: "invalid payload: reportNo and files[] required" }, 400);
    }
    // 简单校验路径，防止越权写入仓库任意位置 / basic path check to stop writing outside reports/
    for (const f of files) {
      if (!f.path || !f.contentBase64 || !f.path.startsWith("reports/")) {
        return json({ ok: false, error: "invalid file entry (path must start with reports/)" }, 400);
      }
    }

    try {
      for (const f of files) {
        await putFile(env, f.path, f.contentBase64, `Add service report ${reportNo}`);
      }
      return json({ ok: true, reportNo });
    } catch (e) {
      return json({ ok: false, error: String((e && e.message) || e) }, 500);
    }
  }
};

async function putFile(env, path, contentBase64, message) {
  const url = `https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}/contents/${encodeURIComponent(path).replace(/%2F/g, "/")}`;

  // 幂等：若文件已存在（例如上一次同步中途失败后重试），先取sha再覆盖更新，避免报错
  // Idempotent: if the file already exists (e.g. retry after a partial failure),
  // fetch its sha first and include it so the update overwrites cleanly.
  let sha;
  const getResp = await fetch(`${url}?ref=${encodeURIComponent(env.REPO_BRANCH)}`, { headers: ghHeaders(env) });
  if (getResp.status === 200) {
    const data = await getResp.json();
    sha = data.sha;
  }

  const putResp = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(env), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      content: contentBase64,
      branch: env.REPO_BRANCH,
      ...(sha ? { sha } : {})
    })
  });

  if (!putResp.ok) {
    const t = await putResp.text();
    throw new Error(`GitHub PUT ${path} failed (${putResp.status}): ${t.slice(0, 300)}`);
  }
}

function ghHeaders(env) {
  return {
    "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
    "User-Agent": "service-report-sync-worker",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
}

function corsHeaders() {
  return {
    // 建议部署后把 * 收紧为你的 GitHub Pages 实际域名，例如：
    // https://suntowerlee-gif.github.io
    // Recommended: after deploying, tighten * to your actual GitHub Pages origin.
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-App-Token"
  };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders() }
  });
}
