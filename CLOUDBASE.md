# 阿德小厨房 · Tencent CloudBase 云托管分支

本分支只服务腾讯云开发 CloudBase 的云托管，不改变 NAS 版 `main` 和现有 NAS 镜像。

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

- `DATABASE_URL`：托管数据库连接串。
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
