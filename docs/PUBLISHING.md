# 发布到 DSH 插件市场

DSH 插件市场（dshmarket）**只允许安装 awesome-dsh-plugin 精选列表里的来源**。所以「别人能从市场一键装」= 你的仓库出现在 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 里。列表是人工 PR 审核的，收录后站点与市场通常一天内自动拉到。

## 本仓库当前进度

仓库：[`AwenJackson/dsh-volc-balance-card`](https://github.com/AwenJackson/dsh-volc-balance-card)

| 事项 | 状态 |
| --- | --- |
| 代码推到 GitHub `main`（含 `lib/` 构建产物） | ✅ 已完成 |
| `package.json` 的 `repository` / `homepage` / `bugs` / `author` | ✅ 已指向 `AwenJackson/dsh-volc-balance-card` |
| GitHub topic `dsh-plugin` | ✅ 已加（另加 `dsh`、`deepseek-harness`、`volcengine`、`balance`、`sidebar`） |
| Release `v0.2.3` + 资产 `dsh-volc-balance-card.tgz` | ✅ [已发布](https://github.com/AwenJackson/dsh-volc-balance-card/releases/latest/download/dsh-volc-balance-card.tgz)（`latest/download` 现解析到 0.2.3） |
| 投稿 yml | ✅ `market/AwenJackson__dsh-volc-balance-card.yml`，与上游 `data/plugins/AwenJackson__dsh-volc-balance-card.yml` 一致 |
| 仓库创建满 1 天 | ✅ 仓库创建于 2026-11-13 12:25(+08:00) |
| 提 PR 到 awesome-dsh-plugin | ✅ 已合并：[#15140](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/15140)（2026-11-14） |
| npm 发布 | ⬜ 未发布。**这会影响市场搜索**：`dsh-plugin-catalog` / `dshfind` 的 `index.json` 只收 npm 已发布包，GitHub-only 条目只出现在 README 列表里 |

> 已收录之后不需要再提 PR：列表 yml 用的是 `releases/latest/download/...`，发新 Release 即让所有通过列表安装的人拿到新版本。只有在**改 `url`、分类或描述**时才需要再提一次 PR。

在收录完成之前，任何人都已经可以手动装：下载上面的 tgz，在 DSH 里 `plugin_manager install_bundle` 指向该文件即可（或直接用 `file:` spec）。

## 收录的硬性条件

| 条件 | 本仓库状态 |
| --- | --- |
| `package.json` 声明 `dsh.bundle.patch` | ✅ 已声明（只有 `dsh.client` 不算可安装，这是最常见的被拒原因） |
| 仓库带 GitHub topic `dsh-plugin` | ✅ 已加 |
| 仓库创建满 1 天 | ⏳ 2026-11-14 12:25(+08:00) 之后 |
| 有真实可运行代码（不是空壳/纯依赖聚合） | ✅ |
| 官方 `@deepseek-ai/*` 只能出现在 `peerDependencies` | ✅ 本包不直接依赖任何官方包 |
| npm 已发布包的 `repository` 必须指回被收录的仓库 | ✅ 若发 npm，`repository` 已就位 |
| yml 里**不要**手写 `npm:` 字段 | ✅ 用 `tarball:`，npm 映射由 registry 自动采集 |

> 「仓库满 1 天」是自动 CI 检查，目的是过滤「PR 前几分钟才建好的仓库」。差一点就被打回的话，把活干完再提交即可，重新提交不会有任何负面影响。

## 提 PR 实操（记录：本条已于 2026-11-14 合并，保留作换 owner / 改分类时复用）

需要的材料只有一份文件，已经在 `market/AwenJackson__dsh-volc-balance-card.yml` 里：

```yaml
url: https://github.com/AwenJackson/dsh-volc-balance-card
name: AwenJackson/dsh-volc-balance-card
category: usage
description:
  en: Persistent sidebar card for your Volcengine recharge balance and Ark Coding/Agent plan windows, with in-card AK/SK setup and per-provider toggles.
  zh: 侧边栏常驻卡片，显示火山引擎账户充值余额与方舟 Coding/Agent 套餐窗口，内置 AK/SK 配置与逐项显示开关。
tarball: https://github.com/AwenJackson/dsh-volc-balance-card/releases/latest/download/dsh-volc-balance-card.tgz
```

放到的路径是 `data/plugins/AwenJackson__dsh-volc-balance-card.yml`（`<owner>__<repo>.yml`，双下划线分隔）。

方式一（网页）：

1. fork `awesome-dsh-plugin/awesome-dsh-plugin`。
2. 在 fork 里新增上面的文件（GitHub 网页 “Add file → Create new file” 即可）。
3. 发起 PR，标题形如 `Add AwenJackson/dsh-volc-balance-card (usage)`，正文写清差异：fork 自 `dsh-quota-panel`，增量是**账户充值余额行**（Billing `QueryBalanceAcct`）+ **卡片内 AK/SK 配置**（保存前真实探针、失败不落盘、只回掩码）+ **浮层改成侧边栏底部常驻卡片**，并移除了上游的 ChatGPT 与代理区块。

方式二（命令行，需要 `gh` 已登录）：

```bash
gh repo fork awesome-dsh-plugin/awesome-dsh-plugin --clone
cd awesome-dsh-plugin
mkdir -p data/plugins
cp <本仓库>/market/AwenJackson__dsh-volc-balance-card.yml data/plugins/
git checkout -b add-dsh-volc-balance-card
git add data/plugins/AwenJackson__dsh-volc-balance-card.yml
git commit -m "Add AwenJackson/dsh-volc-balance-card"
git push -u origin add-dsh-volc-balance-card
gh pr create --repo awesome-dsh-plugin/awesome-dsh-plugin \
  --title "Add AwenJackson/dsh-volc-balance-card (usage)" \
  --body "Fork of dsh-quota-panel. Adds a real Volcengine account balance row (Billing QueryBalanceAcct), in-card AK/SK setup with probe-before-save, and moves the panel from a floating overlay to a persistent sidebar-footer card. Removes the upstream ChatGPT and proxy blocks."
```

注意事项：

- **不要手改 README**（它由脚本生成），只加 `data/plugins/` 下的文件。
- 不要写 `npm:`，也不要手写 `stars`/`downloads` 这类由 registry 采集的字段。
- `url:` 必须与仓库地址逐字一致（大小写也要一致）。
- fork 被拒的主要原因是看不出与上游的差异，PR 正文里务必写。

## 0. 填仓库地址（换 owner 时重跑）

```bash
npm run set-repo -- <你的GitHub用户名>/dsh-volc-balance-card
```

会改写 `package.json` 的 `repository` / `homepage` / `bugs` / `author`，删掉 `market/` 下旧的 yml，并按新 owner 重新生成投稿 yml。

## 1. 建仓库并推代码

```bash
git init -b main
git add -A
git commit -m "dsh-volc-balance-card 0.2.0"
git remote add origin https://github.com/<owner>/dsh-volc-balance-card.git
git push -u origin main
```

然后在 GitHub 仓库页 **About → Topics** 加上 `dsh-plugin`（也可顺手加 `dsh`、`volcengine`、`deepseek-harness`、`balance`、`sidebar`）。

`lib/` 是构建产物，建议**一起提交**：这样用户即使拿到源码目录也能直接被宿主加载。

## 2. 本地自检

```bash
npm install
npm run build
npm test
npm run check            # 市场/npm 预检
npm pack --dry-run       # 看发出去的 tarball 里有什么
```

`npm run check` 会拦住：缺 `dsh.bundle`、官方包进了 `dependencies`、缺 `dsh-plugin` keyword、`repository` 还是 `OWNER` 占位、`lib/client.js` 没被 `__ModuleLoader__.load` 包裹、`cordis.patch.yml` 没引用包名等。

## 3. 发 npm（可选，自行执行）

包名 `dsh-volc-balance-card` 目前未被占用（`npm view` 返回 404）。**发不发 npm 与能否被收录无关**，不发就靠第 4 节的 Release tarball。

```bash
npm login
npm run check -- --strict   # 占位符也会变成错误
npm publish --access public
```

`prepublishOnly` 已挂 `check-package.mjs --strict`，所以 `npm publish` 会先跑一遍检查。

发布后的常见坑：

- **repository 不一致**：npm 上这一版的 `repository.url` 必须等于被收录仓库地址，否则收录映射失败。
- **版本号不回退**：发过 0.2.0 就不能再发同号，改代码要升 patch。
- **README 显示**：npm 页面用 `README.md`，中文说明放 `README.zh.md`。

## 4. 打 Release（不发 npm 时必做）

在 GitHub 发 Release 并附上预构建的 tgz，投稿 yml 用 `tarball:` 指向它：

```bash
npm run build
npm pack                       # 生成 dsh-volc-balance-card-0.2.0.tgz
# 上传前改名，名字里不要带版本号：
#   dsh-volc-balance-card.tgz
```

URL 固定用 `https://github.com/<owner>/dsh-volc-balance-card/releases/latest/download/dsh-volc-balance-card.tgz`。文件名带版本号的话，下次发版链接就 404 了。

发新版时的顺序：`npm version patch` → `npm run build && npm test` → `npm pack` → 改名 → 先删掉旧 Release 里的同名资产再上传新的（同名资产不能直接覆盖，会报 422）→ `git push --follow-tags`。

## 5. 收录后验证

```bash
curl -s https://awesome-dsh-plugin.com/plugins.json | grep -c volc-balance-card
```

返回 ≥1 就说明进了索引。然后在 DSH 插件市场搜索 `dsh-volc-balance-card` 并安装。市场安装在本机也是走 `plugin_manager install_bundle`，装上后在侧边栏底部出现卡片即成功。

如果索引已经有了但市场里还搜不到，把市场应用（dshmarket）的目录缓存刷一下再试——它每次打开会重新拉 `plugins.json`。

## 排错

| 现象 | 原因 |
| --- | --- |
| PR 被 CI 拒，理由是仓库太新 | 「仓库创建满 1 天」没过，等满 24 小时重新提即可 |
| 市场搜不到 / 拒绝安装 | 还没进精选列表，或列表里 yml 的 `url` 与仓库不完全一致 |
| 安装报 `dsh.bundle` 缺失 | `package.json` 里只有 `dsh.client`，或发布时 `files` 漏了 `cordis.patch.yml` |
| 安装后卡片不出现 | profile 未应用 bundle patch，或 `inject` 的客户端包不匹配当前 DSH 版本 |
| 卡片出现但余额行为空 | 未配 AK/SK，或 AK 缺 Billing 只读权限（卡片内会用 `set-credentials` 的报错说明原因） |
| 余额一直不变 | 余额有 30 秒缓存；改 AK/SK 或点刷新即可重取 |
