# 阿德小厨房 · Tencent CloudBase 云托管分支

本分支只服务腾讯云开发 CloudBase 云托管，不改变 NAS 版 main 和现有 NAS 镜像。

## 当前架构

CloudBase 公网
  ├─ 公网连接 → 腾讯云 MySQL：业务数据
  └─ /data（COS/FUSE 挂载）→ /data/uploads：图片和导入文件

COS/FUSE 只承载文件，不承载数据库。SQLite 不放在 /data，也不放在容器临时文件系统；云版业务数据只写 MySQL。

## 已核实：CloudBase 可以直接使用腾讯云 MySQL

腾讯云 CloudBase 官方 MySQL 文档明确列出公网连接方式，因此不具备 VPC 条件时，可以使用 MySQL 公网地址连接，不需要云主机中转：

- https://docs.cloudbase.net/run/develop/resource-integration/mysql
- https://docs.cloudbase.net/run/deploy/networking/vpc

公网方式上线前必须在 MySQL 控制台开启公网访问，并使用强密码、访问控制和来源限制。DATABASE_URL 使用 MySQL 公网地址、端口、数据库名和凭据。

## COS/FUSE 文件挂载

CloudBase 中把 COS/FUSE 挂载到 /data，并设置：

- STORAGE_DRIVER=fuse
- DATA_DIR=/data
- UPLOADS_DIR=/data/uploads

应用会把菜品图片、菜谱截图、制作过程图、餐桌日记图片和数据导入文件写入 /data/uploads。代码不再调用 COS SDK，也不需要 COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET 或 COS_REGION。

COS/FUSE 是对象存储文件系统，不提供可靠的数据库事务、数据库锁和完整 POSIX 语义，因此不能用来保存 SQLite 或 MySQL 数据文件。

## 独立镜像

云版镜像：

ghcr.io/adechokwok/ade-private-kitchen-cloudbase:edge
ghcr.io/adechokwok/ade-private-kitchen-cloudbase:sha-完整提交编号

完成 MySQL、FUSE 挂载和真实业务验收后，再考虑发布 latest。

## CloudBase 环境变量

见 cloudbase.env.example。必须配置：

- DATABASE_URL：腾讯云 MySQL 公网连接串。
- STORAGE_DRIVER=fuse。
- DATA_DIR=/data。
- UPLOADS_DIR=/data/uploads。
- CHEF_PASSWORD、SESSION_SECRET。
- PUBLIC_APP_URL。

可选的通义千问变量仍见示例文件。不要把真实密码、Token 或 API Key 提交到 GitHub。

## 部署顺序

1. 创建或准备腾讯云 MySQL，并开启公网连接。
2. 配置 MySQL 强密码、访问控制和可用来源范围。
3. 在 CloudBase 中把 COS/FUSE 挂载到 /data。
4. 配置 cloudbase.env.example 中的运行时环境变量。
5. 使用固定 SHA 镜像部署。
6. 访问 /api/health，确认 MySQL 连通。
7. 测试图片上传、图片读取、图片删除、菜谱导入导出和订单流程。
8. 全部通过后再切换到 edge 或发布 latest。

NAS 版仍保留自己的 SQLite、文件目录、备份容器和镜像，不与云版共享数据。

## 回退原则

云版出现问题时使用固定 SHA 镜像回退，不修改 NAS 数据，也不让两个环境同时写同一份业务数据。
