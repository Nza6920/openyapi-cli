# openyapi-cli

**简体中文** | [English](README.en.md)

面向开发者、AI Agent 和 CI 的 YApi OpenAPI 命令行客户端。它覆盖约定的 6 个查询端点和 5 个写入/导入端点，默认输出稳定 JSON，并为写请求提供显式安全边界。

## 版本信息

- 当前版本：`0.1.1`（首个稳定版本为 `0.1.0`）
- npm 包名：`openyapi-cli`
- 可执行命令：`openyapi`
- 最低运行时：Node.js 22
- 已验证运行时矩阵：Node 22、Node 24；`engines.node >=22` 不表示所有未来 Node 主版本都已经验证

`0.1.1` 增加 Agent Skill 安装器。`0.1.0` 已公开发布，其真实 YApi 只读验收证据见 [Sprint 3 验收记录](docs/acceptance/sprint3.md)。

## 快速开始

从 registry 安装或临时执行：

```sh
npm install --global openyapi-cli@0.1.1
openyapi --version
openyapi info

npx --package openyapi-cli@0.1.1 openyapi --version
```

创建 profile，通过 stdin 保存 token，再执行只读查询：

```sh
openyapi config set default \
  --base-url https://yapi.example.com \
  --project-id 123
printf '%s\n' "$YAPI_TOKEN" | openyapi config token set default --stdin
openyapi project get --profile default
```

示例中的地址和项目 ID 是占位值；token 不应写入命令参数、仓库或日志。

仓库提供 [openyapi Agent Skill](.agents/skills/openyapi/SKILL.md)，指导 Agent 使用 CLI 查询项目、分类和接口，以及执行写入、导入与写后核对。`0.1.1` 包含该 Skill，可运行：

```sh
npx openyapi-cli@latest install
```

安装器先提示选择范围（当前项目或当前用户），再选择一个或多个 Agent：Codex、OpenCode、General。对应的项目目录为 `.codex/skills`、`.opencode/skills`、`.agents/skills`；用户级目录为 `~/.codex/skills`、`~/.config/opencode/skills`、`~/.agents/skills`。从 npx 缓存交互运行时，还会询问是否将同版本 CLI 全局安装，以便之后直接运行 `openyapi`。非交互环境可传入 `--agent codex,general --scope project`，并用 `--install-cli` 显式安装全局 CLI；项目范围默认写入当前目录，也可指定 `--project-dir <path>`。相同内容重复安装不修改文件；目标已有不同内容时需显式 `--force`。全局安装 CLI 后也可运行 `openyapi install`，`openyapi skill install` 是等价入口。Skill 安装不连接 YApi。普通 npm 安装本身不会弹菜单。

## 命令参考

全局选项为 `--format json|table`（默认 `json`）和 `--version`。`--profile`、`--base-url`、`--project-id`、`--timeout-ms` 等远端选项可放在相应子命令后。

| 范围 | 命令 |
| --- | --- |
| 本地元数据 | `openyapi info` |
| Profile | `config set/show/list/delete` |
| Token | `config token set --stdin`、`config token unset` |
| 查询 | `project get`、`category list`、`interface get/list/tree` |
| 写入 | `category create`、`interface create/save/update` |
| 导入 | `import --file|--stdin|--url --type TYPE [--merge normal|good|merge]` |

查询列表默认 `--page 1 --limit 10`；`--all` 会验证分页总数、页数和重复 ID 后再一次性输出。命令与 11 个 YApi 端点的准确映射见 [API 范围](docs/api-scope.md)。

## 配置、输出与错误

非敏感配置优先级是“命令参数 > 环境变量 > profile”；profile 可由 `--profile` 或 `OPENYAPI_PROFILE` 选择。CI 通常使用 `OPENYAPI_BASE_URL`、`OPENYAPI_PROJECT_ID`、`OPENYAPI_TOKEN`，不落盘保存 token。

