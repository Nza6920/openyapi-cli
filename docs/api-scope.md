# OpenAPI 范围与命令映射

范围来源：[用户指定页面](https://hellosean1025.github.io/yapi/openapi.html)及其 [iframe 正文](https://hellosean1025.github.io/yapi/openapi-doc.html)。2026-09-12 核对，共 11 个端点。

以下是**计划中的命令**，当前骨架均未实现。命令参数、分页和返回形状会在对应迭代落实。

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

删除接口、分类修改/删除、项目创建/管理、服务端部署、网页登录、自动化测试管理和未列入此页的导出能力不在首版范围。也不移植服务端源代码或复用旧部署 CLI。
