# openyapi-cli

**简体中文** | [English](README.en.md)

面向开发者、AI Agent 和 CI 的 YApi OpenAPI 命令行客户端。

**当前版本是项目骨架**：已实现本地帮助、版本、`info` 命令，以及构建、测试和 npm 打包验收。YApi 查询、配置、写入与导入尚未实现；本项目尚未发布到 npm。

## 本地开始

需要 Node.js >=22；开发默认 Node 24，CI 配置验证 22/24。

```sh
npm ci
npm run build
node dist/main.js --help
node dist/main.js --version
node dist/main.js info
node dist/main.js info --format table
```

默认业务结果输出为 JSON。当前 `info` 示例：

```json
{"name":"openyapi-cli","version":"0.1.0-alpha.0","stage":"scaffold"}
```

`--help` 与 `--version` 按 CLI 惯例输出文本。诊断写入 stderr；参数错误退出码为 2，内部错误为 1，成功为 0。

## 开发与验收

```sh
npm run check
npm run test:package
```

`check` 执行类型检查、构建和 CLI 黑盒测试。`test:package` 生成真实 tarball，在临时目录仅安装运行时依赖，验证安装后的入口与包内容，并清理临时文件。此命令需要 npm registry 网络访问。

单独生成本地安装包：

```sh
npm pack
npm install --global ./openyapi-cli-0.1.0-alpha.0.tgz
openyapi info
```

包名为 `openyapi-cli`，命令名为 `openyapi`。发布后的全局安装方式将是 `npm install --global openyapi-cli`；当前请使用本地 tarball。

## 范围与计划

目标仅覆盖 [YApi OpenAPI 文档](https://hellosean1025.github.io/yapi/openapi.html)中的 11 个端点，以 [YMFE/yapi](https://github.com/YMFE/yapi) 官方版为兼容基线。客户端独立实现，不包含服务端部署、登录会话管理、网页后台管理或未文档化端点。

- [技术选型与行为约定](docs/design.md)
- [11 个端点与命令映射](docs/api-scope.md)
- [迭代计划与验收标准](docs/roadmap.md)

MIT License。本项目是独立客户端，与 YApi 官方项目无隶属关系。
