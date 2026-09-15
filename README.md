# openyapi-cli

**简体中文** | [English](README.en.md)

面向开发者、AI Agent 和 CI 的 YApi OpenAPI 命令行客户端。

Sprint 2 的配置、六个只读端点和五个写入/导入端点已实现，并分别通过本地 HTTP fixture、真实 tarball、Windows/远程 CI 及专用 YApi 项目写后核对。当前仍是未发布的 `0.1.0-alpha.0`。

## 本地开始

需要 Node.js >=22；开发默认 Node 24，CI 矩阵为 Node 22/24。

```sh
npm ci
npm run build
node dist/main.js --help
node dist/main.js info
```

## 配置与认证

创建 profile 后，通过 stdin 显式保存 token：

```sh
node dist/main.js config set default \
  --base-url https://yapi.example.com \
  --project-id 123
printf '%s\n' "$YAPI_TOKEN" | node dist/main.js config token set default --stdin

node dist/main.js config show default
node dist/main.js config list
node dist/main.js config token unset default
node dist/main.js config delete default
```

`show`、`list` 和 token 操作不会显示 token，`config set` 更新连接信息时会保留已有 token。各操作系统的配置路径、Unix 权限和完整优先级以 [配置与认证约定](docs/design.md#配置与认证迭代-1-实现) 为准。CI 可不写文件，直接设置：

```sh
export OPENYAPI_BASE_URL=https://yapi.example.com
export OPENYAPI_PROJECT_ID=123
export OPENYAPI_TOKEN=...
node dist/main.js project get
```

CLI 没有持久 active profile，也不提供 token 命令行参数。

## 查询命令

```sh
node dist/main.js project get [--profile NAME]
node dist/main.js category list [--profile NAME]
node dist/main.js interface get --id ID [--profile NAME]
node dist/main.js interface list [--category-id ID] [--page PAGE] [--limit LIMIT]
node dist/main.js interface list [--category-id ID] --all [--limit LIMIT]
node dist/main.js interface tree [--profile NAME]
```

各查询也接受 `--base-url`、`--project-id` 和 `--timeout-ms`；默认每个请求超时 30000ms。只有 `interface get` 和带 `--category-id` 的 `interface list` 可在不配置 project ID 时执行。配置了 project ID 时，客户端先调用 `project get` 核对 token 实际对应的项目；不匹配则不发送目标查询。

默认输出为单个 JSON 值；`--format table` 输出摘要，完整 schema 保留在 JSON 中。响应格式见 [输出约定](docs/design.md#输出与退出码)，分页默认值、`--all` 完整性检查和并发限制见 [查询约定](docs/design.md#配置与认证迭代-1-实现)。

## 错误与退出码

失败时 stdout 为空，stderr 为：

```json
{"error":{"code":"CONFIG_ERROR","message":"Missing token configuration."}}
```

错误码、退出码和传输失败策略以 [输出与退出码](docs/design.md#输出与退出码) 为权威说明；所有失败均保持 stdout 为空，且诊断优先脱敏 token。

## 写入与导入

JSON 写入命令必须在 `--file` 和 `--stdin` 中二选一；导入则在 `--file`、`--stdin` 和 `--url` 中三选一。文件和 stdin 支持 UTF-8（有或无 BOM）以及带 BOM 的 UTF-16LE。

```sh
openyapi category create --file "./inputs/中文 category.json"
openyapi interface create --file interface.json
openyapi interface save --stdin < interface.json
openyapi interface update --file update.json
openyapi import --file openapi.json --type swagger --merge normal
openyapi import --url https://internal.example/openapi.json --type swagger --merge good
openyapi import --file openapi.json --type swagger --merge merge --allow-overwrite
```

`category create`要求 `name`；`interface create/save` 要求 `title`、`path`、`method`、`catid` 且拒绝 `id`；`interface update` 要求 `id` 并只更新所提供字段。顶层 `token` 始终被拒绝，`project_id` 必须与配置相符；导入文档内的同名业务字段不是认证覆盖。所有写入先核对项目，update 还会核对目标接口归属。POST 不自动重试；超时或断连后结果未知。

`--type` 是服务端插件名（示例为 `swagger`），支持情况由目标 YApi 实例决定。`merge` 模式不表示删除输入中未出现的全部接口，也不承诺完整 OpenAPI 3 兼容。

### PowerShell 编码

Windows PowerShell 5.1 在把文本传给 native 命令前需显式设置 UTF-8；设置只影响当前进程，不修改机器执行策略：

```powershell
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
Get-Content -Raw -Encoding UTF8 '.\inputs\中文 api.json' | openyapi interface save --stdin
```

PowerShell 7：

```powershell
$OutputEncoding = [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Get-Content -Raw -Encoding utf8 '.\inputs\中文 api.json' | openyapi interface save --stdin
```

如果 shell 在传给 CLI 前已丢失字符，CLI 无法恢复。更完整的验收状态和固定输入见 [Sprint 2 验收记录](docs/acceptance/sprint2.md)。

## 开发与验收

```sh
npm run check
npm run test:package
```

`check` 执行类型检查、构建和编译后 CLI 黑盒测试。`test:package` 生成真实 tarball，在临时目录仅安装运行时依赖，并通过安装入口验证全部五个写命令。

兼容契约固定为官方 YMFE/yapi tag `v1.12.0`、commit `f856193ded851326a9aea19ff28d1c20c653bbab`（该 tag 的 package version 仍为 1.11.0）。Sprint 2 已在前端版本证据为 1.10.2 的专用实例完成真实写入验收；该实例的 `swagger` 插件忽略输入 `basePath`。源码基线、实例结果及 CI 证据详见 [Sprint 2 验收记录](docs/acceptance/sprint2.md)。项目尚未发布到 npm。

## 范围与计划

- [技术选型与行为约定](docs/design.md)
- [11 个端点与命令映射](docs/api-scope.md)
- [迭代计划与验收标准](docs/roadmap.md)

MIT License。本项目是独立客户端，与 YApi 官方项目无隶属关系。
