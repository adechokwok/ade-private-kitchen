# 阿德小厨房 · Tencent CloudBase 云托管分支

本分支只服务腾讯云开发 CloudBase 的云托管，不改变 NAS 版 `main` 和现有 NAS 镜像。

## 已核实：CloudBase 可以直接使用腾讯云 MySQL

已核对腾讯云 CloudBase 官方文档：

- [云托管 MySQL 数据库集成](https://docs.cloudbase.net/run/develop/resource-integration/mysql) 明确列出三种连接方式：云开发 MySQL、内网互联、公网连接。
- [VPC 配置说明](https://docs.cloudbase.net/run/deploy/networking/vpc) 明确说明：云托管服务接入指定 VPC 和子网后，可以通过内网访问同一 VPC 内的 MySQL 等云资源。
- 当前官方页面显示云托管支持地域为上海；云托管服务与 MySQL 的 VPC/地域必须按控制台实际可选项保持一致。

本项目采用“腾讯云 MySQL + COS”方案，MySQL 连接路径固定为：

```
CloudBase 云托管服务
        │  私有网络 / VPC
        │  MySQL 内网地址:端口
        ▼
腾讯云 MySQL
```

这意味着：

1. 不需要云主机作为中转。
2. 云托管服务创建或设置时必须开启私有网络，并选择能访问 MySQL 的 VPC 和子网。
3. `DATABASE_URL` 必须填写 MySQL 内网连接地址和端口，不使用 NAS 的 SQLite 路径。
4. MySQL 的安全组、网络 ACL 或实例白名单必须允许云托管所在 VPC/子网访问 MySQL 端口。
5. 云托管与 MySQL 必须使用同地域，或先通过云联网、对等连接等方式打通跨 VPC 网络。
6. 如果服务还需要访问公网，VPC 需要配置 NAT 网关和路由；这不影响 MySQL 走内网。

“可以直接使用”已经由官方能力确认；真正上线前仍需在腾讯云控制台完成 VPC、子网、MySQL 白名单/安全组配置，并用云版健康检查做一次实际连通性验收。

## 当前阶段

这是云版迁移分支。当前代码仍包含 NAS 的 SQLite 和本地文件存储，因此本分支的第一阶段镜像只用于构建验证，完成数据库与对象存储迁移前不得承载正式订单数据。

云托管部署目标：

- 通过容器镜像部署一个 Next.js Web 服务。
- 业务数据使用托管数据库，不把 SQLite 放在容器临时文件系统、COS 或 COS/FUSE 挂载上。
- 菜品图片、步骤图片和餐桌日记图片使用腾讯云 COS。
- 会话密钥和第三方 API 密钥使用云托管环境变量或密钥管理能力注入。
- 朋友点菜页面保持公网 HTTPS 可访问；主厨入口单独加强访问控制。

## 独立镜像

云版镜像：

```text
ghcr.io/adechokwok/ade-private-kitchen-cloudbase:edge
ghcr.io/adechokwok/ade-private-kitchen-cloudbase:sha-完整提交编号
```

完成数据层迁移并通过 CloudBase 实机验收后，再把 `edge` 改为正式 `latest`。

## 计划中的云环境变量

见 `cloudbase.env.example`。示例文件不包含任何真实密钥。

核心配置：

- `DATABASE_URL`：腾讯云 MySQL 连接串；云托管运行时填写 MySQL 内网地址、端口、数据库名和凭据。
- `STORAGE_DRIVER=cos`：启用 COS 图片存储。
- `COS_SECRET_ID`、`COS_SECRET_KEY`、`COS_BUCKET`、`COS_REGION`：仅服务器端使用。
- `CHEF_PASSWORD`、`SESSION_SECRET`：由云托管环境变量或密钥管理注入。
- `PUBLIC_APP_URL`：HTTPS 公网地址，用于微信分享元数据和回调链接。

## 迁移顺序

1. 只在本分支建立 CloudBase 镜像和配置边界。
2. 把图片存储抽象为 NAS 本地存储与 COS 存储两种实现。
3. 将 SQLite/Drizzle 迁移到托管关系型数据库，并保留 NAS 版 SQLite 实现。
4. 改造数据导入导出和健康检查。
5. 用 NAS 导出的 ZIP 做一次性迁移，核对表记录数、图片数量和图片哈希。
6. CloudBase 实机验证朋友端、主厨端、图片上传、订单进度和微信抓取。
7. 验收通过后再发布 `latest`，并进行正式切换。

## 回退原则

NAS 版继续保留原来的镜像、数据目录和备份流程。云版出现问题时使用带完整提交编号的镜像回退，不修改 NAS 数据，也不让两个环境同时写同一份业务数据。
