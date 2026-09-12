# OpenAPI 范围与命令映射

范围来源：[用户指定页面](https://hellosean1025.github.io/yapi/openapi.html)及其 [iframe 正文](https://hellosean1025.github.io/yapi/openapi-doc.html)。2026-09-12 核对，共 11 个端点。

以下命令中，迭代 1 的六个 GET 已实现并通过本地 HTTP fixture 验收；五个 POST 仍为迭代 2 计划。真实 YApi 实例兼容结果需单独记录，不能由 fixture 代替。

| 能力 | HTTP | 路径 | 计划命令 | 迭代 |
| --- | --- | --- | --- | --- |
| 项目基本信息 | GET | /api/project/get | project get | 1 |
| 新增分类 | POST | /api/interface/add_cat | category create | 2 |
| 分类菜单 | GET | /api/interface/getCatMenu | category list | 1 |
| 服务端导入 | POST | /api/open/import_data | import | 2 |
| 接口详情 | GET | /api/interface/get | interface get | 1 |
| 分类下接口列表 | GET | /api/interface/list_cat | interface list --category-id | 1 |
| 新增接口 | POST | /api/interface/add | interface create | 2 |
| 新增或更新接口 | POST | /api/interface/save | interface save | 2 |
| 项目接口列表 | GET | /api/interface/list | interface list | 1 |
| 更新接口 | POST | /api/interface/up | interface update | 2 |
| 分类与接口树 | GET | /api/interface/list_menu | interface tree | 1 |

配置、info、帮助属于本地辅助能力，不增加服务端 API 范围。

## 文档与源码差异及验收重点

在线 master 可变；以下仅是当前核对得到的风险点，不代替选定版本及实例的兼容测试。迭代 1 开始时记录验收使用的 tag/commit 和实例版本。

1. **认证**：文档使用项目 token。服务端存在不同 token 与登录会话处理，权限也受项目影响；不能直接按 Bearer 或 cookie 客户端设计。[认证源码](https://github.com/YMFE/yapi/blob/master/server/controllers/base.js)
2. **分页返回结构**：`interface/list` 的文档示例与 master 返回结构有差异；客户端必须验证 `{count,total,list}` 等目标版本的实际结构，避免把对象当成数组。[接口源码](https://github.com/YMFE/yapi/blob/master/server/controllers/interface.js)
3. **save 的匹配规则**：源码按 project_id + path + method 查找；不能将示例里的 id 解释为按 ID upsert。更新的完成时机也需要后读验证。[接口源码](https://github.com/YMFE/yapi/blob/master/server/controllers/interface.js)
4. **导入编码**：json 字段是序列化字符串；url 由 YApi 服务端获取。支持的导入格式依赖服务端插件，不直接承诺 OpenAPI 3.x 兼容。normal/good/merge 分别由服务端实现其合并语义。[导入源码](https://github.com/YMFE/yapi/blob/master/server/controllers/open.js)
5. **业务错误**：HTTP 200 不保证 YApi 操作成功，需检查 errcode/errmsg；写入验收还需查询结果验证。

## 迭代 1 查询契约

- 官方源码基线固定为 tag `v1.12.0`、commit `f856193ded851326a9aea19ff28d1c20c653bbab`；该 tag 的 `package.json` version 为 1.11.0。
- 所有请求为 GET，项目 token 放 query；拒绝重定向，每请求默认超时 30000ms，不自动重试。
- `project get` 发送 `id`；`category list` 和 `interface tree` 发送 `project_id`；`interface get` 发送 `id`；两个列表分别发送 `project_id` 或 `catid`，并发送数值 `page`、`limit`。
- 成功 JSON 去掉 YApi 的 `errcode`/`errmsg` 信封，业务结果放 `data`。分页另带 `pagination`，将 `count`/`total` 映射为 `totalItems`/`totalPages`。
- `--all` 与显式 `--page` 互斥；全量读取只对静态数据集提供完整性检测，不提供并发快照保证。
- 私有项目的 `getCatMenu` 在固定版本可能要求 edit 权限；服务端拒绝按 `YAPI_ERROR` 原样分类，不提升或绕过权限。

删除接口、分类修改/删除、项目创建/管理、服务端部署、网页登录、自动化测试管理和未列入此页的导出能力不在首版范围。也不移植服务端源代码或复用旧部署 CLI。
