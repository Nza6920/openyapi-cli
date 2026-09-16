# 迭代计划

依赖顺序：迭代 0 → 迭代 1 → 迭代 2 → 迭代 3。按验收结果推进，不用固定工期掩盖实际服务端兼容性未知。每轮先落实该轮的命令参数和响应契约，再实现与验收。

## 迭代 0：工程骨架（本次交付）

交付：

- TypeScript/ESM、Commander、npm lockfile、Node.js 22/24 CI 配置。
- 帮助、版本、本地 info、JSON/table 输出、错误退出码。
- MIT、README、技术选型、11 个端点映射、本迭代计划。
- tarball 白名单检查及隔离安装入口验证。

验收：`npm ci`、`npm run check`、`npm run test:package` 成功；安装包无需开发依赖即可启动。远程 CI 运行结果与本地检查分开报告。

本地验收记录（2026-09-12）：Node 24.13.1 下完成 npm ci；Node 22.23.2 与 24.13.1 下均通过类型检查、构建、5 项 CLI 黑盒测试（无跳过）及真实 tarball 隔离安装检查。包内容共 9 个文件，安装后的命令入口可运行。GitHub CI 尚未在远程运行。

## 迭代 1：配置、认证和全部查询

前置：固定官方 YApi tag/commit 作为契约基线；准备可读的验收实例及项目 token。实例凭据留在本地，不写入仓库。

交付：

- 命名 profile、环境变量覆盖、显式本机 token 存储与脱敏查看。
- 原生 fetch 客户端：URL 组合、token 注入、超时、HTTP/JSON/errcode 检查。
- project get、category list、interface get/list/tree，覆盖 6 个 GET 端点。
- 分页参数、单页默认行为和显式全量读取的边界；表格呈现与稳定 JSON 响应契约。

验收：

- 本地 HTTP fixture 检查真实请求 method/path/query，及 HTTP 失败、业务失败、无效 JSON、超时。
- profile/环境变量优先级、多环境隔离、缺少配置、token 不出现在 stdout/stderr。
- 分页的空页与边界、不丢页不重复；协议未知时明确报错。
- 对基线实例逐项验证 6 个查询端点，记录版本及脱敏证据。

实现状态（2026-09-12）：已实现 profile/token 生命周期、配置优先级、原生 fetch、项目身份预检、六个 GET、单页与 `--all` 分页、JSON/table 和稳定错误分类。编译后 CLI + 本地 HTTP fixture 覆盖请求映射、失败、脱敏和分页异常。契约基线固定为官方 v1.12.0（commit `f856193ded851326a9aea19ff28d1c20c653bbab`）；该 tag 的 package.json 版本仍为 1.11.0。

真实验收状态：用户已确认迭代 1 真实实例验收通过；仓库未保存该次的实例版本与脱敏证据，不补写未知细节。远程 GitHub CI 结果仍需与本地检查分开确认。

## 迭代 2：写入与导入

依赖：迭代 1 的认证、错误处理与查询验收通过；写入验收在专用测试项目执行。

交付：

- category create、interface create/save/update、import，覆盖剩余 5 个 POST 端点。
- JSON 文件/stdin 输入与必要参数校验；按端点要求发送 JSON 或 form body。
- import 支持文档的 type、json/url、normal/good/merge；本地文件转换为 json 字符串传给服务端。
- 完全覆盖要求 --allow-overwrite；非交互执行；写请求不自动重试。

验收：

- 本地 fixture 验证请求编码、save 与 update 的不同语义、错误响应和超时后无重试。
- 缺少覆盖标志、无效 JSON 或冲突输入时请求计数为零。
- 测试项目中新增、修改与三种导入模式均做后读核对；固定输入与脱敏预期结果。
- 明确服务端实际支持的导入格式，不以文件扩展名代替兼容性判断。

实现状态（2026-09-15）：五个 POST 命令、文件/stdin/URL 输入、UTF-8/UTF-16LE 解码、项目与目标归属预检、覆盖授权、稳定输出、脱敏与不重试已实现。编译后 CLI fixture 与真实 tarball 隔离安装检查覆盖全部写入映射；GitHub Actions run 34921136369 已在 Node 22/24 的 Linux 与 Windows 上通过 check 和 test:package，两个 Windows job 均通过 PowerShell 5.1/7 安装后流程及失败退出契约。

验收状态（2026-09-15）：专用私有测试项目已完成分类新增、interface create、save 新增与更新、按 ID update，以及 swagger normal/good/merge 三种导入的逐步写后核对；未自动重试、删除、补偿或回放数据。实例前端构建证据为版本 1.10.2，部署的 swagger 插件忽略 fixture `basePath` 并将三份文档映射到 `/items`。Windows、远程 CI 与真实实例的分层证据见 [Sprint 2 acceptance](acceptance/sprint2.md)。

## 迭代 3：兼容验收与 npm 首次发布

依赖：全部 11 个端点完成验收，并明确文档与目标版本差异。

交付：

- 开发者与 Agent/CI 使用示例、命令参考、错误码、配置路径、导入限制及版本兼容表。
- Node.js 22/24 完整 CI；目标操作系统安装烟测；真实 tarball 生产依赖安装验证。
- 版本与变更记录；真实 repository/bugs/homepage 元数据；发布账号和包名检查。
- 发布 npm 后在新目录从 registry 安装，再验收版本和核心命令。

实现状态（2026-09-16）：版本与 lockfile 已收敛为 `0.1.0`，补齐公开 npm 元数据、CHANGELOG、中英文 Quick Start/命令与兼容说明；真实 tarball 门禁覆盖包内容、production-only 安装、CLI/config/fixture/失败契约。常规 CI 已扩展为 Linux、Windows、macOS × Node 22/24，并保留 Windows PowerShell 5.1/7 专项。首发 workflow 只响应 `workflow_dispatch`、绑定 `npm-production` Environment、固定 `main`/`openyapi-cli@0.1.0`/`next`；首次发布及 public-registry 独立验收已完成。publish 后即时回读曾受 registry 传播延迟影响，现改为有界回读轮询且不重发版本。

发布步骤：`v0.1.0` tag、首次 publish 与 provenance 已发生，#21 已从 public registry 独立验收；但 #20 的原 workflow 因即时 registry 传播延迟结束为 failure，故本票仍未完成。必须先从 `main` 手动运行受 `npm-production` 保护的只读 recovery workflow，验证 tag/source、tarball integrity、`next` 与 provenance，成功后才可关闭 #20。公开 registry 当前同时返回 `next/latest=0.1.0`，而 workflow 未执行 dist-tag 操作，因此 #22 需要人工确认并记录该实际状态后再处理 Trusted Publishing、一次性 token 撤销、真实实例只读验收与 GitHub Release；不得重建或重发 tarball。

完成标准：registry 可安装，文档样例可执行，兼容性与已知限制可查，生产安装无需本地 TypeScript 或源代码构建；各层证据状态见 [Sprint 3 验收记录](acceptance/sprint3.md)，任何未完成层保持 pending。