显式设置 `XDG_CONFIG_HOME` 时优先使用它；否则 Linux 使用 `~/.config`，Windows 使用 `APPDATA`，macOS 使用 `~/Library/Application Support`。本地 token 只能通过 stdin 主动保存，`show`/`list` 不显示 token，业务输出和错误会递归脱敏当前 token。完整规则以 [配置与认证约定](docs/design.md#配置与认证迭代-1-实现) 为准。

成功时 stdout 输出一个 JSON 值；`--format table` 提供人工摘要。失败时 stdout 为空，stderr 为稳定结构：

```json
{"error":{"code":"CONFIG_ERROR","message":"Missing token configuration."}}
```

用法错误退出码为 2，执行错误为 1，成功为 0。稳定 `error.code` 包括 `USAGE_ERROR`、`CONFIG_ERROR`、`PROJECT_MISMATCH`、`NETWORK_ERROR`、`TIMEOUT_ERROR`、`HTTP_ERROR`、`YAPI_ERROR`、`RESPONSE_ERROR`、`INTERNAL_ERROR`；权威定义见 [输出与退出码](docs/design.md#输出与退出码)。

## 写入、导入与安全边界

JSON 写入必须在 `--file` 和 `--stdin` 中二选一；导入在 `--file`、`--stdin` 和 `--url` 中三选一。本地输入支持 UTF-8（有/无 BOM）和带 BOM 的 UTF-16LE。

```sh
openyapi category create --file "./inputs/中文 category.json"
openyapi interface create --file interface.json
openyapi interface save --stdin < interface.json
openyapi interface update --file update.json
openyapi import --file openapi.json --type swagger --merge normal
openyapi import --url https://internal.example/openapi.json --type swagger --merge good
openyapi import --file openapi.json --type swagger --merge merge --allow-overwrite
```

所有写入先核对项目，update 还核对目标接口归属。顶层 `token` 被拒绝，输入中的 `project_id` 必须匹配配置。POST 从不自动重试；超时或断连表示结果未知，必须先读回服务端状态再决定下一步。`merge` 模式必须显式提供 `--allow-overwrite`，但不表示删除输入中未出现的接口。

`--type` 是目标 YApi 的服务端插件名，不由 CLI 固定支持范围。当前不承诺完整 OpenAPI 3 兼容。PowerShell 5.1/7 的 UTF-8 stdin 设置和固定验收输入见 [Sprint 2 验收记录](docs/acceptance/sprint2.md)。

## 兼容性与验收状态

契约基线固定为官方 YMFE/yapi tag `v1.12.0`、commit `f856193ded851326a9aea19ff28d1c20c653bbab`；该 tag 的 package version 仍为 1.11.0。Sprint 2 的专用部署前端显示 `1.10.2`，且其 Swagger 插件忽略 `basePath`。这两类证据不能推广为所有 YApi fork 均兼容。

Linux、Windows、macOS × Node 22/24、fixture、真实 tarball、public registry 和真实 YApi 是分开的证据层。当前逐层状态见 [Sprint 3 兼容性与验收记录](docs/acceptance/sprint3.md)；未完成项保持 `pending`，不会预写为通过。

## 开发、打包与发布

```sh
npm ci
npm run check
npm run test:package
npm pack --json
```

`check` 执行类型检查、构建和编译后 CLI 黑盒测试。`test:package` 从真实 tarball 在临时目录只安装生产依赖，再验证包内容、入口、配置/脱敏、fixture 请求及失败契约。首次发布 workflow、人工审批、未知发布结果和发布后收尾见 [发布手册](docs/releasing.md)。实现 workflow 或通过本地检查本身不授权 npm 发布。

更多资料：[CHANGELOG](CHANGELOG.md) · [技术选型与行为约定](docs/design.md) · [迭代计划](docs/roadmap.md)

MIT License。本项目是独立客户端，与 YApi 官方项目无隶属关系。
