from __future__ import annotations

import html
import json
import mimetypes
import os
import re
import secrets
import threading
import traceback
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

import markdown
import yaml


BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
CONFIG_PATH = BASE_DIR / "config.json"


def load_config() -> dict:
    with CONFIG_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


CONFIG = load_config()
NOTE_DIRS = CONFIG.get("note_dirs", ["./notes"])
if isinstance(NOTE_DIRS, str):
    NOTE_DIRS = [NOTE_DIRS]
DATA_FILE = Path(CONFIG.get("data_file", "data/state.json"))
if not DATA_FILE.is_absolute():
    DATA_FILE = BASE_DIR / DATA_FILE


def resolve_note_dirs() -> list[Path]:
    dirs = []
    for item in NOTE_DIRS:
        path = Path(item)
        if not path.is_absolute():
            path = BASE_DIR / path
        if path.exists() and path.is_dir():
            dirs.append(path)
    return dirs


def split_frontmatter(text: str) -> tuple[dict, str]:
    match = re.match(r"\A---\s*\n(.*?)\n---\s*(?:\n|$)", text, re.S)
    if not match:
        return {}, text
    try:
        meta = yaml.safe_load(match.group(1)) or {}
    except Exception:
        meta = {}
    if not isinstance(meta, dict):
        meta = {}
    return meta, text[match.end() :]


