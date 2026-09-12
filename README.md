# openyapi-cli

**简体中文** | [English](README.en.md)

面向开发者、AI Agent 和 CI 的 YApi OpenAPI 命令行客户端。

Sprint 1 的配置、认证和六个只读查询端点已实现并通过本地 HTTP fixture 测试；真实 YApi 实例兼容验收和远程 CI 尚未完成，因此当前仍是未发布的 `0.1.0-alpha.0`。写入与导入属于后续迭代。

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

`show`、`list` 和 token 操作只显示 `configured`/`missing`，不会显示 token。`config set` 更新连接信息时保留已有 token。配置文件位置：

- Linux：`$XDG_CONFIG_HOME/openyapi/profiles.json`，未设置时为 `~/.config/openyapi/profiles.json`
- macOS：`$XDG_CONFIG_HOME/openyapi/profiles.json`，未设置时为 `~/Library/Application Support/openyapi/profiles.json`
- Windows：`%XDG_CONFIG_HOME%\openyapi\profiles.json`，未设置时使用 `%APPDATA%\openyapi\profiles.json`

Unix 下配置目录权限为 `0700`，文件为 `0600`。CI 可不写文件，直接设置：

```sh
export OPENYAPI_BASE_URL=https://yapi.example.com
export OPENYAPI_PROJECT_ID=123
export OPENYAPI_TOKEN=...
node dist/main.js project get
```

选择顺序为 `--profile` > `OPENYAPI_PROFILE` > `default`。非敏感值为命令参数 > 环境变量 > profile；token 为 `OPENYAPI_TOKEN` > profile。没有持久 active profile，也没有 token 命令行参数。

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

默认输出为单个 JSON 值：业务结果放在 `data`，列表的 `pagination` 将服务端 `count`/`total` 映射为 `totalItems`/`totalPages`。`--format table` 输出项目、分类和接口摘要，完整 schema 始终保留在 JSON 中。

单页默认 `page=1`、`limit=10`。`--all` 与 `--page` 互斥，从第 1 页使用数值 limit 逐页读取；重复 ID、总数变化、提前空页或数量不一致会整体失败，不输出部分结果。并发写入或服务端排序不稳定时不提供快照一致性保证。

## 错误与退出码

失败时 stdout 为空，stderr 为：

```json
{"error":{"code":"CONFIG_ERROR","message":"Missing token configuration."}}
```

稳定错误码包括 `USAGE_ERROR`、`CONFIG_ERROR`、`PROJECT_MISMATCH`、`NETWORK_ERROR`、`TIMEOUT_ERROR`、`HTTP_ERROR`、`YAPI_ERROR`、`RESPONSE_ERROR` 和 `INTERNAL_ERROR`。成功退出 0，参数/用法错误退出 2，其他执行失败退出 1。客户端拒绝重定向、不自动重试，并从诊断中脱敏 token。

## 开发与验收

```sh
npm run check
npm run test:package
```

`check` 执行类型检查、构建和编译后 CLI 黑盒测试。`test:package` 生成真实 tarball，在临时目录仅安装运行时依赖并验证入口与包内容，需要访问 npm registry。

兼容契约固定为官方 YMFE/yapi tag `v1.12.0`、commit `f856193ded851326a9aea19ff28d1c20c653bbab`（该 tag 的 package version 仍为 1.11.0）。本地 fixture 不能替代真实实例验收；真实实例版本、六个 GET 结果和脱敏证据仍待提供。项目尚未发布到 npm，也不会在 Sprint 1 执行发布。

## 范围与计划

- [技术选型与行为约定](docs/design.md)
- [11 个端点与命令映射](docs/api-scope.md)
- [迭代计划与验收标准](docs/roadmap.md)

MIT License。本项目是独立客户端，与 YApi 官方项目无隶属关系。
