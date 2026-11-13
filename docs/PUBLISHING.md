# 发布到 DSH 插件市场

DSH 插件市场（dshmarket）**只允许安装 awesome-dsh-plugin 精选列表里的来源**。所以「别人能从市场一键装」= 你的仓库出现在 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 里。列表是人工 PR 审核的，收录后站点与市场通常一天内自动拉到。

## 收录的硬性条件

| 条件 | 本仓库状态 |
| --- | --- |
| `package.json` 声明 `dsh.bundle.patch` | ✅ 已声明（只有 `dsh.client` 不算可安装，这是最常见的被拒原因） |
| 仓库带 GitHub topic `dsh-plugin` | ⬜ 建仓库后要手动加 |
| 仓库创建满 1 天 | ⬜ 新建仓库当天投 PR 会被打回 |
| 有真实可运行代码（不是空壳/纯依赖聚合） | ✅ |
| 官方 `@deepseek-ai/*` 只能出现在 `peerDependencies` | ✅ 本包不直接依赖任何官方包 |
| npm 已发布包的 `repository` 必须指回被收录的仓库 | ⬜ 填好 `owner/repo` 再发版 |
| yml 里**不要**手写 `npm:` 字段 | ✅ 用 `tarball:` 或让 registry 自动采集 |

## 0. 填仓库地址

```bash
npm run set-repo -- <你的GitHub用户名>/dsh-volc-balance-card
```

会改写 `package.json` 的 `repository` / `homepage` / `bugs` / `author`，并在 `market/` 生成一份可直接复制的投稿 yml。

## 1. 建仓库并推代码

```bash
git init -b main
git add -A
git commit -m "dsh-volc-balance-card 0.2.0"
git remote add origin git+https://github.com/<owner>/dsh-volc-balance-card.git
git push -u origin main
```

然后在 GitHub 仓库页 **About → Topics** 加上 `dsh-plugin`（也可顺手加 `dsh`、`volcengine`、`deepseek-harness`）。

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

## 3. 发 npm（你自己执行）

包名 `dsh-volc-balance-card` 目前未被占用（`npm view` 返回 404）。

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

如果你不想发 npm，就在 GitHub 发 Release 并附上预构建的 tgz，投稿 yml 用 `tarball:` 指向它：

```bash
npm run build
npm pack                       # 生成 dsh-volc-balance-card-0.2.0.tgz
# 改名后再上传，名字里不要带版本号：
#   dsh-volc-balance-card.tgz
```

URL 用 `https://github.com/<owner>/dsh-volc-balance-card/releases/latest/download/dsh-volc-balance-card.tgz`。文件名带版本号的话，下次发版链接就 404 了。

## 5. 投 PR 到 awesome-dsh-plugin

1. fork `awesome-dsh-plugin/awesome-dsh-plugin`。
2. 在新文件 `data/plugins/<owner>__<repo>.yml` 里放下面的内容（`market/` 里已经生成好了，文件名形如 `x__dsh-volc-balance-card.yml`）：

```yaml
url: https://github.com/<owner>/dsh-volc-balance-card
name: <owner>/dsh-volc-balance-card
category: usage
description:
  en: Persistent sidebar card for your Volcengine recharge balance and Ark Coding/Agent plan windows, with in-card AK/SK setup and per-provider toggles.
  zh: 侧边栏常驻卡片，显示火山引擎账户充值余额与方舟 Coding/Agent 套餐窗口，内置 AK/SK 配置与逐项显示开关。
tarball: https://github.com/<owner>/dsh-volc-balance-card/releases/latest/download/dsh-volc-balance-card.tgz
```

3. **不要手改 README**（它由脚本生成），只加 `data/plugins/` 下的文件。
4. PR 描述里写明「fork 自 dsh-quota-panel，增量是账户余额 + AK/SK 配置 + 侧边栏卡片」，fork 被拒的主要原因是看不出与上游的差异。
5. 合法 category 里 `usage` 最贴切（余额/用量查询）。

## 6. 收录后验证

```bash
curl -s https://awesome-dsh-plugin.com/plugins.json | grep -c volc-balance-card
```

然后在 DSH 插件市场搜索 `dsh-volc-balance-card` 并安装。市场安装在本机也是走 `plugin_manager install_bundle`，装上后在侧边栏底部出现卡片即成功。

## 排错

| 现象 | 原因 |
| --- | --- |
| 市场搜不到 / 拒绝安装 | 还没进精选列表，或列表里 yml 的 `url` 与仓库不完全一致 |
| 安装报 `dsh.bundle` 缺失 | `package.json` 里只有 `dsh.client`，或发布时 `files` 漏了 `cordis.patch.yml` |
| 安装后卡片不出现 | profile 未应用 bundle patch，或 `inject` 的客户端包不匹配当前 DSH 版本 |
| 卡片出现但余额行为空 | 未配 AK/SK，或 AK 缺 Billing 只读权限（卡片内会用 `set-credentials` 的报错说明原因） |
