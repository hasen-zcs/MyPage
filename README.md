# 拾光札记

一个轻量的个人笔记主页：把本地 Markdown 笔记当作帖子发布，支持点赞与评论。

## 架构

- `notes/`：放置 Markdown 笔记，目录结构不限，支持 YAML front matter。
- `server.py`：Python 标准库 HTTP 服务，负责扫描笔记、渲染 Markdown、保存互动数据。
- `public/`：纯 HTML/CSS/JS 前端，帖子流与文章详情都在这里。
- `data/state.json`：运行时自动生成，保存点赞与评论。

## 运行

```powershell
python server.py
```

然后打开 <http://127.0.0.1:8000>。

## 部署

### 局域网部署

让服务监听所有网卡。修改 `config.json`：

```json
{
  "host": "0.0.0.0"
}
```

或者在 PowerShell 里临时指定：

```powershell
$env:HOST="0.0.0.0"
python server.py
```

启动后放行 Windows 防火墙的 8000 端口，然后运行 `ipconfig` 查看本机局域网 IP，在手机或其他电脑上打开 `http://<局域网IP>:8000`。

### 云服务器部署

把项目上传到服务器，安装依赖并启动：

```bash
pip install -r requirements.txt
HOST=0.0.0.0 PORT=8000 python server.py
```

生产环境建议用 `systemd` 托管进程。创建 `/etc/systemd/system/notehub.service`：

```ini
[Unit]
Description=NoteHub personal homepage
After=network.target

[Service]
WorkingDirectory=/opt/notehub
Environment=HOST=0.0.0.0
Environment=PORT=8000
ExecStart=/usr/bin/python3 server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now notehub
```

需要域名和 HTTPS 时，再用 Nginx 反代到 `127.0.0.1:8000`，并通过 Certbot 申请证书。

### Docker 部署

如果服务器或 NAS 上装了 Docker，可以直接使用项目自带的配置：

```bash
docker compose up -d --build
```

`docker-compose.yml` 已经把 `notes/` 和 `data/` 挂载为数据卷，笔记和互动数据都会保留在宿主机上。

## 关闭服务

如果服务是在当前终端前台启动的，按 `Ctrl+C` 即可关闭。

如果是后台启动的，先找到占用 8000 端口的进程，再结束它：

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

如果修改过端口，把上面的 `8000` 换成 `config.json` 中配置的端口。

## 发布笔记

把 `.md` 文件放进 `notes/`，刷新页面即可看到新帖子。文件顶部可以写 front matter：

```markdown
---
title: 笔记标题
date: 2026-08-13
tags: [AI, 学习]
summary: 一句话摘要
---
```

如果没有写 `title`，会使用第一个一级标题；没有写 `summary`，会自动截取正文开头。

图片可以直接使用 Obsidian 写法 `![[图片.png]]`，也可以使用标准 Markdown 写法 `![](img/图片.png)`。图片放在笔记同目录、`img/` 或 `attachments/` 子目录中即可，网页会自动解析并显示。

## 删除帖子

删除 `notes/` 中对应的 `.md` 文件，刷新页面后帖子就会自动消失。如果配置了多个笔记目录，从对应的目录中删除即可。

删除帖子后，如果想连同它的点赞、评论数据一起清掉，删除 `data/state.json` 并重启服务，服务会重新生成空的互动数据文件。

如果只是想暂时隐藏某篇笔记而不删除文件，可以在 front matter 中加入：

```markdown
---
draft: true
---
```

## 自定义

修改 `config.json` 里的站点名称、作者、简介、头像和链接。`note_dirs` 支持多个目录，也可以填写绝对路径，把其他位置的笔记目录直接纳入主页。

## 后台管理

项目自带一个网页后台，可以**直接在浏览器里写笔记、编辑、删除**，不用再手动拷贝文件。访问 `http://127.0.0.1:8000/admin`。

### 启用

后台默认未启用，需要先设置管理密码（环境变量优先，也可以在 `config.json` 的 `admin.password` 里配置，但不建议提交到 git）：

```powershell
$env:ADMIN_PASSWORD="你的密码"
python server.py
```

打开 `/admin`，输入密码即可进入。密码错误 5 次会锁定 10 分钟。

### 功能

- **写笔记**：网页里直接写 Markdown，右侧实时预览（渲染效果与前台完全一致），支持标题/日期/标签/摘要/主题色/草稿等 front matter 字段；
- **导入 md**：编辑器里点「上传 .md」导入本地 Markdown 文件，自动解析 front matter 填入表单，确认后保存；
- **插图**：点「插图」上传图片，自动保存到笔记目录的 `img/` 子目录，并在光标处插入 `![[图片名.png]]`；
- **管理**：按目录列出全部笔记，支持搜索、编辑、删除；删除时会顺带清理 `data/state.json` 里对应的点赞评论数据；
- **自动备份**：每次保存/删除/传图自动执行 `git add -A && git commit`（可在 `config.json` 的 `admin.git_commit` 关闭），笔记有版本历史可回滚。

`config.json` 里 `admin` 相关配置：

```json
"admin": {
  "enabled": true,
  "dir": "./notes",
  "password": "",
  "session_ttl_hours": 12,
  "git_commit": true
}
```

> 注意：后台接口没有公网防护以外的额外保护，公网部署时务必配合 HTTPS，或仅限局域网使用。

## 接口

- `GET /api/meta`：站点信息与统计。
- `GET /api/posts`：帖子列表，支持 `q`、`tag`、`visitor_id`。
- `GET /api/posts/{slug}`：帖子详情与已渲染 HTML。
- `POST /api/posts/{slug}/like`：点赞或取消点赞。
- `GET/POST /api/posts/{slug}/comments`：读取或发布评论。
- `DELETE /api/posts/{slug}/comments/{id}`：删除评论。

后台接口（需要 `X-Admin-Token` 请求头，登录后获得）：

- `POST /api/admin/login`：登录，`{"password": "..."}` 返回 token。
- `POST /api/admin/logout`：注销。
- `GET /api/admin/posts`：后台笔记列表。
- `GET /api/admin/posts/{path}`：读取某篇笔记的原始 Markdown（`path` 为相对路径，如 `手撕Transformer/AddNorm.md`）。
- `POST /api/admin/posts`：新建笔记。
- `PUT /api/admin/posts/{path}`：更新笔记（可移动目录/改名）。
- `DELETE /api/admin/posts/{path}`：删除笔记。
- `POST /api/admin/preview`：渲染 Markdown 预览，`{"body": "...", "dir": "..."}`。
- `POST /api/admin/upload/md`：multipart 上传 `.md` 文件（字段名 `file`），只解析不落盘，返回 `{files: [{filename, meta, body, raw}]}`。
- `POST /api/admin/upload/image`：multipart 上传图片（字段名 `file`，可带 `dir` 指定笔记目录），保存到该目录 `img/` 下，返回 `{name, embed, url}`。
