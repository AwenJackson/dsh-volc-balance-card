# dsh-volc-balance-card

[![dsh.so risk](https://cdn.dsh.so/badge/dsh-volc-balance-card.svg)](https://www.dsh.so/artifact/dsh-volc-balance-card/?ref=badge)

[English](./README.md) · [更新记录](./CHANGELOG.md)

一个 DeepSeek Harness（DSH）插件：把**火山引擎的余额**直接放到侧边栏底部常驻——账户充值余额 + 方舟 **Coding Plan / Agent Plan** 套餐窗口，后台定时刷新。

和别的方舟额度小部件不同，这里显示的是 Billing OpenAPI（`QueryBalanceAcct`）返回的**真实账户余额**，也就是控制台费用中心看到的那个数字，而不是只有套餐额度。

```
┌ 侧边栏 ────────────────┐
│ …                      │
│ ┌────────────────────┐ │
│ │ 火山引擎 · ¥80.10   │ │  ← 折叠胶囊，点一下展开
│ └────────────────────┘ │
└────────────────────────┘
```

展开后的卡片：

| 行 | 数据源 | 内容 |
| --- | --- | --- |
| 火山引擎余额 | `billing.volcengineapi.com` · `QueryBalanceAcct` | 可用余额、现金余额、欠费、冻结金额、账号 ID |
| 方舟 Coding 套餐 | `open.volcengineapi.com` · `GetCodingPlanUsage` | 滚动 / 周 / 月三个窗口及重置时间 |
| 方舟 Agent 套餐 | `open.volcengineapi.com` · `GetAFPUsage` | Agent Plan 窗口；账号没订阅时显示中性的 **未开通** 标签，不是报错 |

余额按阈值变色（默认：低于 ¥10 危险、低于 ¥20 预警、≥ ¥50 健康），套餐按用量百分比变色（默认 ≥70% 预警、≥90% 危险）。

## 安装

### 从 DSH 插件市场安装（推荐）

在 DSH 桌面端打开插件市场，搜索 `dsh-volc-balance-card` 安装。条目发布在 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 精选列表中，市场只允许从该列表安装。

### 从 Release 安装

从最新的 GitHub Release 下载 `dsh-volc-balance-card.tgz`，用 DSH profile 的插件安装入口按 `file:` 形式安装即可。Release 资产名故意不带版本号，这样精选列表里的 `tarball:` 链接在每次发版后都不会 404。

装好后卡片直接出现在侧边栏底部，live profile 不需要重启。

## 配置 AK/SK

卡片不读取浏览器登录态，也不需要控制台密码，用的是 API 密钥对签名。

1. 在火山引擎控制台创建访问密钥（AK / SK），给它授 Billing 的只读权限即可，`BillingReadOnlyAccess` 就够。
2. 在 DSH 里点卡片的 ⚙，或者点卡片里提示的 **配置 AK/SK** 按钮。
3. 填 **Access Key ID** 与 **Secret Access Key**，点 **保存并测试**。

保存时宿主会立刻调一次 `QueryBalanceAcct` 验证：AK 写错、没有 Billing 权限、网络不通都会当场报出来，并且不会落盘。验证通过才写入，余额行随即出现，不用刷新页面。

几个细节：

- 浏览器侧永远只能拿到掩码后的 AK（`AKLT****mMTE`），SK 不出宿主进程。
- 凭证存在 DSH 标准凭据库（`~/.dsh/.credentials.yaml`）的 `VOLC_ACCESS_KEY` / `VOLC_SECRET_KEY`，所以如果你已经用别的 DSH 插件配过同一对密钥，这里可以直接用。
- **清除** 会删掉两个值，余额行随之消失，卡片重新显示配置入口。

## 设置

点卡片右上角 ⚙：

| 设置 | 行为 |
| --- | --- |
| AK/SK | 配置 / 测试 / 清除火山引擎密钥对 |
| 显示供应商 | 逐行开关（余额、Coding 套餐、Agent 套餐），只影响前端显示 |
| 刷新间隔 | 15s / 30s / 60s / 120s / 300s，或跟随 bundle 默认（60s） |
| 胶囊显示 | 折叠胶囊高亮哪个窗口（`auto` / `rolling` / `weekly` / `max`） |
| 预警阈值 | 覆盖预警线（余额按 ¥，用量按 %） |
| 恢复默认 | 重置本机显示设置 |

余额响应按凭证缓存 30 秒，所以即使设成 15s 刷新也不会对 Billing API 造成压力。

bundle 默认值写在 `cordis.patch.yml`：刷新间隔与余额阈值。三行默认全部显示——Agent Plan 行在没订阅时是一条中性的「未开通」提示，不会变成一条红色报错；订阅之后同一行会自动变成 5h / 周 / 月三条用量窗口，不用改配置。

## 网络与隐私

插件只访问下面两个端点，且都从宿主进程发起：

| 方法 | 主机 | Action |
| --- | --- | --- |
| GET | `billing.volcengineapi.com` | `QueryBalanceAcct`（版本 `2022-01-01`，区域 `cn-north-1`） |
| POST | `open.volcengineapi.com` | `GetCodingPlanUsage`、`GetAFPUsage`（服务 `ark`，版本 `2024-01-01`） |

没有遥测、没有统计上报、没有第三方端点。浏览器侧只收到归一化后的视图（金额、百分比、重置时间、掩码 AK）。

## 兼容性

- DSH `>=0.2.0-rc.1 <0.3.0-0`（见 `engines.dsh` 与 `dsh.compatibility.dsh`）。
- 插件绑定的 DSH 包（宿主侧的 `@deepseek-ai/dsh-credentials`，以及 `dsh.client.inject` 里的四个客户端模块）都在 `peerDependencies` 里用同一区间声明，方便注册表与工具从 manifest 直接读到作者声明的范围。它们标记为 optional：这些包由 DSH 运行时提供，不由 npm 安装。
- 实际跑过的版本：`0.2.2-rc.1`、`0.2.2-rc.2`、`0.2.2-rc.3`（记录在 `dsh.compatibility.dshReleases`）。
- Node.js `>=20`。
- 桌面端与 Web profile 通用；卡片注册在 `sidebar.footer.action` 插槽。

## 这是一个 fork

`dsh-volc-balance-card` fork 自 [dsh-quota-panel](https://github.com/wenzetan/dsh-quota-panel)（MIT），保留了它的骨架——签名、catalog、RPC 通道、设置界面——但产品形态不同：

- **新增** 火山引擎账户余额行（`QueryBalanceAcct`）与余额阈值配色，上游只有套餐额度。
- **新增** 卡片内 AK/SK 配置流程，宿主侧验证后才落盘，不用再手改凭据文件。
- **移除** ChatGPT/Codex 账号区块和代理区块——在不支持的地区只会产出一条红色报错，跟这张卡片也没有关系。
- **改为** 侧边栏底部固定卡片（附带折叠胶囊），不再是可拖拽的浮层。

## 开发

```bash
npm install          # 只装 TypeScript
npm run build        # src/*.ts -> lib/*.js，并把 src/vendor 复制到 lib/vendor
npm test             # 针对宿主 RPC 面的集成测试
npm run check        # 市场 / npm 发布前检查
npm run set-repo -- <owner>/<repo>   # 填仓库地址并生成市场投稿文件
```

`build` 不做打包：`src/client.ts` 本身就带 `window.__ModuleLoader__.load({ id, factory })` 外壳，编译器产物即可直接加载。`lib/vendor/schemastery.mjs` 是随包内置的上游 `schemastery`（MIT），因为 DSH 运行时不向插件暴露它。

发布流程见 [docs/PUBLISHING.md](./docs/PUBLISHING.md)。

## 许可

MIT，见 [LICENSE](./LICENSE)；上游归属说明在 [NOTICE](./NOTICE)。
