const ICONS = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"></path><path d="M5 12h14"></path></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>',
};

const COLORS = ["green", "blue", "coral", "amber", "violet", "slate"];
const TOKEN_KEY = "notehub_admin_token";

const state = {
  token: localStorage.getItem(TOKEN_KEY) || "",
  posts: [],
  filter: "",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isForm = options.body instanceof FormData;
  if (!isForm) headers["Content-Type"] = "application/json";
  if (state.token) headers["X-Admin-Token"] = state.token;
  const response = await fetch(path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    state.token = "";
    localStorage.removeItem(TOKEN_KEY);
    document.getElementById("logoutBtn").hidden = true;
    route();
    throw new Error(data.error || "登录已过期");
  }
  if (!response.ok) throw new Error(data.error || "请求失败");
  return data;
}

// ---------- 登录 ----------

function renderLogin() {
  document.getElementById("logoutBtn").hidden = true;
  const app = document.getElementById("app");
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="loginForm">
        <h1>笔记后台</h1>
        <p>输入管理密码进入后台，可以在这里直接写笔记、编辑或删除。</p>
        <input id="loginPassword" type="password" placeholder="管理密码" autocomplete="current-password" required />
        <button type="submit" class="primary-btn">进入后台</button>
      </form>
    </div>`;
  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("loginPassword");
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const data = await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Token": "" },
        body: JSON.stringify({ password: input.value }),
      });
      state.token = data.token;
      localStorage.setItem(TOKEN_KEY, data.token);
      location.hash = "#/";
      route();
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  });
}

// ---------- 列表 ----------

function renderList() {
  document.getElementById("logoutBtn").hidden = false;
  const app = document.getElementById("app");
  const q = state.filter.trim().toLowerCase();
  const posts = state.posts.filter((post) => {
    if (!q) return true;
    return (
      post.title.toLowerCase().includes(q) ||
      post.path.toLowerCase().includes(q) ||
      post.tags.join(" ").toLowerCase().includes(q)
    );
  });

  app.innerHTML = `
    <section class="list-wrap">
      <div class="list-head">
        <div>
          <h1>笔记管理</h1>
          <p>共 ${state.posts.length} 篇 · 保存后自动 git 提交备份</p>
        </div>
        <a class="primary-btn" href="#/new">${ICONS.plus}新建笔记</a>
      </div>
      <div class="list-toolbar">
        <label class="search-box">
          <span class="search-icon">${ICONS.search}</span>
          <input id="listSearch" type="search" placeholder="按标题 / 路径 / 标签筛选" autocomplete="off" />
        </label>
      </div>
      <div class="post-table" id="postTable">
        ${posts.length ? posts.map(renderRow).join("") : `
          <div class="empty-state">
            ${ICONS.file}
            <h3>${state.filter ? "没有匹配的笔记" : "还没有笔记"}</h3>
            <p>${state.filter ? "换个关键词试试" : "点右上角「新建笔记」开始写第一篇"}</p>
          </div>`}
      </div>
    </section>`;

  const search = document.getElementById("listSearch");
  search.value = state.filter;
  search.addEventListener("input", () => {
    state.filter = search.value;
    renderList();
  });

  document.getElementById("postTable").addEventListener("click", async (event) => {
    const del = event.target.closest("[data-delete]");
    if (!del) return;
    if (!window.confirm(`确定删除「${del.dataset.delete}」吗？删除后不可恢复。`)) return;
    try {
      await api(`/api/admin/posts/${encodeURIComponent(del.dataset.path)}`, { method: "DELETE" });
      showToast("已删除");
      state.posts = state.posts.filter((p) => p.path !== del.dataset.path);
      renderList();
    } catch (error) {
      showToast(error.message);
    }
  });
}

function renderRow(post) {
  const draft = post.draft ? '<span class="badge badge-draft">草稿</span>' : "";
  return `
    <div class="post-row">
      <div class="post-row-main">
        <div class="post-row-title">
          <a href="#/edit/${encodeURIComponent(post.path)}">${escapeHtml(post.title)}</a>
          ${draft}
        </div>
        <div class="post-row-meta">
          <code>${escapeHtml(post.path)}</code>
          <span>${escapeHtml(post.date || "未设日期")}</span>
          <span>${post.words} 字</span>
          ${post.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
      <div class="post-row-actions">
        <a class="icon-btn" href="#/edit/${encodeURIComponent(post.path)}" title="编辑">${ICONS.edit}</a>
        <button class="icon-btn danger" data-delete="${escapeHtml(post.title)}" data-path="${escapeHtml(post.path)}" title="删除">${ICONS.trash}</button>
      </div>
    </div>`;
}

// ---------- 编辑器 ----------

function renderEditor(originalPath) {
  const app = document.getElementById("app");
  app.innerHTML = `
    <section class="editor-wrap">
      <a class="back-link" href="#/">${ICONS.arrowLeft}返回列表</a>
      <form id="noteForm" class="editor-card">
        <div class="editor-meta">
          <label>目录（相对后台根目录，留空为根）<input id="fDir" type="text" placeholder="例如：手撕Transformer" autocomplete="off" /></label>
          <label>文件名<small>留空则根据标题自动生成</small><input id="fFilename" type="text" placeholder="AddNorm" autocomplete="off" /></label>
          <label>标题<input id="fTitle" type="text" required placeholder="笔记标题" autocomplete="off" /></label>
          <label>日期<input id="fDate" type="date" /></label>
          <label>标签<small>逗号分隔</small><input id="fTags" type="text" placeholder="AI, 学习" autocomplete="off" /></label>
          <label>主题色<select id="fColor">${COLORS.map((c) => `<option value="${c}">${c}</option>`).join("")}</select></label>
          <label class="check-row"><input id="fDraft" type="checkbox" /> 草稿（前台不展示）</label>
        </div>
        <label class="summary-field">摘要<textarea id="fSummary" rows="2" placeholder="一句话摘要，留空自动截取正文开头"></textarea></label>
        <div class="editor-body">
          <div class="editor-pane">
            <div class="pane-head">
              <span>Markdown 正文</span>
              <div class="pane-tools">
                <label class="tool-btn" title="导入 .md 文件，解析后填入编辑器">上传 .md<input type="file" id="uploadMd" accept=".md" hidden /></label>
                <label class="tool-btn" title="上传图片到当前目录的 img/，插入光标处">插图<input type="file" id="uploadImg" accept="image/*" hidden /></label>
              </div>
            </div>
            <textarea id="fBody" class="md-input" rows="18" placeholder="# 标题&#10;&#10;支持标准 Markdown、Obsidian 图片语法 ![[img.png]]、代码块等"></textarea>
          </div>
          <div class="editor-pane preview-pane">
            <div class="pane-head">预览<span class="preview-state" id="previewState"></span></div>
            <div class="preview-body" id="previewBody"><p class="preview-empty">开始输入后自动预览，效果与前台一致</p></div>
          </div>
        </div>
        <div class="editor-actions">
          <button type="submit" class="primary-btn">${ICONS.save}保存笔记</button>
          ${originalPath ? `<button type="button" class="danger-btn" id="deleteBtn">删除这篇笔记</button>` : ""}
        </div>
      </form>
    </section>`;

  bindEditor(originalPath);
}

function bindEditor(originalPath) {
  const title = document.getElementById("fTitle");
  const filename = document.getElementById("fFilename");
  const body = document.getElementById("fBody");
  const dir = document.getElementById("fDir");
  const previewBody = document.getElementById("previewBody");
  const previewState = document.getElementById("previewState");
  let autoFilename = true;

  function slugifyClient(value) {
    return value
      .trim()
      .replace(/[\\/:*?"<>|#%{}\[\]]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function updatePreview() {
    if (!previewBody) return;
    clearTimeout(updatePreview.timer);
    previewState.textContent = "输入中…";
    updatePreview.timer = setTimeout(async () => {
      try {
        const data = await api("/api/admin/preview", {
          method: "POST",
          body: JSON.stringify({ body: body.value, dir: dir.value }),
        });
        previewBody.innerHTML = data.html;
        previewState.textContent = "";
      } catch (error) {
        previewState.textContent = "";
      }
    }, 350);
  }

  title.addEventListener("input", () => {
    if (autoFilename) {
      filename.value = slugifyClient(title.value);
    }
  });
  filename.addEventListener("input", () => {
    autoFilename = filename.value.trim() === "";
  });
  dir.addEventListener("input", updatePreview);
  body.addEventListener("input", updatePreview);

  function insertAtCursor(textarea, text) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    textarea.value = textarea.value.slice(0, start) + text + textarea.value.slice(end);
    const pos = start + text.length;
    textarea.setSelectionRange(pos, pos);
    textarea.focus();
  }

  document.getElementById("uploadMd").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (body.value.trim() && !window.confirm("导入会覆盖当前编辑内容，继续吗？")) return;
    const form = new FormData();
    form.append("file", file);
    const button = event.target.closest(".tool-btn");
    if (button) button.classList.add("busy");
    try {
      const data = await api("/api/admin/upload/md", { method: "POST", body: form });
      const imported = data.files && data.files[0];
      if (!imported) {
        showToast("没有解析到有效的 md 文件");
        return;
      }
      document.getElementById("fTitle").value = imported.meta.title || "";
      document.getElementById("fDate").value = imported.meta.date || "";
      document.getElementById("fTags").value = Array.isArray(imported.meta.tags) ? imported.meta.tags.join(", ") : "";
      document.getElementById("fSummary").value = imported.meta.summary || "";
      document.getElementById("fColor").value = COLORS.includes(imported.meta.color) ? imported.meta.color : "green";
      document.getElementById("fDraft").checked = Boolean(imported.meta.draft);
      document.getElementById("fFilename").value = imported.filename;
      document.getElementById("fBody").value = imported.body;
      updatePreview();
      showToast("已导入，检查后保存");
    } catch (error) {
      showToast(error.message);
    } finally {
      if (button) button.classList.remove("busy");
    }
  });

  document.getElementById("uploadImg").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("dir", dir.value);
    const button = event.target.closest(".tool-btn");
    if (button) button.classList.add("busy");
    try {
      const data = await api("/api/admin/upload/image", { method: "POST", body: form });
      insertAtCursor(body, data.embed);
      updatePreview();
      showToast(`已插入图片 ${data.name}`);
    } catch (error) {
      showToast(error.message);
    } finally {
      if (button) button.classList.remove("busy");
    }
  });

  if (originalPath) {
    document.getElementById("brandName").textContent = "编辑笔记";
    document.getElementById("noteForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveNote(originalPath);
    });
    document.getElementById("deleteBtn").addEventListener("click", async () => {
      if (!window.confirm("确定删除这篇笔记吗？删除后不可恢复。")) return;
      try {
        await api(`/api/admin/posts/${encodeURIComponent(originalPath)}`, { method: "DELETE" });
        showToast("已删除");
        location.hash = "#/";
      } catch (error) {
        showToast(error.message);
      }
    });
    loadNote(originalPath);
  } else {
    document.getElementById("brandName").textContent = "新建笔记";
    document.getElementById("fDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("noteForm").addEventListener("submit", (event) => {
      event.preventDefault();
      saveNote(null);
    });
  }
}

async function loadNote(originalPath) {
  try {
    const data = await api(`/api/admin/posts/${encodeURIComponent(originalPath)}`);
    document.getElementById("fDir").value = data.dir;
    document.getElementById("fFilename").value = data.filename.replace(/\.md$/i, "");
    document.getElementById("fTitle").value = data.meta.title || "";
    document.getElementById("fDate").value = data.meta.date || "";
    document.getElementById("fTags").value = Array.isArray(data.meta.tags) ? data.meta.tags.join(", ") : "";
    document.getElementById("fSummary").value = data.meta.summary || "";
    document.getElementById("fColor").value = COLORS.includes(data.meta.color) ? data.meta.color : "green";
    document.getElementById("fDraft").checked = Boolean(data.meta.draft);
    document.getElementById("fBody").value = data.body;
    const preview = document.getElementById("previewBody");
    const body = document.getElementById("fBody");
    const dir = document.getElementById("fDir");
    try {
      const rendered = await api("/api/admin/preview", {
        method: "POST",
        body: JSON.stringify({ body: body.value, dir: dir.value }),
      });
      preview.innerHTML = rendered.html;
    } catch (error) {
      /* 预览失败不影响编辑 */
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function saveNote(originalPath) {
  const payload = {
    dir: document.getElementById("fDir").value,
    filename: document.getElementById("fFilename").value,
    title: document.getElementById("fTitle").value,
    date: document.getElementById("fDate").value,
    tags: document.getElementById("fTags").value,
    summary: document.getElementById("fSummary").value,
    color: document.getElementById("fColor").value,
    draft: document.getElementById("fDraft").checked,
    body: document.getElementById("fBody").value,
  };
  const button = document.querySelector("#noteForm button[type=submit]");
  button.disabled = true;
  try {
    if (originalPath) {
      await api(`/api/admin/posts/${encodeURIComponent(originalPath)}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
    } else {
      await api("/api/admin/posts", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    }
    showToast("已保存，前台刷新即可看到");
    location.hash = "#/";
  } catch (error) {
    showToast(error.message);
    button.disabled = false;
  }
}

// ---------- 路由 ----------

function route() {
  const hash = location.hash || "#/";
  if (!state.token) {
    renderLogin();
    return;
  }
  if (hash.startsWith("#/edit/")) {
    renderEditor(decodeURIComponent(hash.slice("#/edit/".length)));
  } else if (hash === "#/new") {
    renderEditor(null);
  } else {
    loadList();
  }
}

async function loadList() {
  try {
    const data = await api("/api/admin/posts");
    state.posts = data.posts;
    renderList();
  } catch (error) {
    if (error.message !== "登录已过期") showToast(error.message);
  }
}

// ---------- 初始化 ----------

function init() {
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      await api("/api/admin/logout", { method: "POST" });
    } catch (error) {
      /* 忽略 */
    }
    state.token = "";
    localStorage.removeItem(TOKEN_KEY);
    location.hash = "#/";
    route();
  });
  window.addEventListener("hashchange", route);
  route();
}

init();
