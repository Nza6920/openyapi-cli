# 技术选型与行为约定

状态：2026-09-12 经用户确认；迭代 1 已实现并完成本地 fixture 验收，真实实例兼容验收仍待外部条件。

## 已确认的产品边界

- 独立 npm CLI，只覆盖指定 OpenAPI 页面的 11 个端点。
- 同时服务终端开发者、AI Agent 和 CI，默认非交互执行。
- 官方 YMFE/yapi 为基线，再用实际部署实例验收，不承诺各类 fork。
- 单 npm 包 `openyapi-cli`，可执行命令 `openyapi`，MIT 许可证。
- 迭代 1 实现六个只读端点；写入、导入和 npm 发布不在本次范围。

## 技术选型

| 选择 | 理由与边界 |
| --- | --- |
| Node.js >=22；开发默认 24 | 以 22/24 为测试矩阵；不把 engines 范围解释为所有未来主版本都已验证 |
| TypeScript 严格模式 + ESM | 为后续 API 参数提供类型约束，直接产出 Node.js 可执行代码 |
| Commander.js | 处理子命令、参数、帮助和退出控制；运行时仅增加一个命令解析依赖 |
| Node.js 原生 fetch | 后续 HTTP 传输使用；显式处理超时、HTTP 状态及 YApi 业务错误 |
| npm + package-lock.json | 可复现安装，直接对接目标发布渠道 |
| tsc | 编译到 dist，无打包器、开发运行器或 monorepo 编排工具 |
| node:test + node:assert | 通过真实 CLI 子进程验证 stdout、stderr 与退出码 |
| GitHub Actions | 22/24 上执行 check 和安装包验收；工作流仅检查，不自动发布 |

依赖版本由 package.json 范围与 package-lock.json 实际解析版本共同记录，不在文档维护第二套版本号。

## 结构与职责

当前只创建实际使用的模块：

```text
src/main.ts          进程入口与包版本读取
src/cli.ts           命令解析、执行与退出码
src/config.ts        profile 存储与配置优先级
src/client.ts        GET 传输及 YApi 响应信封校验
src/queries.ts       端点映射、身份预检与分页协议
src/errors.ts        稳定错误分类
src/output.ts        结果格式化
test/cli.test.mjs    编译后 CLI 的黑盒测试
test/sprint1.test.mjs 编译后 CLI + 本地 HTTP fixture 验收
scripts/            清理和安装包验收
docs/               设计、API 范围、迭代计划
```

CLI 负责参数和呈现；配置模块解析 profile 和凭据；客户端只封装 URL、认证、传输与响应信封；查询模块管理端点语义、身份预检和分页不变量。首版不导出公共 SDK，内部模块不构成 npm API 承诺。

## 输出与退出码

- 默认 `--format json`，成功时 stdout 输出单个 JSON 值，末尾换行。
- `--format table` 面向人工阅读；项目、分类、接口详情/列表和树使用固定摘要列，完整业务字段保留在 JSON 中。
- `--help`、`--version` 为文本例外；无参数显示帮助。
- 错误写入 stderr，结构为 `{"error":{"code":"USAGE_ERROR","message":"..."}}`；失败时不混入成功数据。
- 退出码：0 成功，2 参数/用法错误，1 执行失败，不为每种错误扩展进程退出码。
- 稳定 `error.code`：`USAGE_ERROR`、`CONFIG_ERROR`、`PROJECT_MISMATCH`、`NETWORK_ERROR`、`TIMEOUT_ERROR`、`HTTP_ERROR`、`YAPI_ERROR`、`RESPONSE_ERROR`、`INTERNAL_ERROR`。

## 配置与认证（迭代 1 实现）

支持命名 profile，每个 profile 保存服务地址、项目 ID，以及用户主动选择存储的 token。多项目通过不同 profile 表达。

