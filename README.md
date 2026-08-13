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

## 接口

- `GET /api/posts`：帖子列表，支持 `q`、`tag`、`visitor_id`。
- `GET /api/posts/{slug}`：帖子详情与已渲染 HTML。
- `POST /api/posts/{slug}/like`：点赞或取消点赞。
- `GET/POST /api/posts/{slug}/comments`：读取或发布评论。
- `DELETE /api/posts/{slug}/comments/{id}`：删除评论。
