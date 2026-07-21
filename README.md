# 阿德小厨房 · NAS Docker 版

给家庭主厨使用的私人点菜网页。朋友可以在手机上选菜、提交饭局信息；主厨工作台负责接单、管理菜谱、生成采购清单和记录家宴。

本项目现在以 **NAS Docker 自托管**为主要运行方式：

- 菜谱、订单、库存、邀请保存在 NAS 上的 SQLite 数据库。
- 菜品照片和家宴照片保存在 NAS 文件夹。
- 主厨工作台使用独立密码与安全会话保护。
- Docker 容器提供健康检查，备份容器每天备份数据库并镜像照片目录。
- GitHub 每次收到 `main` 分支更新后会先自动测试，再发布新的极空间 Docker 镜像。
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

### 3. 首次连接 GitHub 镜像仓库

正式镜像位于：

```text
ghcr.io/adechokwok/ade-private-kitchen:latest
```

因为 GitHub 仓库是私有的，极空间第一次拉取镜像前需要登录一次：

1. 在 GitHub 创建一个只勾选 `read:packages` 的 Personal Access Token（classic）。
2. 在极空间 Docker 的镜像仓库或 Registry 设置中添加 `ghcr.io`。
3. 用户名填写 `adechokwok`，密码填写刚创建的 Token。

Token 只保存在极空间中，不要写入 `.env`、Compose 文件或发送到聊天里。

### 4. 创建 Compose 项目

在极空间 Docker 中创建 Compose 项目，使用本项目的 `compose.nas.yaml`，并加载第 2 步准备好的 `.env`。它会直接拉取已在 GitHub 测试通过的 `linux/amd64` 镜像，然后启动：

- `ade-private-kitchen`：点菜网页与主厨工作台
- `ade-private-kitchen-backup`：每日自动备份

默认端口为 `3099`。局域网访问地址通常是：

```text
http://NAS局域网IP:3099
```

确认 `/api/health` 返回 `ok: true` 后，再在极空间“远程访问”中添加这个网页服务。

### 5. 首次登录

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

## 后续更新流程

以后每次迭代按这条固定链路进行：

```text
修改并测试 → 推送 GitHub main → GitHub 自动构建镜像 → 极空间确认更新
```

GitHub 中的“测试并发布 NAS 镜像”显示绿色后，在极空间打开这个 Compose 项目，执行“拉取最新镜像”并重新创建或重新部署容器。若使用命令行，对应操作是：

```bash
docker compose -f compose.nas.yaml pull
docker compose -f compose.nas.yaml up -d
```

`latest` 代表最新稳定版本，同时每次发布还会保留一个 `sha-完整提交编号` 标签，出现问题时可以把 `compose.nas.yaml` 里的镜像标签临时改成上一个编号并重新部署。

数据目录使用独立挂载，更新或重新创建容器不会删除菜谱和照片。更新前仍建议确认备份容器最近一次执行成功。当前保留人工确认更新，避免尚未查看的新版本在饭局进行中自动重启服务。

### 更新状态在哪里看

- GitHub 仓库的 **Actions** 页面：查看自动测试与镜像发布是否成功。
- GitHub 仓库的 **Packages** 区域：查看 `latest` 和各个历史版本镜像。
- 极空间 Docker 项目：拉取新镜像后重新部署，并确认两个容器恢复为健康状态。

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
- `docker compose up -d --build`：从当前源码构建开发版
- `docker compose -f compose.nas.yaml up -d`：使用 GitHub 镜像启动极空间正式版

## 从旧云端版本迁移

旧版使用 Cloudflare D1 和 R2，不能直接复制数据库文件到 NAS。正式切换前，需要从旧版导出菜谱、订单与照片，再导入 NAS 版本。迁移完成并核对数据后，再停止旧站点，避免两边产生不同订单。
