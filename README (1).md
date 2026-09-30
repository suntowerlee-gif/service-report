# 静默同步到GitHub — 部署步骤（已按您的仓库信息定制）

签字生成的报告要"工程师手机联网后自动、静默地"备份进一个GitHub仓库，但手机端（公开的GitHub Pages网站）绝不能直接持有任何能写入GitHub的密钥——任何人打开网址、查看网页源码，就能拿到这个密钥，从而获得你仓库的写入权限。

解决办法：中间加一层免费的 **Cloudflare Worker**。它替工程师的手机保管GitHub密钥，手机只知道Worker的网址和一个普通口令（不是GitHub密钥，泄露的最坏后果只是有人能往下面这个专用仓库里灌垃圾文件，不会危及你的GitHub账号）。

整个过程配置一次即可，之后工程师完全无感：签完字，手机联网时自动同步；离线时先存本地，下次联网自动补传；同步状态会在"历史"列表里用小徽标显示（☁已同步 / ⏳待同步）。

您已经建好了两个仓库、也已有Cloudflare账号，下面步骤直接按您的实际信息写好了，照抄即可：

- 公开网站仓库（GitHub Pages，已有，不用动）：`suntowerlee-gif/service-report`
- 私有报告仓库（存签字报告，已建好）：`suntowerlee-gif/servicereportstore`
- APP_TOKEN（已为您生成好，`js/sync-config.js` 里也已经填好了这个值）：
  ```
  tK1HVjj3eZfv3tANdHFRGf9plWfHitzNZ6mUXsUf
  ```

## 第一步：确认私有仓库的默认分支名

打开 https://github.com/suntowerlee-gif/servicereportstore ，看一眼默认分支叫什么（新建的仓库一般是 `main`，如果是 `master` 请在下面第三步第4点把 REPO_BRANCH 改成实际的名字）。

## 第二步：生成一个"细粒度"GitHub令牌，只授权这一个私有仓库

1. GitHub 头像 → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token。
2. Repository access 选择 "Only select repositories"，只勾选 `servicereportstore`（**不要**勾选 `service-report` 这个公开仓库）。
3. Permissions 里只给 **Contents: Read and write**，其他都不要给。
4. 生成后复制这个令牌（形如 `github_pat_xxxx`），只会显示一次，先存到安全的地方（比如密码管理器），下一步要填到Worker里。

## 第三步：部署Cloudflare Worker

1. 打开 https://dash.cloudflare.com ，登录您已有的账号。
2. 左侧菜单 Workers & Pages → Create → Create Worker。名字随意，例如 `service-report-sync`，点 Deploy 先生成一个默认页面。
3. 点进这个Worker → Edit code（或 Quick edit），把本项目 `cloudflare-worker/worker.js` 的全部内容复制粘贴进去，替换默认代码，点 Save and deploy。
4. 回到Worker详情页 → Settings → Variables and Secrets，新增以下变量（**GITHUB_TOKEN 和 APP_TOKEN 请选择 "Encrypt" 加密保存**，直接照抄下表）：

   | 变量名 | 值 | 是否加密 |
   |---|---|---|
   | GITHUB_TOKEN | 第二步生成的 `github_pat_xxxx` | 是，加密 |
   | REPO_OWNER | `suntowerlee-gif` | 否 |
   | REPO_NAME | `servicereportstore` | 否 |
   | REPO_BRANCH | `main`（如果第一步看到的不是main，改成实际的） | 否 |
   | APP_TOKEN | `tK1HVjj3eZfv3tANdHFRGf9plWfHitzNZ6mUXsUf` | 是，加密 |

5. 保存后，Worker会自动重新部署。记下Worker的访问地址，形如：
   `https://service-report-sync.你的子域名.workers.dev`

## 第四步：把Worker地址填进PWA项目

打开本项目 `js/sync-config.js`（APP_TOKEN已经帮您填好了，只需要填这一行）：

```js
const SYNC_CONFIG = {
  endpoint: "https://service-report-sync.你的子域名.workers.dev",  // ← 填第三步第5点拿到的地址
  appToken: "tK1HVjj3eZfv3tANdHFRGf9plWfHitzNZ6mUXsUf"  // 已填好，不用改
};
```

保存后，把这一份新的 `js/sync-config.js` 上传/推送覆盖到 `suntowerlee-gif/service-report` 这个网站仓库里原来的同名文件，GitHub Pages会自动更新。工程师手机上的App下次打开时会拉到新版本（PWA离线缓存机制会检测更新）。

## 验证

找一台手机（或电脑浏览器）打开发布好的网址，走一遍填表签字流程。签完字后，去 https://github.com/suntowerlee-gif/servicereportstore 的 `reports/` 目录刷新看看，应该能看到新增的 `报告编号.json` 和 `报告编号.pdf` 两个文件。App里"历史"列表对应报告旁边也会显示"☁已同步"。

## 关于安全性的说明

- 手机端代码里唯一暴露的是上面这个 APP_TOKEN 和Worker网址，不是GitHub密钥本身。即使有人从网页源码里看到这个口令，最多只能往 `servicereportstore` 这一个私有仓库的 `reports/` 目录里提交文件（Worker代码里做了路径限制），拿不到您GitHub账号的其它任何权限，也看不到仓库里已有的内容。
- 如果担心被滥用刷垃圾文件，可以在 Cloudflare Worker 的 Settings 里额外开启 Rate Limiting（免费额度内可用），或随时更换 APP_TOKEN（改一下Worker的环境变量、再改一下 `js/sync-config.js` 里的对应值重新发布即可，工程师无感）。
- 建议部署验证成功后，把 `worker.js` 里的 `Access-Control-Allow-Origin: "*"` 改成 `"https://suntowerlee-gif.github.io"`，这样就只有您自己这个网站能调用这个Worker了（改完需要在Cloudflare重新 Save and deploy 一次）。

## 这个功能不是必须的

如果暂时不想折腾这一套，把 `js/sync-config.js` 里的 `endpoint` 留空即可——整个App其余功能完全不受影响，工程师照常签字生成报告、手动导出转发、自行上传CRM，和没有这个功能时完全一样。
