const ICONS = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>',
  message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
  tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"></path><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"></circle></svg>',
  arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"></path><path d="M19 12H5"></path></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M10 14 21 3"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
};

const state = {
  site: {},
  posts: [],
  stats: {},
  query: "",
  tag: "",
  filter: "latest",
  visitorId: getVisitorId(),
};

function getVisitorId() {
  let id = localStorage.getItem("notehub_visitor");
  if (!id) {
    id = "v-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("notehub_visitor", id);
  }
  return id;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatDate(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function uniqueTags(posts) {
  const counts = new Map();
  posts.forEach((post) => {
    post.tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "请求失败");
  }
  return data;
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("visible"), 2200);
}

function renderHero(stats) {
  const site = state.site;
  const countText = stats.post_count || state.posts.length || 0;
  return `
    <section class="hero" style="background-image:url('${escapeHtml(site.hero || "/assets/hero.png")}')">
      <div class="hero-inner">
        <div class="hero-copy">
          <span class="hero-kicker">${escapeHtml(site.slogan || "个人笔记主页")}</span>
          <h1>${escapeHtml(site.name || "hasen的个人博客")}</h1>
          <p>${escapeHtml(site.bio || "")}</p>
          <div class="hero-stats">
            <div class="hero-stat"><strong>${countText}</strong><span>篇笔记</span></div>
            <div class="hero-stat"><strong>${stats.like_count || 0}</strong><span>个赞</span></div>
            <div class="hero-stat"><strong>${stats.comment_count || 0}</strong><span>条评论</span></div>
            <div class="hero-stat"><strong>${Math.round((stats.word_count || 0) / 1000) || 0}K</strong><span>累计字数</span></div>
          </div>
        </div>
        <div class="hero-avatar"><img src="${escapeHtml(site.avatar || "/assets/avatar.png")}" alt="${escapeHtml(site.name || "头像")}" /></div>
      </div>
    </section>`;
}

function renderSidebar() {
  const site = state.site;
  const tags = uniqueTags(state.posts);
  const recent = [...state.posts]
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 4);

  return `
    <aside class="sidebar">
      <section class="side-section side-about">
        <h3>关于</h3>
        <p>${escapeHtml(site.bio || "")}</p>
        <div class="side-links">
          ${(site.links || [])
            .map(
              (link) =>
                `<a class="side-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener">${ICONS.external}${escapeHtml(link.label)}</a>`,
            )
            .join("")}
        </div>
      </section>
      <section class="side-section">
        <h3>标签</h3>
        <div class="tag-cloud">
          ${tags
            .map(
              ([tag, count]) =>
                `<button class="tag-chip ${state.tag === tag ? "active" : ""}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} · ${count}</button>`,
            )
            .join("")}
        </div>
      </section>
      <section class="side-section">
        <h3>最近更新</h3>
        <div class="recent-list">
          ${recent
            .map(
              (post) =>
                `<div class="recent-item">
                  <a href="#/post/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a>
                  <span>${escapeHtml(formatDate(post.date))}</span>
                </div>`,
            )
            .join("")}
        </div>
      </section>
    </aside>`;
}

function filterPosts() {
  let posts = state.posts.slice();
  const q = state.query.trim().toLowerCase();
  if (q) {
    posts = posts.filter((post) => {
      const haystack = `${post.title} ${post.summary} ${post.tags.join(" ")}`.toLowerCase();
      return haystack.includes(q);
    });
  }
  if (state.tag) {
    posts = posts.filter((post) => post.tags.includes(state.tag));
  }
  if (state.filter === "hot") {
    posts.sort((a, b) => b.likes - a.likes || String(b.date).localeCompare(String(a.date)));
  } else {
    posts.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
  }
  return posts;
}

function renderCard(post) {
  return `
    <article class="post-card" data-slug="${escapeHtml(post.slug)}" style="--post-color:${escapeHtml(post.color || "#1d6d5a")}">
      <div class="card-accent"></div>
      <div class="card-body">
        <div class="card-kicker">
          <span class="card-tag">${ICONS.tag}${escapeHtml(post.tags[0] || "笔记")}</span>
          <time class="card-date">${escapeHtml(formatDate(post.date))}</time>
        </div>
        <h3><a href="#/post/${encodeURIComponent(post.slug)}">${escapeHtml(post.title)}</a></h3>
        <p>${escapeHtml(post.summary)}</p>
      </div>
      <div class="card-meta">
        <span class="meta-item">${ICONS.clock}${escapeHtml(post.reading_time)} 分钟</span>
        <span class="meta-item">${ICONS.message}${escapeHtml(post.comments_count)}</span>
        <button class="like-button ${post.liked ? "liked" : ""}" data-like-slug="${escapeHtml(post.slug)}" aria-label="点赞">
          ${ICONS.heart}<span data-like-count>${escapeHtml(post.likes)}</span>
        </button>
      </div>
    </article>`;
}

function renderFeed() {
  const posts = filterPosts();
  const countText = state.query || state.tag ? `找到 ${posts.length} 篇` : `${state.posts.length} 篇笔记`;
  return `
    <section class="layout">
      <div class="feed">
        <div class="feed-head">
          <div>
            <h2>笔记帖</h2>
            <p>${countText}</p>
          </div>
          <div class="segmented" role="tablist" aria-label="排序">
            <button class="${state.filter === "latest" ? "active" : ""}" data-filter="latest">最新</button>
            <button class="${state.filter === "hot" ? "active" : ""}" data-filter="hot">热门</button>
          </div>
        </div>
        <div class="post-list" id="postList">
          ${posts.length ? posts.map(renderCard).join("") : `
            <div class="empty-state">
              ${ICONS.file}
              <h3>还没有匹配的笔记</h3>
              <p>换个关键词，或者先看看全部帖子。</p>
            </div>`}
        </div>
      </div>
      ${renderSidebar()}
    </section>`;
}

function bindHomeEvents() {
  document.querySelectorAll(".segmented button").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      renderHome();
    });
  });

  document.querySelectorAll("[data-tag]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tag = state.tag === button.dataset.tag ? "" : button.dataset.tag;
      renderHome();
    });
  });

  document.getElementById("postList")?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-like-slug]");
    if (!button) return;
    const slug = button.dataset.likeSlug;
    button.disabled = true;
    try {
      const data = await api(`/api/posts/${encodeURIComponent(slug)}/like`, {
        method: "POST",
        body: JSON.stringify({ visitor_id: state.visitorId }),
      });
      const post = state.posts.find((item) => item.slug === slug);
      if (post) {
        post.likes = data.likes;
        post.liked = data.liked;
      }
      button.classList.toggle("liked", data.liked);
      button.querySelector("[data-like-count]").textContent = data.likes;
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
}

function renderHome() {
  const app = document.getElementById("app");
  app.innerHTML = renderHero(state.stats) + renderFeed();
  document.getElementById("brandName").textContent = state.site.name || "hasen的个人博客";
  document.getElementById("footerName").textContent = state.site.name || "hasen的个人博客";
  bindHomeEvents();
}

function renderComment(comment, index) {
  const initial = escapeHtml((comment.author || "匿").slice(0, 1));
  return `
    <div class="comment-item">
      <div class="comment-avatar">${initial}</div>
      <div class="comment-main">
        <div class="comment-head">
          <strong>${escapeHtml(comment.author || "匿名")}</strong>
          <span>${escapeHtml(comment.created_at || "")}</span>
          <button class="comment-delete" data-comment-id="${escapeHtml(comment.id)}" title="删除评论" aria-label="删除评论">
            ${ICONS.trash}<span>删除</span>
          </button>
        </div>
        <p>${escapeHtml(comment.content)}</p>
      </div>
    </div>`;
}

function renderPost(post) {
  const tags = post.tags
    .map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`)
    .join("");

  return `
    <article class="article">
      <a class="back-link" href="#/">${ICONS.arrowLeft}返回全部</a>
      <header class="article-head">
        <div class="article-kicker">${tags || `<span class="tag-chip">笔记</span>`}</div>
        <h1>${escapeHtml(post.title)}</h1>
        <p class="article-summary">${escapeHtml(post.summary)}</p>
        <div class="article-meta">
          <span class="meta-item">${ICONS.clock}${escapeHtml(post.reading_time)} 分钟</span>
          <span class="meta-item">${ICONS.message}${escapeHtml(post.comments_count)} 条评论</span>
          <time>${escapeHtml(formatDate(post.date))}</time>
        </div>
      </header>
      <div class="article-actions">
        <button class="action-button ${post.liked ? "liked" : ""}" id="detailLike">
          ${ICONS.heart}<span id="detailLikeText">${escapeHtml(post.likes)} 赞</span>
        </button>
        <a class="action-button" href="#comments">${ICONS.message}评论</a>
      </div>
      <div class="article-body">${post.content_html}</div>
      <section class="comments" id="comments">
        <div class="comments-head">
          <h2>评论</h2>
          <span>${post.comments.length} 条</span>
        </div>
        <form class="comment-form" id="commentForm">
          <input id="commentAuthor" maxlength="24" placeholder="昵称" autocomplete="off" />
          <textarea id="commentContent" maxlength="1200" placeholder="写下你的评论" required></textarea>
          <button type="submit">发布评论</button>
        </form>
        <div class="comment-list" id="commentList">
          ${post.comments.length ? post.comments.map(renderComment).join("") : `<div class="no-comments">还没有评论。</div>`}
        </div>
      </section>
    </article>`;
}