def first_heading(text: str) -> str:
    match = re.search(r"^#\s+(.+?)\s*$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def slugify(value: str) -> str:
    value = re.sub(r'[\\/:*?"<>|#%{}\[\]]', "-", value.strip())
    value = re.sub(r"\s+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value.lower()


def parse_date(value, fallback_path: Path) -> str:
    if value:
        if isinstance(value, datetime):
            return value.date().isoformat()
        try:
            return datetime.fromisoformat(str(value).strip()).date().isoformat()
        except Exception:
            pass
    try:
        return datetime.fromtimestamp(fallback_path.stat().st_mtime).date().isoformat()
    except Exception:
        return datetime.now().date().isoformat()


def plain_text(raw: str) -> str:
    text = re.sub(r"```.*?```", " ", raw, flags=re.S)
    text = re.sub(r"!\[\[[^\]]*\]\]", " ", text)
    text = re.sub(r"\[\[([^\]]+)\]\]", r"\1", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"[#>*`_~-]", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def count_words(text: str) -> int:
    cjk = len(re.findall(r"[\u4e00-\u9fff]", text))
    latin = len(re.findall(r"[A-Za-z0-9_]+", text))
    return max(cjk + latin, 1)


def note_asset_url(root_index: int, rel_path: Path) -> str:
    rel = rel_path.as_posix()
    return f"/note-asset?root={root_index}&path={quote(rel)}"


def resolve_image_source(
    target: str,
    md_path: Path,
    root: Path,
    root_index: int,
) -> str:
    target = target.strip().strip('"').strip("'")
    if not target or target.startswith(("http://", "https://", "data:")):
        return ""

    name = Path(target).name or target
    candidates: list[Path] = []
    target_path = Path(target)
    if not target_path.is_absolute():
        candidates.extend(
            [
                md_path.parent / target_path,
                md_path.parent / "img" / target_path,
                root / target_path,
            ]
        )
    for base in [
        md_path.parent,
        md_path.parent / "img",
        md_path.parent / "attachments",
        root,
        root / "img",
        root / "attachments",
    ]:
        candidates.append(base / name)

    resolved_root = root.resolve()
    for candidate in candidates:
        try:
            file_path = candidate.resolve()
            file_path.relative_to(resolved_root)
            if file_path.is_file():
                return note_asset_url(root_index, file_path.relative_to(resolved_root))
        except (ValueError, OSError):
            continue

    try:
        matches = [p for p in root.rglob(name) if p.is_file()]
        if matches:
            return note_asset_url(root_index, matches[0].relative_to(resolved_root))
    except (ValueError, OSError):
        pass
    return ""


def preprocess_markdown(
    raw: str,
    md_path: Path,
    root: Path,
    root_index: int,
) -> str:
    def obsidian_embed(match: re.Match) -> str:
        parts = match.group(1).split("|")
        name = parts[0].strip()
        src = resolve_image_source(name, md_path, root, root_index)
        if src:
            width_style = ""
            if len(parts) > 1 and parts[1].strip().isdigit():
                width_style = f' style="width:{parts[1].strip()}px;max-width:100%"'
            return (
                f'<img src="{src}" alt="{html.escape(name)}" loading="lazy"{width_style} />'
            )
        return f'<span class="obsidian-embed">图片：{html.escape(name)}</span>'

    def obsidian_link(match: re.Match) -> str:
        return html.escape(match.group(1).split("|")[0].strip())

    def markdown_image(match: re.Match) -> str:
        alt = match.group(1)
        target = match.group(2)
        src = resolve_image_source(target, md_path, root, root_index)
        if src:
            return f'<img src="{src}" alt="{html.escape(alt)}" loading="lazy" />'
        return match.group(0)

    raw = re.sub(r"!\[\[([^\]]+)\]\]", obsidian_embed, raw)
    raw = re.sub(r"\[\[([^\]]+)\]\]", obsidian_link, raw)
    raw = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+[\"'][^\"']*[\"'])?\)", markdown_image, raw)
    return raw


def render_markdown(raw: str, md_path: Path, root: Path, root_index: int) -> str:
    md_text = preprocess_markdown(raw, md_path, root, root_index)
    return markdown.markdown(
        md_text,
        extensions=[
            "extra",
            "fenced_code",
            "sane_lists",
            "tables",
            "codehilite",
        ],
        extension_configs={
            "codehilite": {
                "css_class": "highlight",
                "guess_lang": False,
                "noclasses": True,
            }
        },
        output_format="html5",
    )


PALETTES = {
    "green": "#2f7d62",
    "blue": "#3f6f9e",
    "coral": "#d95b43",
    "amber": "#c58a2d",
    "violet": "#765d9e",
    "slate": "#5d7282",
}


class PostStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._posts: dict[str, dict] = {}
        self._cache_stamp = ""
        self._state: dict = self._load_state()

    def _load_state(self) -> dict:
        if DATA_FILE.exists():
            try:
                with DATA_FILE.open("r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    return data
            except Exception:
                pass
        return {"posts": {}, "comments": {}}

    def _save_state(self) -> None:
        DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
        temp = DATA_FILE.with_suffix(".json.tmp")
        with temp.open("w", encoding="utf-8") as f:
            json.dump(self._state, f, ensure_ascii=False, indent=2)
        temp.replace(DATA_FILE)

    def _fingerprint(self) -> str:
        parts = []
        for root_index, root in enumerate(resolve_note_dirs()):
            try:
                parts.append(str(root.stat().st_mtime_ns))
            except Exception:
                continue
            for path in root.rglob("*.md"):
                try:
                    parts.append(f"{path.name}:{path.stat().st_mtime_ns}")
                except Exception:
                    continue
        return "|".join(sorted(parts))

    def _rebuild(self) -> None:
        posts: dict[str, dict] = {}
        for root_index, root in enumerate(resolve_note_dirs()):
            for path in sorted(root.rglob("*.md")):
                if path.name.startswith("_"):
                    continue
                try:
                    raw = path.read_text(encoding="utf-8")
                except Exception:
                    continue
                meta, body = split_frontmatter(raw)
                if meta.get("draft"):
                    continue

                rel = path.relative_to(root).with_suffix("")
                slug_parts = [slugify(part) for part in rel.parts]
                slug = "-".join(p for p in slug_parts if p)
                if not slug:
                    continue

                title = str(meta.get("title") or first_heading(body) or path.stem).strip()
                tags = meta.get("tags") or []
                if isinstance(tags, str):
                    tags = [t.strip() for t in tags.split(",") if t.strip()]
                if not isinstance(tags, list):
                    tags = []
                tags = [str(t).strip() for t in tags if str(t).strip()]

                summary = str(meta.get("summary") or "").strip()
                if not summary:
                    summary = plain_text(body)[:180]

                words = count_words(plain_text(body))
                color_key = str(meta.get("color") or "green").lower()
                post = {
                    "slug": slug,
                    "title": title,
                    "tags": tags,
                    "date": parse_date(meta.get("date"), path),
                    "updated": parse_date(meta.get("updated"), path),
                    "summary": summary,
                    "words": max(words, 1),
                    "reading_time": max(1, round(words / 260)),
                    "color": PALETTES.get(color_key, PALETTES["green"]),
                    "content_html": render_markdown(body, path, root, root_index),
                    "content_text": plain_text(body),
                    "source": str(path),
                }
                posts[slug] = post

        self._posts = posts
        self._cache_stamp = self._fingerprint()

    def posts(self, force: bool = False) -> dict[str, dict]:
        if force or self._fingerprint() != self._cache_stamp or not self._posts:
            with self._lock:
                if force or self._fingerprint() != self._cache_stamp or not self._posts:
                    self._rebuild()
        return self._posts

    def get(self, slug: str, force: bool = False) -> dict | None:
        return self.posts(force=force).get(slug)

    def _post_state(self, slug: str) -> dict:
        posts_state = self._state.setdefault("posts", {})
        item = posts_state.setdefault(slug, {"likes": 0, "liked_by": []})
        item.setdefault("likes", 0)
        item.setdefault("liked_by", [])
        return item

    def _comments(self, slug: str) -> list[dict]:
        comments = self._state.setdefault("comments", {})
        return comments.setdefault(slug, [])

    def summary(self, post: dict, visitor_id: str = "") -> dict:
        item = self._post_state(post["slug"])
        liked = bool(visitor_id) and visitor_id in item["liked_by"]
        return {
            "slug": post["slug"],
            "title": post["title"],
            "tags": post["tags"],
            "date": post["date"],
            "updated": post["updated"],
            "summary": post["summary"],
            "words": post["words"],
            "reading_time": post["reading_time"],
            "color": post["color"],
            "likes": item["likes"],
            "liked": liked,
            "comments_count": len(self._comments(post["slug"])),
        }

    def detail(self, post: dict, visitor_id: str = "") -> dict:
        item = self._post_state(post["slug"])
        liked = bool(visitor_id) and visitor_id in item["liked_by"]
        return {
            **self.summary(post, visitor_id),
            "content_html": post["content_html"],
            "comments": self._comments(post["slug"]),
            "liked": liked,
        }

    def stats(self) -> dict:
        posts = self.posts()
        total_likes = sum(self._post_state(slug)["likes"] for slug in posts)
        total_words = sum(post["words"] for post in posts.values())
        all_tags = {tag for post in posts.values() for tag in post["tags"]}
        return {
            "post_count": len(posts),
            "comment_count": sum(len(self._comments(slug)) for slug in posts),
            "like_count": total_likes,
            "word_count": total_words,
            "tag_count": len(all_tags),
        }

    def toggle_like(self, slug: str, visitor_id: str) -> dict:
        with self._lock:
            if not self.get(slug):
                return {}
            item = self._post_state(slug)
            liked_by = item["liked_by"]
            if visitor_id and visitor_id in liked_by:
                liked_by.remove(visitor_id)
                item["likes"] = max(0, item["likes"] - 1)
                liked = False
            else:
                if visitor_id:
                    liked_by.append(visitor_id)
                item["likes"] += 1
                liked = True
            self._save_state()
            return {"likes": item["likes"], "liked": liked}

    def add_comment(self, slug: str, author: str, content: str) -> dict:
        author = html.escape(author.strip()[:24] or "匿名")
        content = html.escape(content.strip())
        if not content or len(content) > 2000:
            return {}
        comment = {
            "id": secrets.token_hex(5),
            "author": author,
            "content": content,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M"),
        }
        with self._lock:
            if not self.get(slug):
                return {}
            comments = self._comments(slug)
            comments.append(comment)
            self._save_state()
        return comment

    def delete_comment(self, slug: str, comment_id: str) -> bool:
        if not self.get(slug):
            return False
        with self._lock:
            comments = self._comments(slug)
            for index, comment in enumerate(comments):
                if comment.get("id") == comment_id:
                    comments.pop(index)
                    self._save_state()
                    return True
        return False


STORE = PostStore()


class Handler(BaseHTTPRequestHandler):
    server_version = "NoteHub/1.0"

    def log_message(self, fmt: str, *args) -> None:
        return

    def _send_json(self, data: dict | list, status: int = 200) -> None:
        payload = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(payload)

    def _send_error(self, status: int, message: str) -> None:
        self._send_json({"error": message}, status)

    def _read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if length <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except Exception:
            return {}

    def _visitor_id(self) -> str:
        query = parse_qs(urlparse(self.path).query)
        return (query.get("visitor_id") or [""])[0].strip()

    def _serve_static(self, rel_path: str) -> bool:
        try:
            file_path = (PUBLIC_DIR / rel_path).resolve()
            file_path.relative_to(PUBLIC_DIR.resolve())
        except Exception:
            self._send_error(403, "forbidden")
            return True
        if not file_path.is_file():
            return False
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        if file_path.suffix in {".html", ".css", ".js", ".json", ".svg"}:
            content_type += "; charset=utf-8"
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)
        return True

    def _serve_note_asset(self, parsed) -> None:
        query = parse_qs(parsed.query)
        try:
            root_index = int((query.get("root") or ["-1"])[0])
        except ValueError:
            self._send_error(400, "invalid root")
            return

        roots = resolve_note_dirs()
        if not 0 <= root_index < len(roots):
            self._send_error(400, "invalid root")
            return

        rel_path = (query.get("path") or [""])[0].strip()
        if not rel_path:
            self._send_error(400, "invalid path")
            return

        root = roots[root_index].resolve()
        try:
            file_path = (root / rel_path).resolve()
            file_path.relative_to(root)
        except (ValueError, OSError):
            self._send_error(403, "forbidden")
            return

        if not file_path.is_file():
            self._send_error(404, "asset not found")
            return

        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        data = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=86400")
        self.end_headers()
        self.wfile.write(data)

    def _handle_get(self) -> None:
        parsed = urlparse(self.path)
        path = unquote(parsed.path)

        if path == "/note-asset":
            self._serve_note_asset(parsed)
            return

        if path == "/api/meta":
            self._send_json(
                {
                    "site": CONFIG.get("site", {}),
                    "stats": STORE.stats(),
                }
            )
            return

        if path == "/api/posts":
            query = parse_qs(parsed.query)
            q = (query.get("q") or [""])[0].strip().lower()
            tag = (query.get("tag") or [""])[0].strip()
            visitor_id = self._visitor_id()
            posts = [STORE.summary(post, visitor_id) for post in STORE.posts().values()]
            if q:
                posts = [
                    p
                    for p in posts
                    if q in p["title"].lower()
                    or q in p["summary"].lower()
                    or q in " ".join(p["tags"]).lower()
                ]
            if tag:
                posts = [p for p in posts if tag in p["tags"]]
            posts.sort(key=lambda p: (p["date"], p["title"]), reverse=True)
            self._send_json({"posts": posts, "stats": STORE.stats()})
            return

        if path.startswith("/api/posts/"):
            suffix = path[len("/api/posts/"):]
            if suffix.endswith("/comments"):
                slug = suffix[: -len("/comments")]
                post = STORE.get(slug)
                if not post:
                    self._send_error(404, "post not found")
                    return
                self._send_json(STORE._comments(slug))
                return
            if suffix.endswith("/like"):
                self._send_error(405, "method not allowed")
                return
            slug = suffix
            post = STORE.get(slug)
            if not post:
                self._send_error(404, "post not found")
                return
            self._send_json(STORE.detail(post, self._visitor_id()))
            return

        if path in {"/", "/index.html"}:
            self._serve_static("index.html")
            return

        rel = path.lstrip("/")
        if rel and self._serve_static(rel):
            return

        if not path.startswith("/api/"):
            self._serve_static("index.html")
            return

        self._send_error(404, "not found")

    def _handle_post(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path.startswith("/api/posts/"):
            suffix = path[len("/api/posts/"):]
            if suffix.endswith("/like"):
                slug = suffix[: -len("/like")]
                if not STORE.get(slug):
                    self._send_error(404, "post not found")
                    return
                body = self._read_json()
                visitor_id = str(body.get("visitor_id") or self._visitor_id()).strip()
                self._send_json(STORE.toggle_like(slug, visitor_id))
                return
            if suffix.endswith("/comments"):
                slug = suffix[: -len("/comments")]
                if not STORE.get(slug):
                    self._send_error(404, "post not found")
                    return
                body = self._read_json()
                comment = STORE.add_comment(
                    slug,
                    str(body.get("author") or ""),
                    str(body.get("content") or ""),
                )
                if not comment:
                    self._send_error(400, "comment content is required")
                    return
                self._send_json(comment, 201)
                return
        self._send_error(404, "not found")

    def _handle_delete(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path.startswith("/api/posts/"):
            suffix = path[len("/api/posts/"):]
            parts = suffix.split("/")
            if len(parts) == 3 and parts[1] == "comments":
                slug, comment_id = parts[0], parts[2]
                if STORE.delete_comment(slug, comment_id):
                    self._send_json({"ok": True})
                else:
                    self._send_error(404, "comment not found")
                return
        self._send_error(404, "not found")

    def do_GET(self) -> None:
        try:
            self._handle_get()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            traceback.print_exc()
            self._send_error(500, "internal server error")

    def do_POST(self) -> None:
        try:
            self._handle_post()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            traceback.print_exc()
            self._send_error(500, "internal server error")

    def do_DELETE(self) -> None:
        try:
            self._handle_delete()
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            traceback.print_exc()
            self._send_error(500, "internal server error")


def main() -> None:
    port = int(os.environ.get("PORT", CONFIG.get("port", 8000)))
    host = os.environ.get("HOST", CONFIG.get("host", "127.0.0.1"))
    server = ThreadingHTTPServer((host, port), Handler)
    print(f"拾光札记已启动: http://127.0.0.1:{port}")
    if host not in {"127.0.0.1", "localhost"}:
        print(f"局域网/公网监听地址: http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")


if __name__ == "__main__":
    main()