实现约定：非敏感参数使用“命令参数 > 环境变量 > 所选 profile”；profile 通过 `--profile` 或 `OPENYAPI_PROFILE` 选择；服务地址、项目 ID 和 token 分别使用 `OPENYAPI_BASE_URL`、`OPENYAPI_PROJECT_ID`、`OPENYAPI_TOKEN`。token 环境变量优先于本地保存值。缺少必要配置时立即失败，不启动交互问答。

profile 保存在操作系统的用户配置目录；`XDG_CONFIG_HOME` 显式设置时优先，否则 Linux 使用 `~/.config`、Windows 使用 `APPDATA`、macOS 使用 `~/Library/Application Support`。CLI 提供 `config set/show/list/delete`、`config token set --stdin` 与 `config token unset`；查看仅显示 token 是否已配置。普通 `config set` 更新保留已存 token。

本机 token 保存必须由用户显式执行配置命令，并从 stdin 读入，避免把 token 放进命令历史。Unix 上配置目录/文件限制为当前用户可访问；配置查看始终隐藏 token。CI 使用环境变量；不将凭据写入仓库，不在诊断中输出携带 token 的 URL 或请求体。

YApi 文档使用项目 token：GET 放 query、POST 放 body；不默认转换为 Bearer header。认证实际效果须对选定服务端版本做集成验收。

只读查询在提供 project ID 时先执行一次认证的 `/api/project/get` 身份预检；项目查询本身复用该请求。预检返回 `_id` 不匹配时使用 `PROJECT_MISMATCH` 停止，不发送目标查询。`interface get` 和按分类列举只要求各自 ID、base URL 与 token；未提供 project ID 时不增加身份预检。

分页默认 `page=1`、`limit=10`。显式 `--all` 从第一页按数字 limit 遍历，拒绝重复 ID、总数/总页数变化、提前空页和最终数量不一致；结果完整成功前不写 stdout。该检查证明静态数据集的一致读取，不承诺并发修改或不稳定排序下的快照语义。

## 写入约定（迭代 2 实现）

- 显式执行新增、更新、导入命令即写入，不弹确认。
- 完全覆盖导入必须同时提供 `--merge merge --allow-overwrite`，缺少标志时在发起请求前失败。
- 不自动重试写请求；超时后提示结果未知，不将网络失败解释为未写入。
- 输入 JSON 支持文件或 stdin；先做 JSON 语法与必要字段校验。
- 同时检查 HTTP 状态、JSON 响应结构和 YApi errcode。
- 不增加自动补偿、回滚、历史重放或 exactly-once 承诺。
- 接口写入/导入的集成验收包含后读核对；是否产品化为单独参数在对应迭代设计时确定，不把 HTTP 成功等同于持久化验收。

## 打包与发布

`bin` 指向 dist/main.js，文件包含 Node.js shebang；`prepack` 构建产物；files 白名单包含 dist、docs、英文 README，以及 npm 自动包含的包元数据、简体中文 README、LICENSE。生产安装不需要 TypeScript，也不运行构建脚本。

当前版本 0.1.0-alpha.0 标识骨架。后续发布前需完成业务验收、补充真实 repository/bugs/homepage 元数据、确认 npm 名称和维护者账号，按 roadmap 完成打包验收。尚未设置 npm 凭据或自动发布工作流。

## 核对来源

- [Commander.js](https://github.com/tj/commander.js#readme)：子命令、exitOverride、configureOutput。
- [TypeScript 编译选项指南](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html)：NodeNext 与 ESM。
- [Node.js 测试运行器](https://nodejs.org/docs/latest-v22.x/api/test.html)：编译后 JavaScript 的测试执行。
- [Node.js 支持周期](https://github.com/nodejs/Release/blob/main/schedule.json)：运行时支持基线。
- [npm package.json](https://docs.npmjs.com/cli/v11/configuring-npm/package-json)：bin 与 files。
- [npm 生命周期](https://docs.npmjs.com/cli/v11/using-npm/scripts)：prepack 与发布检查。
- [setup-node](https://github.com/actions/setup-node/tree/v4)：CI 版本矩阵与 npm 缓存配置。
