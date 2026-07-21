# 阿德小厨房 · NAS Docker 版

给家庭主厨使用的私人点菜网页。朋友可以在手机上选菜、提交饭局信息；主厨工作台负责接单、管理菜谱、生成采购清单和记录家宴。

本项目现在以 **NAS Docker 自托管**为主要运行方式：

- 菜谱、订单、库存、邀请保存在 NAS 上的 SQLite 数据库。
- 菜品照片和家宴照片保存在 NAS 文件夹。
- 主厨工作台使用独立密码与安全会话保护。
- Docker 容器提供健康检查，备份容器每天备份数据库并镜像照片目录。
- 智能菜谱录入可以选配 OpenAI API；不配置时仍支持文字菜谱解析。

## 极空间 Z4Pro 部署

### 1. 准备目录

在极空间硬盘中建立两个文件夹，例如：

- `Docker/阿德小厨房/data`
- `Docker/阿德小厨房/backups`

`data` 是正式数据，`backups` 是每日备份。建议放在具备冗余保护的存储池，并把备份目录额外同步到另一块硬盘或网盘。

### 2. 准备环境配置

把 `nas.env.example` 复制为 `.env`，至少修改：

```dotenv
CHEF_PASSWORD=一段至少10位且只有你知道的密码
NAS_DATA_PATH=/极空间中实际选择的数据目录
NAS_BACKUP_PATH=/极空间中实际选择的备份目录
```

如果极空间的 Compose 页面提供文件夹选择器，以选择器生成的宿主机路径为准。不要把 `.env` 提交到 GitHub。

智能菜谱图片识别需要额外填写：

```dotenv
OPENAI_API_KEY=你的服务器端API密钥
```

### 3. 创建 Compose 项目

在极空间 Docker 中创建 Compose 项目，选择本项目的 `compose.yaml`。第一次启动会在 NAS 本地构建 `linux/amd64` 镜像，之后自动启动：

- `ade-private-kitchen`：点菜网页与主厨工作台
- `ade-private-kitchen-backup`：每日自动备份

默认端口为 `3099`。局域网访问地址通常是：

```text
http://NAS局域网IP:3099
```

确认 `/api/health` 返回 `ok: true` 后，再在极空间“远程访问”中添加这个网页服务。

### 4. 首次登录

朋友点菜页：`/`

主厨工作台：`/chef`

主厨登录密码就是 `.env` 中的 `CHEF_PASSWORD`。连续输错会触发临时限制；登录会话默认保留 7 天。

## 数据位置

容器内部的数据结构：

```text
/data/
├── ade-kitchen.sqlite       # 菜谱、订单、库存与邀请
├── ade-kitchen.sqlite-wal   # SQLite 运行文件
├── .session-secret          # 自动生成的会话密钥
└── uploads/                 # 菜品图、过程图与家宴照片

/backups/
├── ade-kitchen-*.sqlite     # 按日期保存的数据库备份
└── uploads-latest/          # 最新照片镜像
```

数据库备份默认保留 14 天，可以通过 `BACKUP_RETENTION_DAYS` 修改。备份间隔默认 24 小时。

## 更新版本

以后每次代码更新后，在极空间更新项目文件并重新构建：

```bash
docker compose up -d --build
```

数据目录使用独立挂载卷，重新构建或删除容器不会删除菜谱和照片。操作前仍建议先确认备份容器最近一次执行成功。

## 本机开发

需要 Node.js 22.13 或以上和 pnpm 11。

```bash
cp .env.example .env.local
pnpm install
pnpm dev
```

常用命令：

- `pnpm build`：构建生产版本
- `pnpm test`：构建并运行自动检查
- `pnpm nas:backup`：执行一次本地备份
- `docker compose up -d --build`：构建并启动 NAS 版本

## 从旧云端版本迁移

旧版使用 Cloudflare D1 和 R2，不能直接复制数据库文件到 NAS。正式切换前，需要从旧版导出菜谱、订单与照片，再导入 NAS 版本。迁移完成并核对数据后，再停止旧站点，避免两边产生不同订单。
