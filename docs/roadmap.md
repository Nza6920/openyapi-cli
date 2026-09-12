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

未完成验收：尚未提供真实实例地址、版本证据和凭据，六个端点的真实实例逐项验收未执行；远程 GitHub CI 结果也需与本地检查分开确认。因此不得仅凭当前实现和 fixture 宣称迭代 1 已完整验收。

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

## 迭代 3：兼容验收与 npm 首次发布

依赖：全部 11 个端点完成验收，并明确文档与目标版本差异。

交付：

- 开发者与 Agent/CI 使用示例、命令参考、错误码、配置路径、导入限制及版本兼容表。
- Node.js 22/24 完整 CI；目标操作系统安装烟测；真实 tarball 生产依赖安装验证。
- 版本与变更记录；真实 repository/bugs/homepage 元数据；发布账号和包名检查。
- 发布 npm 后在新目录从 registry 安装，再验收版本和核心命令。

发布步骤：先完成所有本地/CI 验收和包内容检查，确认发布目标、版本及授权后执行 npm publish。当前任务不发布、不配置发布凭据，也不创建自动发布工作流。

完成标准：registry 可安装，文档样例可执行，兼容性与已知限制可查，生产安装无需本地 TypeScript 或源代码构建。