function bindPostEvents(post) {
  const likeButton = document.getElementById("detailLike");
  likeButton.addEventListener("click", async () => {
    likeButton.disabled = true;
    try {
      const data = await api(`/api/posts/${encodeURIComponent(post.slug)}/like`, {
        method: "POST",
        body: JSON.stringify({ visitor_id: state.visitorId }),
      });
      likeButton.classList.toggle("liked", data.liked);
      document.getElementById("detailLikeText").textContent = `${data.likes} 赞`;
    } catch (error) {
      showToast(error.message);
    } finally {
      likeButton.disabled = false;
    }
  });

  document.getElementById("commentForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const author = document.getElementById("commentAuthor").value.trim();
    const content = document.getElementById("commentContent").value.trim();
    if (!content) {
      showToast("评论不能为空");
      return;
    }
    const button = event.target.querySelector("button");
    button.disabled = true;
    try {
      const comment = await api(`/api/posts/${encodeURIComponent(post.slug)}/comments`, {
        method: "POST",
        body: JSON.stringify({ author, content }),
      });
      post.comments.push(comment);
      post.comments_count += 1;
      document.getElementById("commentAuthor").value = "";
      document.getElementById("commentContent").value = "";
      document.getElementById("commentList").innerHTML = post.comments.map(renderComment).join("");
      document.querySelector(".comments-head span").textContent = `${post.comments.length} 条`;
      showToast("评论已发布");
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  document.getElementById("commentList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-comment-id]");
    if (!button) return;
    if (!window.confirm("确定删除这条评论吗？")) return;
    const commentId = button.dataset.commentId;
    button.disabled = true;
    try {
      await api(`/api/posts/${encodeURIComponent(post.slug)}/comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
      post.comments = post.comments.filter((comment) => comment.id !== commentId);
      post.comments_count = post.comments.length;
      const list = document.getElementById("commentList");
      list.innerHTML = post.comments.length
        ? post.comments.map(renderComment).join("")
        : '<div class="no-comments">还没有评论。</div>';
      document.querySelector(".comments-head span").textContent = `${post.comments.length} 条`;
      showToast("评论已删除");
    } catch (error) {
      showToast(error.message);
      button.disabled = false;
    }
  });
}

async function showPost(slug) {
  const app = document.getElementById("app");
  app.innerHTML = `<section class="layout"><div class="empty-state">${ICONS.file}<h3>正在打开笔记</h3></div></section>`;
  try {
    const data = await api(`/api/posts/${encodeURIComponent(slug)}?visitor_id=${encodeURIComponent(state.visitorId)}`);
    document.title = `${data.title} · ${state.site.name || "hasen的个人博客"}`;
    app.innerHTML = renderPost(data);
    bindPostEvents(data);
    window.scrollTo({ top: 0, behavior: "auto" });
  } catch (error) {
    app.innerHTML = `<section class="layout"><div class="empty-state">${ICONS.file}<h3>笔记不存在</h3><p>${escapeHtml(error.message)}</p></div></section>`;
  }
}

function route() {
  const hash = location.hash || "#/";
  if (hash.startsWith("#/post/")) {
    showPost(decodeURIComponent(hash.slice("#/post/".length)));
  } else {
    document.title = `${state.site.name || "hasen的个人博客"} · 个人主页`;
    renderHome();
  }
}

async function init() {
  const searchInput = document.getElementById("searchInput");
  let debounce;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = searchInput.value;
      if (!location.hash || location.hash === "#/") {
        renderHome();
      }
    }, 180);
  });

  window.addEventListener("hashchange", route);
  try {
    const [meta, list] = await Promise.all([
      api("/api/meta"),
      api(`/api/posts?visitor_id=${encodeURIComponent(state.visitorId)}`),
    ]);
    state.site = meta.site;
    state.stats = meta.stats;
    state.posts = list.posts;
    if (list.stats) state.stats = { ...state.stats, ...list.stats };
    route();
  } catch (error) {
    document.getElementById("app").innerHTML = `
      <section class="layout">
        <div class="empty-state">${ICONS.file}<h3>服务暂时不可用</h3><p>${escapeHtml(error.message)}</p></div>
      </section>`;
  }
}

init();
