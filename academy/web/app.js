"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const view = $("#view");
const ICON = { passed: "✓", in_progress: "●", not_started: "○", locked: "🔒", planned: "" };
const STATUS_LABEL = { passed: "Đã xong", in_progress: "Đang học", not_started: "Chưa học", locked: "Đang khóa", planned: "Sắp có" };
const TRACK = { "AI": "ai", "Data": "data", "AI×Data": "aixdata", "Nâng cao": "adv" };
const GROUP_COLORS = ["#E9A23B", "#3D6EF5", "#12A27A", "#E2557F", "#8B5CF6", "#5B7A99", "#C2681E", "#0EA5B7"];
let courseId = null; // khóa đang mở (null = thư viện khóa học)
let courses = null; // GET /api/courses
let roadmap = null;
let current = null; // {id, lesson, tab, iv, guide}
let tutorMsgs = {}; // "<khóa>/<bài>" -> messages

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};
// localStorage theo khóa học (c:<khóa>:<key>); khóa "ai" còn đọc key cũ không có tiền tố
const cstore = {
  get(k, d) { const v = store.get(`c:${courseId}:${k}`, undefined); return v !== undefined ? v : courseId === "ai" ? store.get(k, d) : d; },
  set(k, v) { store.set(`c:${courseId}:${k}`, v); },
};
let safeMarked = null;
function md(text, safe = false) {
  if (!window.marked) return "<pre>" + esc(text) + "</pre>";
  if (!safe) return marked.parse(text || "", { gfm: true, breaks: false });
  // Văn bản do LLM sinh: hiện HTML thô dưới dạng chữ, bỏ link không phải http(s)
  safeMarked = safeMarked || new marked.Marked({ gfm: true, breaks: false, renderer: {
    html: (h) => esc(typeof h === "string" ? h : h.text),
    link: (href, title, text) => (/^https?:/i.test(href || "") ? false : text),
  } });
  return safeMarked.parse(text || "");
}
async function api(path, opts) {
  const o = opts ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(opts.body || {}) } : {};
  const r = await fetch("/api" + path, o);
  let data = null;
  try { data = await r.json(); } catch (_) { /* no body */ }
  if (!r.ok) {
    const e = new Error((data && (data.error || data.detail)) || "Lỗi " + r.status);
    e.status = r.status; e.data = data; throw e;
  }
  return data;
}
const capi = (path, opts) => api("/c/" + encodeURIComponent(courseId) + path, opts);
const courseHref = (cid) => "#/c/" + encodeURIComponent(cid) + "/";
const projHref = (pid) => courseHref(courseId) + "project/" + encodeURIComponent(pid);
const lessonHref = (id) => courseHref(courseId) + "lesson/" + encodeURIComponent(id);
const allLessons = () => roadmap.projects.flatMap((p) => p.lessons.map((l) => ({ ...l, project: p })));
const lessonById = (id) => allLessons().find((l) => l.id === id);
const shortId = (id) => String(id).split("-")[0];

/* ---------- Theme ---------- */
function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === "light" || t === "dark") return t;
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function setTheme(mode) { // "auto" | "light" | "dark"
  if (mode === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = mode;
  try { mode === "auto" ? localStorage.removeItem("theme") : localStorage.setItem("theme", mode); } catch (_) {}
  const label = { auto: "Giao diện: theo hệ thống", light: "Giao diện: sáng", dark: "Giao diện: tối" }[mode];
  const b = $("#theme-toggle"); b.title = label + " (bấm để đổi)"; b.setAttribute("aria-label", label);
  b.textContent = { auto: "◐", light: "☀", dark: "☾" }[mode];
  onThemeChange();
}
function onThemeChange() {
  initMermaid();
  rerenderMermaid();
  if (current === null && $("#kg")) drawGraph();
}
$("#theme-toggle").onclick = () => {
  const cur = document.documentElement.dataset.theme || "auto";
  setTheme({ auto: "light", light: "dark", dark: "auto" }[cur]);
};
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!document.documentElement.dataset.theme) onThemeChange(); });

/* ---------- Markdown → UI (callout, mermaid, code + kết quả) ---------- */
const CALLOUTS = [["💡", "tip"], ["⚠️", "warn"], ["⚠", "warn"], ["🧠", "remember"], ["🎯", "interview"], ["⚖️", "compare"], ["⚖", "compare"]];
const LANG = { py: "python", python: "python", python3: "python", sh: "bash", bash: "bash", shell: "bash", console: "bash", zsh: "bash", json: "json",
  js: "javascript", javascript: "javascript", mjs: "javascript", cjs: "javascript", node: "javascript", html: "xml", xml: "xml" };
const LANG_LABEL = { python: "Python", bash: "Terminal", json: "JSON", javascript: "JavaScript", xml: "HTML" };
let mermaidReady = false;
function initMermaid() {
  if (!window.mermaid) return;
  const dark = effectiveTheme() === "dark";
  mermaid.initialize({
    startOnLoad: false, securityLevel: "strict", theme: "base",
    fontFamily: "'Be Vietnam Pro', system-ui, sans-serif",
    flowchart: { htmlLabels: true, curve: "basis", padding: 12 },
    themeVariables: dark ? {
      darkMode: true, background: "transparent", fontSize: "15px",
      primaryColor: "#173238", primaryTextColor: "#E4F2F1", primaryBorderColor: "#3CC9C0",
      secondaryColor: "#2A2113", secondaryTextColor: "#FFE2B3", secondaryBorderColor: "#E8A33A",
      tertiaryColor: "#1B222B", tertiaryTextColor: "#E6EBF0", tertiaryBorderColor: "#3A4654",
      lineColor: "#8FA6AC", textColor: "#E6EBF0", mainBkg: "#173238", nodeBorder: "#3CC9C0",
      clusterBkg: "#121A20", clusterBorder: "#2C3C44", edgeLabelBackground: "#121A20",
      actorBkg: "#173238", actorBorder: "#3CC9C0", actorTextColor: "#E4F2F1", signalColor: "#B5C5CA", signalTextColor: "#E6EBF0",
      noteBkgColor: "#2A2113", noteTextColor: "#FFE2B3", noteBorderColor: "#E8A33A", labelBoxBkgColor: "#173238", labelTextColor: "#E4F2F1",
    } : {
      darkMode: false, background: "transparent", fontSize: "15px",
      primaryColor: "#E3F4F2", primaryTextColor: "#0B3B3A", primaryBorderColor: "#0E8C88",
      secondaryColor: "#FFF1DA", secondaryTextColor: "#6B3B00", secondaryBorderColor: "#E08A00",
      tertiaryColor: "#FFFFFF", tertiaryTextColor: "#18212B", tertiaryBorderColor: "#C9D3DC",
      lineColor: "#5B6B73", textColor: "#18212B", mainBkg: "#E3F4F2", nodeBorder: "#0E8C88",
      clusterBkg: "#F6FAFA", clusterBorder: "#C6DCDA", edgeLabelBackground: "#FFFFFF",
      actorBkg: "#E3F4F2", actorBorder: "#0E8C88", actorTextColor: "#0B3B3A", signalColor: "#4A5562", signalTextColor: "#18212B",
      noteBkgColor: "#FFF1DA", noteTextColor: "#6B3B00", noteBorderColor: "#E08A00", labelBoxBkgColor: "#E3F4F2", labelTextColor: "#0B3B3A",
    },
  });
  mermaidReady = true;
}
let mermaidSeq = 0, mermaidQueue = Promise.resolve();
function renderMermaid(root = document) {
  const nodes = $$(".mmd:not([data-done])", root);
  if (!nodes.length) return mermaidQueue;
  nodes.forEach((n) => n.dataset.done = "pending");
  mermaidQueue = mermaidQueue.then(async () => {
    if (!window.mermaid) { nodes.forEach((n) => { n.innerHTML = `<pre class="mmd-src">${esc(n.dataset.src)}</pre>`; n.dataset.done = "1"; }); return; }
    if (!mermaidReady) initMermaid();
    try { await document.fonts.ready; } catch (_) { /* không hỗ trợ */ }
    for (const n of nodes) {
      const id = "mmd" + (++mermaidSeq);
      try {
        const { svg } = await mermaid.render(id, n.dataset.src);
        n.innerHTML = svg;
        const el = $("svg", n), nat = el && parseFloat(el.style.maxWidth);
        if (nat) n.style.setProperty("--nat", nat + "px");
      } catch (e) {
        n.innerHTML = `<div class="mmd-err">Không vẽ được sơ đồ — hiển thị mã nguồn:</div><pre class="mmd-src">${esc(n.dataset.src)}</pre>`;
        const junk = document.getElementById("d" + id); if (junk) junk.remove();
      }
      n.dataset.done = "1";
    }
  });
  return mermaidQueue;
}
function rerenderMermaid() { $$(".mmd[data-done]").forEach((n) => delete n.dataset.done); renderMermaid(); }

function copyBtn(getText, label = "Sao chép") {
  const b = document.createElement("button");
  b.type = "button"; b.className = "copy"; b.textContent = label;
  b.onclick = async () => {
    try { await navigator.clipboard.writeText(getText()); b.textContent = "Đã chép ✓"; }
    catch (_) { b.textContent = "Bôi đen rồi Ctrl+C"; }
    setTimeout(() => (b.textContent = label), 1600);
  };
  return b;
}

function enhance(root) {
  // Callout: > 💡 **Mẹo:** …
  $$("blockquote", root).forEach((bq) => {
    const t = bq.textContent.trim();
    const hit = CALLOUTS.find(([e]) => t.startsWith(e));
    if (hit) bq.classList.add("callout", "c-" + hit[1]);
  });
  // Bảng: bọc để cuộn ngang
  $$("table", root).forEach((t) => { const w = document.createElement("div"); w.className = "tablewrap"; t.replaceWith(w); w.appendChild(t); });
  // Code blocks
  $$("pre > code", root).forEach((code) => {
    const pre = code.parentElement;
    const m = (code.className || "").match(/language-([\w+-]+)/);
    const raw = m ? m[1].toLowerCase() : "";
    if (raw === "mermaid") {
      const d = document.createElement("div");
      d.className = "mmd"; d.dataset.src = code.textContent; d.setAttribute("role", "img"); d.setAttribute("aria-label", "Sơ đồ");
      d.innerHTML = '<div class="mmd-loading">Đang vẽ sơ đồ…</div>';
      pre.replaceWith(d); return;
    }
    if (raw === "output" || raw === "text-output" || raw === "out") { pre.classList.add("output"); return; }
    const lang = LANG[raw];
    if (lang && window.hljs) { try { code.classList.add("language-" + lang); hljs.highlightElement(code); } catch (_) {} }
    const box = document.createElement("div");
    box.className = "codebox";
    const head = document.createElement("div");
    head.className = "codehead";
    head.innerHTML = `<span>${esc(lang ? LANG_LABEL[lang] : (raw || "Code"))}</span>`;
    head.appendChild(copyBtn(() => code.textContent));
    pre.replaceWith(box); box.append(head, pre);
  });
  // Demo: code python + ```output ngay sau → 1 thẻ "Code ▸ Kết quả"
  $$(".codebox", root).forEach((box) => {
    const next = box.nextElementSibling;
    if (next && next.matches("pre.output")) {
      const demo = document.createElement("figure");
      demo.className = "demo";
      box.replaceWith(demo);
      const lab = document.createElement("div"); lab.className = "demo-out"; lab.innerHTML = "<span>▸ Kết quả</span>";
      demo.append(box, lab, next);
    }
  });
  $$("pre.output", root).forEach((p) => { if (!p.closest(".demo")) { const f = document.createElement("figure"); f.className = "demo solo"; p.replaceWith(f); const lab = document.createElement("div"); lab.className = "demo-out"; lab.innerHTML = "<span>▸ Kết quả</span>"; f.append(lab, p); } });
  $$("a[href^='http']", root).forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
  renderMermaid(root);
  return root;
}
function mdEl(text, cls = "md", safe = false) {
  const d = document.createElement("div");
  d.className = cls; d.innerHTML = md(text, safe);
  return enhance(d);
}
const mdHTML = (text, cls = "md", safe = false) => mdEl(text, cls, safe).outerHTML; // chỉ dùng khi không có mermaid/nút

/* ---------- Tách lesson.md ---------- */
function isFence(line) { return /^\s*(```|~~~)/.test(line); }
function splitLesson(text) {
  const out = { intro: "", goal: "", task: "", check: "", steps: "", concepts: "", interview: "", extra: [] };
  let intro = [], cur = null, fence = false;
  const push = () => {
    if (!cur) return;
    const t = cur.title.toLowerCase().replace(/^[^\p{L}]+/u, "").trim(), body = cur.lines.join("\n").trim();
    if (t.includes("phỏng vấn")) { out.interview += body; return; } // mẹo 🎯 → tab Phỏng vấn thử
    if (t.startsWith("mục tiêu")) out.goal += body;
    else if (t.startsWith("đề bài") || t.startsWith("nhiệm vụ")) out.task += body;
    else if (t.startsWith("tự kiểm tra")) out.check += body;
    else if (/^làm\b/.test(t) || t.startsWith("các bước")) out.steps += body;
    else if (t.startsWith("tại sao") || t.startsWith("kiến thức")) out.concepts += body;
    else out.extra.push({ title: cur.title, body });
  };
  for (const line of String(text).split("\n")) {
    if (isFence(line)) fence = !fence;
    if (!fence && /^# [^#]/.test(line) && !cur) continue;
    const m = !fence && line.match(/^## +(.*)$/);
    if (m) { push(); cur = { title: m[1].trim(), lines: [] }; }
    else if (cur) cur.lines.push(line); else intro.push(line);
  }
  push();
  out.intro = intro.join("\n").trim();
  return out;
}
function splitH3(body) {
  const items = []; let pre = [], cur = null, fence = false;
  for (const line of String(body).split("\n")) {
    if (isFence(line)) fence = !fence;
    const m = !fence && line.match(/^### +(.*)$/);
    if (m) { if (cur) items.push(cur); cur = { title: m[1].trim(), lines: [] }; }
    else if (cur) cur.lines.push(line); else pre.push(line);
  }
  if (cur) items.push(cur);
  return { pre: pre.join("\n").trim(), items: items.map((i) => ({ title: i.title, body: i.lines.join("\n").trim() })) };
}

/* ---------- Sidebar ---------- */
async function loadRoadmap() { roadmap = await capi("/roadmap"); renderSidebar(); }
const isNode = () => roadmap && roadmap.language === "node";
const productName = () => (roadmap.product && roadmap.product.name) || "";
function applyCourse() { // logo, tên khóa, link về thư viện và tiêu đề tab theo khóa đang mở
  const lib = !roadmap, short = lib ? "" : roadmap.short_title || roadmap.title;
  $(".logo-mark").textContent = lib ? "AI" : roadmap.logo_mark || (isNode() ? "JS" : "AI");
  $(".logo-name").textContent = lib ? "Academy" : short;
  $(".logo").href = lib ? "#/" : courseHref(courseId);
  const nl = $("#nav-lib"), nh = $("#nav-home"), sc = $("#side-course");
  nl.innerHTML = lib ? '<span aria-hidden="true">📚</span> Thư viện khóa học' : '<span aria-hidden="true">←</span> Tất cả khóa học';
  nl.classList.toggle("active", lib); nl.classList.toggle("back", !lib);
  nh.hidden = lib; nh.href = lib ? "#/" : courseHref(courseId);
  sc.hidden = lib; sc.textContent = lib ? "" : roadmap.title;
  document.title = lib ? "Thư viện khóa học · AI Academy" : `${short} · AI Academy`;
}
function renderLibSidebar() {
  const cs = courses || [], tot = cs.reduce((a, c) => a + c.lessons, 0), done = cs.reduce((a, c) => a + c.passed, 0);
  $("#overall-bar").style.width = (tot ? (100 * done) / tot : 0) + "%";
  $("#overall-text").textContent = `${cs.length} khóa học · ${done}/${tot} bài đã xong`;
  $("#roadmap").innerHTML = cs.length ? `<div class="proj"><h4>Khóa học</h4>${cs.map((c) => `<a class="lesson-link course-link" href="${courseHref(c.id)}" title="${esc(c.title)}">
    <span class="ic cmark" aria-hidden="true">${esc(c.logo_mark)}</span><span class="lt">${esc(c.short_title)}</span><span class="tag">${c.passed}/${c.lessons}</span></a>`).join("")}</div>` : "";
}
function renderSidebar() {
  applyCourse();
  if (!roadmap) { renderLibSidebar(); return; }
  const s = roadmap.summary;
  $("#overall-bar").style.width = (s.total ? (100 * s.passed) / s.total : 0) + "%";
  $("#overall-text").textContent = `${s.passed}/${s.total} bài đã xong` + (s.planned ? ` · ${s.planned} bài sắp có` : "");
  $("#nav-home").classList.toggle("active", !current);
  $("#roadmap").innerHTML = roadmap.projects.map((p) => `
    <div class="proj t-${TRACK[p.track] || "ai"}"><h4><a href="${projHref(p.id)}" title="Giới thiệu project"${location.hash === projHref(p.id) ? ' aria-current="page"' : ""}><span class="dot"></span>${esc(p.id)} · ${esc(p.title)}</a></h4>
    ${p.lessons.filter((l) => l.status !== "planned").map((l) => {
      const active = current && current.id === l.id ? " active" : "";
      return `<a class="lesson-link st-${l.status}${active}" href="${lessonHref(l.id)}" title="${esc(l.goal || "")}"${active ? ' aria-current="page"' : ""}>
        <span class="ic" aria-label="${STATUS_LABEL[l.status] || ""}">${ICON[l.status] || ""}</span><span class="lt">${esc(l.title)}</span></a>`;
    }).join("")}
    ${(() => { const soon = p.lessons.filter((l) => l.status === "planned"); return soon.length ? `<details class="soon"><summary>${soon.length} bài sắp có</summary>
      ${soon.map((l) => `<div class="lesson-link st-planned disabled" title="${esc(l.goal || "")}"><span class="ic"></span><span class="lt">${esc(l.title)}</span></div>`).join("")}</details>` : ""; })()}</div>`).join("");
}

/* ---------- Router ---------- */
// #/ thư viện · #/c/<khóa>/ trang chủ khóa · #/c/<khóa>/project/<PID> · #/c/<khóa>/lesson/<id>
async function route() {
  const h = location.hash || "#/";
  const old = h.match(/^#\/(lesson|project)\/(.+)$/); // link cũ (trước khi có nhiều khóa) → khóa AI
  if (old) { location.replace(`#/c/ai/${old[1]}/${old[2]}`); return; }
  const m = h.match(/^#\/c\/([^/]+)\/?(.*)$/);
  try {
    if (!m) await showLibrary();
    else {
      const cid = decodeURIComponent(m[1]), rest = m[2];
      if (cid !== courseId || !roadmap) { courseId = cid; roadmap = null; current = null; await loadRoadmap(); }
      if (rest.startsWith("lesson/")) {
        const id = decodeURIComponent(rest.slice(7)), l = lessonById(id);
        // Lần đầu bước vào một project chưa học: xem trang giới thiệu trước
        if (l && l.project.lessons[0].id === id && !projStarted(l.project) && !cstore.get(introKey(l.project.id), false)) {
          location.replace(projHref(l.project.id)); return;
        }
        await showLesson(id); return;
      }
      current = null; setTutorLesson(null); $("#main").classList.remove("fill");
      if (rest.startsWith("project/")) showProject(decodeURIComponent(rest.slice(8))); else showHome();
      renderSidebar();
    }
    $("#main").scrollTop = 0;
  } catch (e) {
    current = null; $("#main").classList.remove("fill");
    if (m && !roadmap) renderSidebar();
    view.innerHTML = `<div class="col"><p class="err">${esc(e.message)}</p><p><a href="#/">← Về thư viện khóa học</a></p></div>`;
  }
  if (innerWidth <= 760) sideHide(true);
}

/* ---------- Thư viện khóa học ---------- */
const greeting = () => { const h = new Date().getHours(); return h < 11 ? "Chào buổi sáng" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối"; };
async function showLibrary() {
  courseId = null; roadmap = null; current = null;
  setTutorLesson(null); $("#main").classList.remove("fill");
  courses = await api("/courses");
  renderSidebar();
  view.innerHTML = `<div class="home lib">
    <section class="lib-hero">
      <p class="eyebrow">${greeting()} 👋</p>
      <h1>Thư viện khóa học</h1>
      <p class="hero-sub">Mỗi khóa là một sản phẩm thật bạn tự tay xây, qua từng project. Tiến độ của mỗi khóa được lưu riêng.</p>
    </section>
    ${courses.length ? `<ul class="lib-grid">${courses.map(courseCard).join("")}</ul>`
      : '<p class="meta">Chưa có khóa học nào. Tạo <code>academy/courses/&lt;id&gt;/curriculum/roadmap.json</code> để thêm khóa.</p>'}
  </div>`;
}
function courseCard(c) {
  const pct = c.lessons ? Math.round((100 * c.passed) / c.lessons) : 0, started = c.passed + c.in_progress > 0;
  return `<li><a class="lib-card lang-${esc(c.language)}" href="${courseHref(c.id)}">
    <span class="lib-top"><span class="logo-mark lib-mark" aria-hidden="true">${esc(c.logo_mark)}</span>
      <span class="lib-lang">${c.language === "node" ? "Node.js" : "Python"}</span></span>
    <b class="lib-title">${esc(c.short_title)}</b>
    ${c.product_name ? `<span class="lib-prod">Sản phẩm: <b>${esc(c.product_name)}</b></span>` : ""}
    ${c.tagline ? `<span class="lib-tag" title="${esc(c.tagline)}">${esc(c.tagline)}</span>` : ""}
    <span class="lib-facts">${c.projects} project · ${c.lessons} bài${c.planned ? ` · ${c.planned} bài sắp có` : ""}</span>
    <span class="lib-prog"><span class="bar"><i style="width:${pct}%"></i></span><small>${c.passed}/${c.lessons} bài đã xong · ${pct}%</small></span>
    <span class="btn${started ? " amber" : ""} lib-btn">${started ? "Tiếp tục" : "Bắt đầu"} <span aria-hidden="true">→</span></span>
  </a></li>`;
}

/* ---------- Trang chủ ---------- */
function nextLesson() {
  const ls = allLessons().filter((l) => l.status !== "planned" && l.status !== "locked");
  return ls.find((l) => l.status === "in_progress") || ls.find((l) => l.status === "not_started") || null;
}
function ring(pct, size = 116, stroke = 11) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg" stroke-width="${stroke}" fill="none"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-width="${stroke}" fill="none" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
function showHome() {
  const s = roadmap.summary, pct = s.total ? Math.round((100 * s.passed) / s.total) : 0;
  const nx = nextLesson(), newProj = nx && !projStarted(nx.project);
  const learned = roadmap.concepts.filter((c) => c.learned).length;
  const greet = greeting();
  const projs = roadmap.projects.map((p) => {
    const ready = p.lessons.filter((l) => l.status !== "planned"), done = p.lessons.filter((l) => l.status === "passed").length;
    const state = !ready.length ? "soon" : done === p.lessons.length ? "done" : (p.lessons.some((l) => l.status === "in_progress" || l.status === "passed") ? "active" : "open");
    return `<li class="tl-item t-${TRACK[p.track] || "ai"} s-${state}">
      <a class="tl-card" href="${projHref(p.id)}">
        <span class="tl-node" aria-hidden="true">${state === "done" ? "✓" : esc(p.id.replace("P", ""))}</span>
        <span class="tl-track">${esc(p.track || "")}</span>
        <b class="tl-title">${esc(p.title)}</b>
        ${p.brief && p.brief.goal ? `<span class="tl-goal" title="${esc(p.brief.goal)}">${esc(p.brief.goal)}</span>` : ""}
        <span class="tl-count">${state === "soon" ? "Sắp có" : `${done}/${p.lessons.length} bài`}</span>
        <span class="tl-bar"><i style="width:${(100 * done) / p.lessons.length}%"></i></span>
      </a></li>`;
  }).join("");
  const tracks = [...new Set(roadmap.projects.map((p) => p.track).filter(Boolean))];
  view.innerHTML = `<div class="home">
    <section class="hero">
      <div class="hero-main">
        <p class="eyebrow">${greet} 👋</p>
        <h1>${isNode() ? `${esc(roadmap.short_title || roadmap.title)}<br>từng bước một.` : "Học AI & Data<br>từng bước một."}</h1>
        <p class="hero-sub">${productName() ? `Bằng cách tự tay xây <b>${esc(productName())}</b>${isNode() ? "" : ", trợ lý thị trường việc làm IT,"} qua ${roadmap.projects.length} project.` : esc(roadmap.title)}</p>
        <div class="hero-stats">
          <div class="ring-wrap">${ring(pct)}<div class="ring-txt"><b>${pct}%</b><small>hoàn thành</small></div></div>
          <ul class="mini-stats">
            <li><b>${s.passed}</b><span>/ ${s.total} bài đã xong</span></li>
            <li><b>${learned}</b><span>/ ${roadmap.concepts.length} khái niệm</span></li>
          </ul>
        </div>
      </div>
      ${nx ? `<a class="continue t-${TRACK[nx.project.track] || "ai"}" href="${newProj ? projHref(nx.project.id) : lessonHref(nx.id)}">
          <span class="continue-k">${nx.status === "in_progress" ? "Tiếp tục học" : newProj ? "Project mới" : "Bài tiếp theo"}</span>
          <span class="continue-proj">${esc(nx.project.id)} · ${esc(nx.project.title)}</span>
          <b class="continue-title">${esc(nx.title)}</b>
          <span class="continue-goal">${esc(nx.goal || "")}</span>
          <span class="btn continue-btn">${nx.status === "in_progress" ? "Học tiếp" : newProj ? "Xem bạn sẽ xây gì" : "Bắt đầu học"} <span aria-hidden="true">→</span></span>
        </a>` : `<div class="continue done"><span class="continue-k">Tuyệt vời!</span><b class="continue-title">Bạn đã xong mọi bài hiện có 🎉</b><span class="continue-goal">Bài mới sẽ sớm xuất hiện trong lộ trình.</span></div>`}
    </section>
    ${roadmap.has_key ? "" : '<div class="notice">🔑 Chưa có <code>NVIDIA_API_KEY</code> — Gia sư AI và chấm phỏng vấn chưa dùng được. Mở file <code>.env</code> ở gốc repo, thay <code>nvapi-...</code> bằng key của bạn.</div>'}
    ${productHTML(roadmap.product)}
    <section class="sec">
      <div class="sec-head"><h2>Lộ trình</h2>
        <div class="legend">${tracks.map((t) => `<span class="lg t-${TRACK[t] || "ai"}"><i></i>${esc(t)}</span>`).join("")}</div></div>
      <ol class="timeline">${projs}</ol>
    </section>
    ${roadmap.product_map && (roadmap.product_map.nodes || []).length ? `<section class="sec">
      <div class="sec-head"><h2>${productName() ? `Sản phẩm ${esc(productName())} bạn đang xây` : "Sản phẩm bạn đang xây"}</h2>
        <p class="sec-note"><i class="pk done">✓</i> đã xây <i class="pk hl"></i> bài tiếp theo xây</p></div>
      <div class="pmap-card home-map"><div class="pmap" id="home-map"></div></div>
    </section>` : ""}
    <section class="sec">
      <div class="sec-head"><h2>Bản đồ kiến thức</h2>
        <p class="sec-note"><span class="key on"></span> đã học <span class="key off"></span> chưa học · bấm vào chấm để mở bài</p></div>
      <div class="kg-card">
        <div id="kg-legend" class="legend kg-legend"></div>
        <div id="kg" class="kg"><div class="kg-loading">Đang vẽ bản đồ…</div></div>
        <div id="kg-tip" class="kg-tip" hidden></div>
      </div>
    </section>
  </div>`;
  const hm = $("#home-map");
  if (hm) drawPmap(hm, { hl: new Set(nx ? nx.product_nodes || [] : []), done: new Set(allLessons().filter((l) => l.status === "passed").flatMap((l) => l.product_nodes || [])) });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { if (!current) drawGraph(); });
}

/* JobRadar là gì, giải quyết bài toán nào, và học xong Academy có gì */
function productHTML(pr) {
  if (!pr || !pr.name) return "";
  const pj = (pid) => { const p = projById(pid); return p ? `<a class="pq-proj t-${TRACK[p.track] || "ai"}" href="${projHref(p.id)}">${esc(p.id)} · ${esc(p.title)}${p.lessons.every((l) => l.status === "planned") ? " · sắp có" : ""}</a>` : ""; };
  const pm = pr.promise || {};
  return `<section class="sec prod">
      <div class="sec-head"><h2>${esc(pr.name)} giải quyết bài toán gì?</h2></div>
      <div class="prod-card">
        <p class="prod-tag">${esc(pr.tagline || "")}</p>
        ${pr.problem ? `<p class="prod-prob">${esc(pr.problem)}</p>` : ""}
        ${(pr.pains || []).length ? `<ul class="prod-pains">${pr.pains.map((x, i) => `<li><span class="pp-n">${i + 1}</span><b>${esc(x.title)}</b><span>${esc(x.detail)}</span></li>`).join("")}</ul>` : ""}
      </div>
    </section>
    ${(pr.questions || []).length ? `<section class="sec">
      <div class="sec-head"><h2>Câu hỏi ${esc(pr.name)} trả lời được</h2><p class="sec-note">mỗi project mở khóa thêm một loại câu hỏi</p></div>
      <ul class="pq">${pr.questions.map((x) => `<li><div class="pq-q">“${esc(x.q)}”</div><div class="pq-a">${esc(x.a)}</div>${pj(x.project)}</li>`).join("")}</ul>
    </section>` : ""}
    ${pm.headline ? `<section class="sec">
      <div class="sec-head"><h2>Hoàn thành Academy, bạn có</h2>${pm.note ? `<p class="sec-note">${esc(pm.note)}</p>` : ""}</div>
      <p class="prom-head">${esc(pm.headline)}</p>
      <ul class="prom">${(pm.outcomes || []).map((o) => `<li>${bfIcon("check", "ck")}<div><b>${esc(o.title)}</b><span>${esc(o.detail)}</span></div></li>`).join("")}</ul>
    </section>` : ""}`;
}

/* ---------- Trang giới thiệu project: thành phẩm sẽ có, trước khi vào bài đầu ---------- */
const projById = (pid) => roadmap.projects.find((p) => p.id === pid);
const projStarted = (p) => p.lessons.some((l) => l.status === "in_progress" || l.status === "passed");
const introKey = (pid) => "intro:" + pid;
function showProject(pid) {
  const p = projById(pid);
  if (!p) { view.innerHTML = `<div class="col"><p class="err">Không tìm thấy project ${esc(pid)}.</p></div>`; return; }
  cstore.set(introKey(pid), true);
  const b = p.brief || {}, ready = p.lessons.filter((l) => l.status !== "planned");
  const done = p.lessons.filter((l) => l.status === "passed").length, allDone = ready.length && done === ready.length;
  const next = ready.find((l) => l.status !== "passed" && l.status !== "locked");
  const mins = ready.reduce((s, l) => s + (l.duration_min || 0), 0);
  const facts = [`${p.lessons.length} bài`, mins ? `khoảng ${Math.round(mins / 60)} giờ` : "", !ready.length ? "Sắp có" : ""].filter(Boolean).join(" · ");
  const cta = !ready.length ? "" : allDone ? `<a class="btn ghost cta-btn" href="${lessonHref(ready[0].id)}">Xem lại bài đầu</a>`
    : next ? `<a class="btn amber cta-btn" href="${lessonHref(next.id)}">${projStarted(p) ? "Học tiếp" : "Bắt đầu"} ${esc(shortId(next.id))} <span aria-hidden="true">→</span></a>`
    : `<span class="pj-lock">🔒 Mở khi bạn qua hết bài của project trước</span>`;
  const sc = b.showcase && b.showcase.markdown ? b.showcase : null;
  const steps = p.lessons.map((l, i) => {
    const tag = l.status === "planned" ? "div" : "a", href = tag === "a" ? ` href="${lessonHref(l.id)}"` : "";
    return `<li class="pj-step st-${l.status}"><${tag} class="pj-sl"${href}>
      <span class="pj-si" aria-label="${STATUS_LABEL[l.status] || ""}">${l.status === "passed" ? "✓" : i + 1}</span>
      <span class="pj-st"><b>${esc(shortId(l.id))} · ${esc(l.title)}</b><span>${esc(l.goal || "")}</span></span></${tag}></li>`;
  }).join("");
  view.innerHTML = `<div class="col pj t-${TRACK[p.track] || "ai"}">
    <header class="pj-hero">
      <p class="bf-label"><span class="trk t-${TRACK[p.track] || "ai"}">${esc(p.track || "")}</span> ${esc(p.id)} · ${esc(facts)}</p>
      <h1>${esc(p.title)}</h1>
      ${b.promise ? `<p class="pj-promise">${mdInline(b.promise)}</p>` : ""}
      ${b.goal ? `<p class="pj-why"><b>Bài toán:</b> ${esc(b.goal)}</p>` : ""}
      ${cta ? `<div class="pj-cta">${cta}</div>` : ""}
    </header>
    ${sc ? `<section class="pj-sec"><h2>Thành phẩm</h2>${sc.caption ? `<p class="pj-cap">${esc(sc.caption)}</p>` : ""}<div id="pj-show"></div></section>`
      : b.deliverable ? `<section class="pj-sec"><h2>Thành phẩm</h2><p class="pj-deliv">${esc(b.deliverable)}</p></section>` : ""}
    ${(b.can_do || []).length ? `<section class="pj-sec"><h2>Bạn sẽ làm được</h2>
      <ul class="pj-can">${b.can_do.map((c) => `<li>${bfIcon("check", "ck")}<span>${mdInline(c)}</span></li>`).join("")}</ul></section>` : ""}
    <section class="pj-sec"><h2>Các bài trong project</h2><ol class="pj-steps">${steps}</ol></section>
    ${b.cv_line ? `<section class="pj-sec"><h2>Làm xong, bạn ghi được vào CV</h2><p class="pj-cv">${esc(b.cv_line)}</p></section>` : ""}
    ${cta ? `<div class="cta">${cta}</div>` : ""}
  </div>`;
  if (sc) $("#pj-show").replaceWith(mdEl(sc.markdown, "md pj-show"));
}

function fitText(sel, maxW) { // cắt chữ SVG cho vừa bề rộng thật (đo bằng font đã tải)
  sel.each(function () {
    const full = this.textContent;
    if (this.getComputedTextLength() <= maxW) return;
    let lo = 0, hi = full.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; this.textContent = full.slice(0, mid) + "…"; if (this.getComputedTextLength() <= maxW) lo = mid; else hi = mid - 1; }
    this.textContent = full.slice(0, lo).trimEnd() + "…";
  });
}
function groupColor(i) { return GROUP_COLORS[i % GROUP_COLORS.length]; }
function drawGraph() {
  const host = $("#kg");
  if (!host) return;
  if (!window.d3) { host.innerHTML = '<p class="meta">Không tải được thư viện vẽ đồ thị.</p>'; return; }
  const groups = roadmap.concept_groups.length ? roadmap.concept_groups : [{ id: "_", title: "Khái niệm" }];
  const gIndex = new Map(groups.map((g, i) => [g.id, i]));
  $("#kg-legend").innerHTML = groups.map((g, i) => `<span class="lg"><i style="background:${groupColor(i)}"></i>${esc(g.title)}</span>`).join("");
  const ids = new Set(roadmap.concepts.map((c) => c.id));
  const nodes = roadmap.concepts.map((c) => {
    const lessons = (c.lessons || []).map(lessonById).filter(Boolean);
    const open = lessons.find((l) => l.status !== "planned");
    return { ...c, gi: gIndex.has(c.group) ? gIndex.get(c.group) : 0, lessonsInfo: lessons, target: open || null };
  });
  const links = (roadmap.concept_edges || []).filter((e) => Array.isArray(e) && ids.has(e[0]) && ids.has(e[1]) && e[0] !== e[1])
    .map(([s, t]) => ({ source: s, target: t }));
  // Bố cục "làn": mỗi nhóm khái niệm là 1 cột; trong cột xếp theo độ sâu tiên quyết. d3-force giữ nút ở đúng làn.
  const W = Math.max(300, host.clientWidth);
  const cols = W >= 980 ? Math.min(groups.length, 6) : W >= 620 ? Math.min(groups.length, 3) : Math.min(groups.length, 2);
  const colW = W / cols, rowH = W < 620 ? 34 : 38, headH = 40;
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  for (let k = 0; k < nodes.length; k++) { let ch = false; for (const l of links) { const d = depth.get(l.source) + 1; if (d > depth.get(l.target)) { depth.set(l.target, d); ch = true; } } if (!ch) break; }
  const members = groups.map((g, gi) => nodes.filter((n) => n.gi === gi).sort((a, b) => depth.get(a.id) - depth.get(b.id)));
  const rowsN = Math.ceil(groups.length / cols), blockH = [];
  for (let r = 0; r < rowsN; r++) blockH.push(headH + rowH * Math.max(1, ...members.slice(r * cols, r * cols + cols).map((m) => m.length)) + 18);
  const top = (r) => blockH.slice(0, r).reduce((a, b) => a + b, 0);
  const H = top(rowsN);
  const colX = (gi) => (gi % cols) * colW;
  members.forEach((ms, gi) => ms.forEach((n, k) => {
    n.tx = colX(gi) + 24; n.ty = top(Math.floor(gi / cols)) + headH + rowH * (k + 0.5);
    n.x = n.tx + (Math.random() - 0.5) * 20; n.y = n.ty + (Math.random() - 0.5) * 20;
  }));
  const rOf = (n) => (n.target ? 8 : 6);
  const sim = d3.forceSimulation(nodes)
    .force("x", d3.forceX((n) => n.tx).strength(0.9))
    .force("y", d3.forceY((n) => n.ty).strength(0.9))
    .force("collide", d3.forceCollide(rowH / 2 - 2))
    .stop();
  if (links.length) sim.force("link", d3.forceLink(links).id((n) => n.id).strength(0.02));
  for (let i = 0; i < 200; i++) sim.tick();

  host.innerHTML = "";
  const svg = d3.select(host).append("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H)
    .attr("role", "img").attr("aria-label", `Bản đồ ${nodes.length} khái niệm, ${nodes.filter((n) => n.learned).length} đã học`);
  svg.append("defs").append("marker").attr("id", "kg-arrow").attr("viewBox", "0 -4 8 8").attr("refX", 19).attr("refY", 0)
    .attr("markerUnits", "userSpaceOnUse").attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto")
    .append("path").attr("d", "M0,-4L8,0L0,4").attr("class", "kg-arrowhead");
  // làn + nhãn nhóm
  const lane = svg.append("g").selectAll("g").data(groups).join("g");
  lane.append("rect").attr("class", "kg-lane").attr("x", (g, i) => colX(i) + 4).attr("y", (g, i) => top(Math.floor(i / cols)) + 4)
    .attr("width", colW - 8).attr("height", (g, i) => blockH[Math.floor(i / cols)] - 12).attr("rx", 14)
    .attr("fill", (g, i) => groupColor(i));
  lane.append("text").attr("class", "kg-group").attr("x", (g, i) => colX(i) + 16).attr("y", (g, i) => top(Math.floor(i / cols)) + 26)
    .attr("fill", (g, i) => groupColor(i))
    .text((g) => g.title).call(fitText, colW - 64);
  lane.append("text").attr("class", "kg-gcount").attr("x", (g, i) => colX(i) + colW - 16).attr("y", (g, i) => top(Math.floor(i / cols)) + 26)
    .attr("text-anchor", "end").text((g, i) => `${members[i].filter((n) => n.learned).length}/${members[i].length}`);
  const linkPath = (d) => {
    const s = d.source, t = d.target;
    if (Math.abs(s.x - t.x) < colW / 2) { const k = Math.min(24, 12 + Math.abs(t.y - s.y) * 0.08); return `M${s.x},${s.y}C${s.x - k},${s.y} ${t.x - k},${t.y} ${t.x},${t.y}`; }
    const mx = (s.x + t.x) / 2; return `M${s.x},${s.y}C${mx},${s.y} ${mx},${t.y} ${t.x},${t.y}`;
  };
  const link = svg.append("g").attr("class", "kg-links").selectAll("path").data(links).join("path")
    .attr("class", "kg-link").attr("marker-end", "url(#kg-arrow)").attr("fill", "none").attr("d", linkPath);
  const node = svg.append("g").selectAll("g").data(nodes).join("g")
    .attr("class", (n) => `kg-node${n.learned ? " learned" : ""}${n.target ? " has-lesson" : " no-lesson"}`)
    .attr("transform", (n) => `translate(${n.x},${n.y})`)
    .attr("tabindex", (n) => (n.target ? 0 : null)).attr("role", (n) => (n.target ? "link" : null))
    .attr("aria-label", (n) => `${n.title}${n.learned ? ", đã học" : ""}${n.target ? ", mở bài " + n.target.title : ""}`);
  node.append("rect").attr("class", "hit").attr("x", -12).attr("y", -rowH / 2).attr("width", colW - 20).attr("height", rowH);
  node.append("circle").attr("class", "halo").attr("r", (n) => rOf(n) + 5).attr("fill", (n) => groupColor(n.gi));
  node.append("circle").attr("class", "dotc").attr("r", rOf)
    .attr("fill", (n) => groupColor(n.gi)).attr("stroke", (n) => groupColor(n.gi));
  node.filter((n) => n.learned).append("text").attr("class", "kg-check").attr("text-anchor", "middle").attr("dy", "0.35em").text("✓");
  node.append("text").attr("class", "kg-label").attr("x", 13).attr("dy", "0.35em")
    .text((n) => n.title).call(fitText, colW - 48);

  const tip = $("#kg-tip"), card = $(".kg-card");
  const neighbors = (n) => new Set(links.flatMap((l) => (l.source === n ? [l.target.id] : l.target === n ? [l.source.id] : [])));
  function show(ev, n) {
    const nb = neighbors(n);
    svg.classed("focus", true);
    node.classed("hl", (m) => m === n || nb.has(m.id));
    link.classed("hl", (l) => l.source === n || l.target === n);
    const les = n.lessonsInfo[0];
    tip.innerHTML = `<b>${esc(n.title)}</b>
      <span class="tip-g"><i style="background:${groupColor(n.gi)}"></i>${esc(groups[n.gi].title)}</span>
      <span>${les ? `Dạy trong: <b>${esc(shortId(les.id))}</b> — ${esc(les.title)}${les.status === "planned" ? " (sắp có)" : ""}` : "Chưa có bài dạy khái niệm này"}</span>
      <span class="tip-st ${n.learned ? "on" : ""}">${n.learned ? "✓ Đã học" : "Chưa học"}${n.target ? " · bấm để mở bài" : ""}</span>`;
    tip.hidden = false;
    const cr = card.getBoundingClientRect(), hr = host.getBoundingClientRect();
    const scale = hr.width / W;
    let x = hr.left - cr.left + n.x * scale + 14, y = hr.top - cr.top + n.y * scale + 12;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (x + tw > cr.width - 8) x = Math.max(8, x - tw - 28);
    if (y + th > cr.height - 8) y = Math.max(8, y - th - 24);
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }
  function hide() { svg.classed("focus", false); node.classed("hl", false); link.classed("hl", false); tip.hidden = true; }
  const go = (n) => { if (n.target) location.hash = lessonHref(n.target.id); };
  node.on("mouseenter", show).on("mouseleave", hide).on("focus", show).on("blur", hide)
    .on("click", (ev, n) => go(n)).on("keydown", (ev, n) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(n); } });
}
let resizeT = null;
addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!current && $("#kg")) drawGraph(); $$(".pmap").forEach((h) => drawPmap(h)); }, 200); });

/* ---------- Trang bài học ---------- */
async function showLesson(id) {
  const lesson = await capi("/lessons/" + encodeURIComponent(id));
  const keep = current && current.id === id ? current : null;
  const tab0 = keep ? keep.tab : (briefOf(lesson.meta) && !lessonStarted(lesson) ? "brief" : "lesson");
  current = { id, lesson, tab: tab0 === "brief" && !briefOf(lesson.meta) ? "lesson" : tab0, iv: keep ? keep.iv : {}, guide: cstore.get("guide:" + id, "steps"), pane: keep ? keep.pane : "left" };
  setTutorLesson(lesson.meta.title);
  renderLesson();
  renderSidebar();
  $("#main").scrollTop = 0;
}

function renderLesson() {
  const { lesson, tab, id } = current, m = lesson.meta;
  const info = lessonById(id);
  $("#main").classList.toggle("fill", tab === "lesson");
  const concepts = (m.concepts || []).map((c) => { const k = roadmap.concepts.find((x) => x.id === c); return `<span class="chip${k && k.learned ? " on" : ""}">${esc(k ? k.title : c)}</span>`; }).join("");
  view.innerHTML = `<header class="lhead">
    <div class="crumb">${info ? `<span class="trk t-${TRACK[info.project.track] || "ai"}">${esc(info.project.track || "")}</span> <a href="${projHref(info.project.id)}">${esc(info.project.id)} · ${esc(info.project.title)}</a>` : ""}</div>
    <h1>${esc(m.title)}</h1>
    <div class="lmeta"><span class="chip time">⏱ ${m.duration_min ? Math.round(m.duration_min / 6) / 10 + " giờ" : "?"}</span>${concepts}</div>
    <div class="tabs" role="tablist">
      ${[briefOf(m) && ["brief", "Bối cảnh"], ["lesson", "Bài học"], ["interview", "Phỏng vấn thử"]].filter(Boolean).map(([k, label]) =>
        `<button class="tab${tab === k ? " active" : ""}" data-tab="${k}" role="tab" aria-selected="${tab === k}">${label}</button>`).join("")}</div></header>
    <div id="tabbody" class="lbody${tab === "lesson" ? "" : " scroll"}"></div>`;
  $$(".tab", view).forEach((b) => b.onclick = () => { current.tab = b.dataset.tab; renderLesson(); });
  if (tab === "lesson") renderLessonTab(); else if (tab === "brief") renderBriefTab(); else renderInterviewTab();
}

const prettyTest = (name) => name.replace(/^test_?/, "").replace(/\[.*\]$/, "").replace(/_/g, " ");
function testsFor(task, tests) { return (tests || []).filter((t) => t.name.startsWith(task.test_prefix || "\u0000")); }

function renderLessonTab() {
  const { lesson, id } = current, m = lesson.meta, body = $("#tabbody");
  const sec = splitLesson(lesson.markdown || "");
  const tasks = Array.isArray(m.tasks) ? m.tasks.filter((t) => t && t.fn) : [];
  const cl = lesson.progress.checklist || {};
  const nCl = (m.checklist || []).length, nClDone = (m.checklist || []).filter((_, i) => cl[i]).length;
  body.innerHTML = `
    <div class="seg" role="tablist" aria-label="Chọn màn">
      <button class="seg-l${current.pane === "left" ? " on" : ""}" data-s="left" role="tab">📋 Nhiệm vụ</button>
      <button class="seg-r${current.pane === "right" ? " on" : ""}" data-s="right" role="tab">🧭 Hướng dẫn</button></div>
    <div class="split" data-show="${current.pane}">
    <section class="pane left" aria-label="Nhiệm vụ">
      <div class="pane-head"><span class="pane-badge">📋 Nhiệm vụ</span><span class="pane-q">Tôi phải làm gì, đã xong chưa?</span></div>
      <div id="status"></div>
      <div class="block">
        <h3 class="bh">${tasks.length ? `Việc cần làm <span class="count">${tasks.length} hàm</span>` : "Đề bài"}</h3>
        <div id="tasks"></div>
      </div>
      ${sec.goal || sec.intro ? `<div class="block goal"><h3 class="bh">🎯 Sau bài này bạn sẽ</h3><div id="goal"></div></div>` : ""}
      <div class="block checklist"><h3 class="bh">✅ Tự kiểm tra <span class="count" id="cl-count">${nClDone}/${nCl}</span></h3>
        <div class="cl-items">${(m.checklist || []).map((t, i) => `<label class="cl"><input type="checkbox" data-i="${i}" ${cl[i] ? "checked" : ""}><span>${mdInline(t)}</span></label>`).join("") || '<span class="meta">Không có.</span>'}</div>
        ${sec.check ? `<details class="more"><summary>Cách tự chạy test trong terminal</summary><div id="selfcheck"></div></details>` : ""}
      </div>
    </section>
    <section class="pane right" aria-label="Hướng dẫn">
      <div class="pane-head"><span class="pane-badge">🧭 Hướng dẫn</span><span class="pane-q">Làm thế nào, vì sao?</span></div>
      <div class="subtabs" role="tablist">
        <button data-g="steps" role="tab">Các bước</button>
        <button data-g="concepts" role="tab">Kiến thức nền</button></div>
      <div id="guide-steps" class="guide"></div>
      <div id="guide-concepts" class="guide"></div>
    </section></div>`;

  // Seg (màn hẹp)
  const split = $(".split", body);
  $$(".seg button", body).forEach((b) => b.onclick = () => {
    current.pane = split.dataset.show = b.dataset.s;
    $$(".seg button", body).forEach((x) => x.classList.toggle("on", x === b));
  });
  renderStatus();
  renderTasks(tasks, sec);
  const g = $("#goal", body);
  if (g) {
    const goalEl = mdEl(sec.goal);
    const list = [...goalEl.children].find((x) => x.matches("ul,ol"));
    const rest = document.createElement("div");
    if (sec.intro) rest.appendChild(mdEl(sec.intro));
    if (list) { list.classList.add("goal-list"); g.appendChild(list); }
    if (goalEl.textContent.trim()) rest.appendChild(goalEl);
    if (!list) g.appendChild(rest);
    else if (rest.textContent.trim()) {
      const d = document.createElement("details"); d.className = "more";
      d.innerHTML = "<summary>Xem thêm</summary>"; d.appendChild(rest); g.appendChild(d);
    }
  }
  if (sec.check) $("#selfcheck", body).appendChild(mdEl(sec.check));
  $$(".checklist input", body).forEach((c) => c.onchange = async () => {
    try {
      const r = await capi(`/lessons/${id}/checklist`, { body: { index: +c.dataset.i, done: c.checked } });
      current.lesson.progress.checklist = r.checklist;
      const n = Object.values(r.checklist).filter(Boolean).length;
      $("#cl-count", body).textContent = `${n}/${nCl}`;
    } catch (e) { c.checked = !c.checked; alert(e.message); }
  });

  // Hướng dẫn
  renderSteps(sec);
  renderConcepts(sec);
  const setGuide = (g) => {
    current.guide = g; cstore.set("guide:" + id, g);
    $$(".subtabs button", body).forEach((b) => { b.classList.toggle("on", b.dataset.g === g); b.setAttribute("aria-selected", b.dataset.g === g); });
    $("#guide-steps", body).hidden = g !== "steps"; $("#guide-concepts", body).hidden = g !== "concepts";
  };
  $$(".subtabs button", body).forEach((b) => b.onclick = () => setGuide(b.dataset.g));
  setGuide(current.guide === "concepts" ? "concepts" : "steps");
}
function mdInline(t) { return window.marked ? marked.parseInline(String(t)) : esc(t); }

function renderStatus() {
  const { lesson, id } = current, m = lesson.meta, host = $("#status");
  if (!host) return;
  const locked = lesson.status === "locked", started = lesson.workspace_exists;
  const lt = lesson.progress.last_test, passedLesson = lesson.progress.passed;
  const cmd = /\s/.test(lesson.workspace_path) ? `code "${lesson.workspace_path}"` : `code ${lesson.workspace_path}`;
  const runCmd = !m.entry ? "" : isNode() ? `node ${esc(m.entry)}` : `${roadmap.platform === "windows" ? "python" : "python3"} ${esc(m.entry)}`;
  const entry = m.entry ? `<code>${esc(m.entry)}</code>` : "file code khung";
  let head, sub;
  if (locked) { head = "🔒 Bài đang khóa"; sub = "Hoàn thành bài trước để mở, hoặc mở khóa thủ công."; }
  else if (!started) { head = "Sẵn sàng bắt đầu"; sub = "Bấm <b>Bắt đầu</b> — app tạo sẵn thư mục và file code khung cho bạn."; }
  else if (!lt) { head = "Đã có code khung"; sub = `Mở ${entry} trong VS Code, viết code rồi bấm <b>Chạy test</b>.`; }
  else if (lt.total && lt.passed === lt.total && !lt.failed) { head = "🎉 Đạt hết! Bài đã hoàn thành"; sub = "Giỏi lắm. Bài tiếp theo đã được mở."; }
  else { head = `${lt.passed}<small>/${lt.total}</small> test đạt`; sub = lt.passed ? "Đang tiến bộ! Xem thẻ bên dưới để biết hàm nào còn thiếu." : "Chưa có test nào đạt — bắt đầu từ hàm đầu tiên nhé."; }
  const tests = lt && lt.tests;
  const bar = lt && lt.total ? (tests && tests.length ? `<div class="segbar" aria-hidden="true">${tests.map((t) => `<i class="${t.outcome === "passed" ? "ok" : "bad"}" title="${esc(prettyTest(t.name))}"></i>`).join("")}</div>`
    : `<div class="segbar prop" aria-hidden="true"><i class="ok" style="flex:${lt.passed}"></i><i class="bad" style="flex:${lt.total - lt.passed}"></i></div>`) : "";
  const done = lt && lt.total && lt.passed === lt.total && !lt.failed;
  host.innerHTML = `<div class="status${done || passedLesson ? " is-done" : ""}${locked ? " is-locked" : ""}">
    <div class="status-main"><div class="status-h" role="status">${head}</div><p class="status-sub">${sub}</p>${bar}</div>
    <div class="status-act">
      ${locked ? '<button class="btn ghost" id="unlock">Mở khóa thủ công</button>' : ""}
      ${!locked && !started ? '<button class="btn amber" id="start">🚀 Bắt đầu</button>' : ""}
      ${!locked && started ? `<button class="btn amber" id="runtest">▶ Chạy test</button>` : ""}
    </div>
    <div id="runmsg" class="runmsg"></div>
    ${started ? `<div class="cmd"><span class="cmd-k">Mở trong VS Code</span><code class="cmd-v" id="wspath" title="${esc(cmd)}">code …/${esc(lesson.workspace_path.split(/[\\/]/).slice(-2).join("/"))}</code></div>` : ""}
    <details class="more howto"${started ? "" : " open"}><summary>Cách làm bài (4 bước)</summary>
      <ol class="howto-list">
        <li><b>Bắt đầu</b> — app tạo thư mục bài và code khung.</li>
        <li>Mở thư mục bằng <b>VS Code</b>, mở ${entry}${runCmd ? ` (chạy thử: <code>${runCmd}</code>)` : ""}.</li>
        <li>Viết code vào chỗ <code>${isNode() ? "// TODO" : "# TODO"}</code>, xem tab <b>Hướng dẫn</b> khi bí.</li>
        <li><b>Chạy test</b> — đạt hết là qua bài, mở bài tiếp.</li></ol></details>
  </div>`;
  const c = $(".cmd", host); if (c) c.appendChild(copyBtn(() => cmd));
  const un = $("#unlock", host);
  if (un) un.onclick = async () => { await capi(`/lessons/${id}/unlock`, { body: {} }); await loadRoadmap(); showLesson(id); };
  const st = $("#start", host);
  if (st) st.onclick = async () => {
    st.disabled = true; st.textContent = "Đang tạo…";
    try { await capi(`/lessons/${id}/start`, { body: {} }); await loadRoadmap(); current.lesson.workspace_exists = true; current.lesson.status = "in_progress"; renderStatus(); renderSidebar(); }
    catch (e) { $("#runmsg", host).innerHTML = `<p class="err">${esc(e.message)}</p>`; st.disabled = false; st.textContent = "🚀 Bắt đầu"; }
  };
  const rt = $("#runtest", host);
  if (rt) rt.onclick = async () => {
    rt.disabled = true; rt.innerHTML = '<span class="spin" aria-hidden="true"></span> Đang chạy…';
    try {
      const r = await capi(`/lessons/${id}/test`, { body: {} });
      current.lesson.progress.last_test = { passed: r.passed, failed: r.failed, total: r.total, tests: r.tests || [] };
      if (r.ok) { current.lesson.progress.passed = true; await loadRoadmap(); }
      renderStatus(); renderTasks();
      const msg = $("#runmsg");
      if (r.timeout) msg.innerHTML = `<p class="err">${esc(r.output)}</p>`;
      else if (!r.ok && r.output) {
        msg.innerHTML = `<details class="more out"><summary>Xem chi tiết ${isNode() ? "node --test" : "pytest"}</summary><pre class="output">${esc(r.output)}</pre></details>`;
      }
    } catch (e) { $("#runmsg").innerHTML = `<p class="err">${esc(e.message)}</p>`; rt.disabled = false; rt.textContent = "▶ Chạy test"; }
  };
}

function renderTasks(tasks, sec) {
  const host = $("#tasks"); if (!host) return;
  const m = current.lesson.meta;
  tasks = tasks || (Array.isArray(m.tasks) ? m.tasks.filter((t) => t && t.fn) : []);
  sec = sec || current.sec; current.sec = sec;
  if (!tasks.length) { // Không có meta.tasks → hiện nguyên Đề bài
    if (!host.dataset.md) { host.dataset.md = "1"; host.innerHTML = ""; host.appendChild(mdEl(sec.task || "_Chưa có đề bài._", "md task-md")); }
    return;
  }
  const lt = current.lesson.progress.last_test, tests = lt && lt.tests;
  const claimed = new Set(), brief = briefOf(m);
  const purposeOf = (fn) => { const r = brief && (brief.requirements || []).find((q) => q && q.task === fn); return r && r.purpose; };
  const cards = tasks.map((t, i) => {
    const ts = testsFor(t, tests); ts.forEach((x) => claimed.add(x.name));
    const ok = ts.filter((x) => x.outcome === "passed").length, fail = ts.filter((x) => x.outcome !== "passed");
    const state = !ts.length ? "none" : ok === ts.length ? "done" : ok ? "part" : "todo";
    const pill = !ts.length ? (tests ? "chưa có test" : "chưa chạy test") : state === "done" ? `✓ ${ok}/${ts.length} test đạt` : `${ok}/${ts.length} test đạt`;
    const hint = fail.find((x) => x.message);
    return `<article class="task s-${state}">
      <div class="task-top"><span class="task-n">${state === "done" ? "✓" : i + 1}</span>
        <code class="sig">${esc(t.signature || t.fn + "(…)")}</code>
        <span class="pill">${pill}</span></div>
      ${purposeOf(t.fn) ? `<p class="task-ans"><span>Mục đích:</span> ${esc(purposeOf(t.fn))}</p>` : ""}
      ${ts.length ? `<div class="dots" aria-hidden="true">${ts.map((x) => `<i class="${x.outcome === "passed" ? "ok" : "bad"}"></i>`).join("")}</div>` : ""}
      ${t.summary ? `<p class="task-sum">${mdInline(t.summary)}</p>` : ""}
      ${t.example ? `<div class="task-ex"><span>Ví dụ</span><code>${esc(t.example)}</code></div>` : ""}
      ${hint ? `<p class="task-hint"><b>Test nhắc:</b> ${esc(hint.message)}</p>` : ""}
      ${ts.length ? `<details class="more"><summary>Xem ${ts.length} test</summary><ul class="tlist">${ts.map((x) => `<li class="${x.outcome === "passed" ? "ok" : "bad"}"><span class="ti">${x.outcome === "passed" ? "✓" : "✗"}</span><span><span class="tn">${esc(prettyTest(x.name))}</span>${x.outcome !== "passed" && x.message ? `<small>${esc(x.message)}</small>` : ""}</span></li>`).join("")}</ul></details>` : ""}
    </article>`;
  }).join("");
  const other = (tests || []).filter((x) => !claimed.has(x.name) && x.outcome !== "passed");
  host.innerHTML = cards + (other.length ? `<article class="task s-todo other"><div class="task-top"><span class="task-n">!</span><b>Lỗi khác</b><span class="pill">${other.length}</span></div>
      <ul class="tlist">${other.map((x) => `<li class="bad"><span class="ti">✗</span><span><span class="tn">${esc(prettyTest(x.name))}</span><small>${esc(x.message)}</small></span></li>`).join("")}</ul></article>` : "")
    + (sec.task ? `<details class="more full-task"><summary>📄 Xem đề bài đầy đủ</summary><div class="ft"></div></details>` : "");
  const ft = $(".full-task .ft", host); if (ft) ft.appendChild(mdEl(sec.task));
}

function renderSteps(sec) {
  const host = $("#guide-steps"), id = current.id;
  const parts = splitH3(sec.steps);
  const isStepper = parts.items.some((it) => /^bước\s*\d+/i.test(it.title));
  host.innerHTML = "";
  if (!sec.steps) { host.innerHTML = '<p class="meta">Chưa có hướng dẫn từng bước.</p>'; return; }
  if (!isStepper) { host.appendChild(mdEl(sec.steps)); return; }
  if (parts.pre) host.appendChild(mdEl(parts.pre, "md lead"));
  const key = "steps:" + id;
  let done = new Set(cstore.get(key, []));
  const items = parts.items.map((it, i) => {
    const m = it.title.match(/^bước\s*(\d+)\s*[—–:\-.]*\s*(.*)$/i);
    return { i, num: m ? m[1] : "★", title: m ? (m[2] || it.title) : it.title, body: it.body, extra: !m };
  });
  const prog = document.createElement("div"); prog.className = "step-prog";
  const list = document.createElement("ol"); list.className = "stepper";
  host.append(prog, list);
  let open = items.findIndex((it) => !done.has(it.i)); if (open < 0) open = items.length - 1;
  const save = () => cstore.set(key, [...done]);
  function paint() {
    const n = items.filter((it) => done.has(it.i)).length;
    prog.innerHTML = `<span>${n}/${items.length} bước đã xong</span><span class="sbar"><i style="width:${(100 * n) / items.length}%"></i></span>`;
    $$(".step", list).forEach((li, k) => {
      const it = items[k], isOpen = k === open, isDone = done.has(it.i);
      li.classList.toggle("open", isOpen); li.classList.toggle("done", isDone);
      $(".step-hd", li).setAttribute("aria-expanded", isOpen);
      $(".step-num", li).textContent = isDone ? "✓" : it.num;
      $(".step-bd", li).hidden = !isOpen;
      $(".mark", li).textContent = isDone ? "↺ Bỏ đánh dấu" : "✓ Đánh dấu xong";
    });
  }
  items.forEach((it, k) => {
    const li = document.createElement("li"); li.className = "step" + (it.extra ? " extra" : "");
    li.innerHTML = `<button type="button" class="step-hd"><span class="step-num"></span><span class="step-t">${mdInline(it.title)}</span><span class="chev" aria-hidden="true">›</span></button><div class="step-bd"></div>`;
    const bd = $(".step-bd", li);
    bd.appendChild(mdEl(it.body));
    const act = document.createElement("div"); act.className = "step-act";
    act.innerHTML = `<button type="button" class="btn ghost sm mark"></button>${k < items.length - 1 ? '<button type="button" class="btn teal next">Bước tiếp <span aria-hidden="true">→</span></button>' : '<span class="fin">Hết các bước — giờ bấm <b>Chạy test</b> 🎯</span>'}`;
    bd.appendChild(act);
    $(".step-hd", li).onclick = () => { open = open === k ? -1 : k; paint(); if (open === k) li.scrollIntoView({ block: "nearest", behavior: "smooth" }); };
    $(".mark", act).onclick = () => { done.has(it.i) ? done.delete(it.i) : done.add(it.i); save(); paint(); };
    const nx = $(".next", act);
    if (nx) nx.onclick = () => { done.add(it.i); save(); open = k + 1; paint(); list.children[k + 1].scrollIntoView({ block: "start", behavior: "smooth" }); $(".step-hd", list.children[k + 1]).focus({ preventScroll: true }); };
    list.appendChild(li);
  });
  paint();
}

function renderConcepts(sec) {
  const host = $("#guide-concepts");
  host.innerHTML = "";
  const parts = splitH3(sec.concepts);
  if (!sec.concepts && !sec.extra.length) { host.innerHTML = '<p class="meta">Chưa có phần kiến thức nền.</p>'; return; }
  if (!parts.items.length) { if (sec.concepts) host.appendChild(mdEl(sec.concepts)); }
  else {
    if (parts.pre) host.appendChild(mdEl(parts.pre, "md lead"));
    const grid = document.createElement("div"); grid.className = "concepts";
    parts.items.forEach((it) => {
      const card = document.createElement("article"); card.className = "ccard";
      const all = mdEl(it.body);
      const first = all.firstElementChild;
      card.innerHTML = `<h4>${mdInline(it.title.replace(/^\d+[.)]\s*/, ""))}</h4>`;
      const sum = document.createElement("div"); sum.className = "md csum";
      if (first) sum.appendChild(first);
      card.appendChild(sum);
      if (all.children.length) {
        const d = document.createElement("details"); d.className = "more cmore";
        d.innerHTML = "<summary>Xem thêm</summary>"; d.appendChild(all); card.appendChild(d);
      }
      grid.appendChild(card);
    });
    host.appendChild(grid);
  }
  sec.extra.forEach((x) => { const h = document.createElement("h3"); h.className = "extra-h"; h.textContent = x.title; host.append(h, mdEl(x.body)); });
}

function renderInterviewTab() {
  const { id, lesson } = current, qs = lesson.meta.interview_questions || [], body = $("#tabbody");
  if (!qs.length) { body.innerHTML = '<div class="col"><p class="meta">Bài này chưa có câu hỏi phỏng vấn.</p></div>'; return; }
  const tips = splitLesson(lesson.markdown).interview;
  body.innerHTML = `<div class="col iv"><p class="iv-intro">Trả lời như đang nói với nhà tuyển dụng — ngắn, rõ, có ví dụ, mỗi câu 30–60 giây. Gia sư AI sẽ chấm điểm và gợi ý câu trả lời tốt hơn.</p><div id="iv-tips"></div>` + qs.map((q, i) => `<div class="q" data-i="${i}">
    <div class="q-h"><span class="q-n">${i + 1}</span><p>${mdInline(q)}</p></div>
    <textarea rows="4" placeholder="Câu trả lời của bạn…" aria-label="Trả lời câu ${i + 1}">${esc(current.iv[i]?.answer || "")}</textarea>
    <div class="row"><button class="btn" type="button">Chấm điểm</button></div><div class="fb">${current.iv[i]?.html || ""}</div></div>`).join("") + "</div>";
  if (tips) $("#iv-tips", body).replaceWith(mdEl(tips, "md iv-tips")); else $("#iv-tips", body).remove();
  $$(".q", body).forEach((el) => {
    const i = +el.dataset.i, ta = $("textarea", el), fb = $(".fb", el), btn = $("button", el);
    ta.oninput = () => { current.iv[i] = { ...(current.iv[i] || {}), answer: ta.value }; };
    btn.onclick = async () => {
      btn.disabled = true; fb.innerHTML = '<p class="meta">Đang chấm…</p>';
      try {
        const g = await capi("/interview/grade", { body: { lesson_id: id, question: qs[i], answer: ta.value } });
        const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join("");
        const html = `<div class="grade"><div class="score"><b>${g.score}</b>/10</div>
          <div class="gcols"><div><h5>Điểm tốt</h5><ul>${li(g.strengths)}</ul></div><div><h5>Còn thiếu</h5><ul>${li(g.gaps)}</ul></div></div>
          <details class="more"><summary>Câu trả lời tốt hơn</summary>${mdHTML(g.better_answer, "md", true)}</details></div>`;
        current.iv[i] = { answer: ta.value, html }; fb.innerHTML = html;
      } catch (e) { fb.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
      btn.disabled = false;
    };
  });
}

/* ---------- Bối cảnh (brief bài toán) ---------- */
function briefOf(meta) {
  const b = meta && meta.brief;
  return b && typeof b === "object" && (b.context || b.problem || (b.requirements || []).length) ? b : null;
}
const lessonStarted = (les) => !!les.workspace_exists || les.status === "in_progress" || les.status === "passed";
function taskState(task, tests) {
  const ts = task ? testsFor(task, tests) : [];
  if (!tests || !ts.length) return null;
  const ok = ts.filter((x) => x.outcome === "passed").length;
  return { ok, n: ts.length, state: ok === ts.length ? "done" : ok ? "part" : "todo" };
}

/* Icon nét mảnh (stroke = currentColor) cho tiêu đề mục brief */
const BF_ICON = {
  context: '<path d="M4 5.5h16v13H4z"/><path d="M8 9.5h8M8 13h5"/>',
  problem: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>',
  flow: '<rect x="3" y="4" width="6" height="6" rx="1.5"/><rect x="15" y="14" width="6" height="6" rx="1.5"/><path d="M9 7h4a2 2 0 0 1 2 2v5"/><path d="m13 12 2 2 2-2"/>',
  deliver: '<path d="M5 4h14v16H5z"/><path d="m8.5 12 2.3 2.3L15.5 9.6"/>',
  limits: '<path d="M12 3.5 21 19.5H3z"/><path d="M12 10v4M12 16.8v.2"/>',
  map: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="8" r="2.5"/><circle cx="9" cy="18" r="2.5"/><path d="M8.3 7.1 15.6 7.4M7 8.4l1.4 7.2M16.5 10l-5.6 6.4"/>',
  input: '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/>',
  fn: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5"/>',
  output: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
};
const bfIcon = (k, cls = "bs-ic") => `<svg class="${cls}" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${BF_ICON[k]}</svg>`;
const bfHead = (n, icon, title, extra = "") => `<h2 class="bs-h"><span class="bs-tile">${bfIcon(icon)}</span><span class="bs-n">${String(n).padStart(2, "0")}</span>${title}${extra}</h2>`;
const fnLabel = (task) => (/[\s/]/.test(task) ? task : task + "()");
function splitSentences(t) { // tách câu theo ". " + chữ hoa/backtick; giữ số thập phân như 12.0
  return String(t || "").split(/(?<=[.!?])\s+(?=[A-ZÀ-ỸĐ`"0-9])/u).map((s) => s.trim()).filter(Boolean);
}

/* Luồng xử lý: Đầu vào → Xử lý (mỗi hàm 1 ô) → Đầu ra. HTML/CSS thuần, màn hẹp xếp dọc. */
function renderWorkflow(b, tasks, tests) {
  const wf = b.workflow && typeof b.workflow === "object" ? b.workflow : null;
  const purposeOf = (fn) => { const r = (b.requirements || []).find((q) => q && q.task === fn); return r && r.purpose; };
  const order = wf && Array.isArray(wf.steps) && wf.steps.length ? wf.steps.filter((s) => s && s.task)
    : (b.requirements || []).filter((r) => r && r.task).map((r) => ({ task: r.task }));
  const parallel = wf && wf.flow === "parallel";
  const steps = order.map((s, i) => {
    const t = tasks.find((x) => x.fn === s.task), st = taskState(t, tests), p = purposeOf(s.task);
    const badge = st ? `<span class="bf-st ${st.state}" title="Kết quả lần chạy test gần nhất">${st.state === "done" ? "✓ " : ""}${st.ok}/${st.n} test</span>`
      : t && t.test_prefix ? `<span class="bf-st idle" title="Chưa chạy test">chưa chạy</span>` : "";
    return `<li class="wf-step${st ? " s-" + st.state : ""}">
      <span class="wf-i" aria-hidden="true">${i + 1}</span>
      <div class="wf-sb"><div class="wf-sh"><code class="wf-fn">${esc(fnLabel(s.task))}</code>${badge}</div>
      ${s.label ? `<p class="wf-sl">${esc(s.label)}</p>` : ""}${p ? `<p class="wf-sp">${esc(p)}</p>` : ""}</div></li>`;
  }).join("");
  const box = (x, cls) => `<li class="wf-io ${cls}"><b>${esc(x.label || "")}</b>${x.detail ? `<span>${esc(x.detail)}</span>` : ""}</li>`;
  const ins = wf ? (wf.inputs || []).filter((x) => x && x.label) : [], outs = wf ? (wf.outputs || []).filter((x) => x && x.label) : [];
  const arrow = '<div class="wf-arrow" aria-hidden="true"><i></i></div>';
  const stage = (cls, icon, title, sub, inner) => `<div class="wf-stage ${cls}"><div class="wf-sth">${bfIcon(icon, "wf-ic")}<span>${title}</span>${sub ? `<small>${sub}</small>` : ""}</div>${inner}</div>`;
  return `<div class="wf${parallel ? " par" : ""}">
    ${ins.length ? stage("in", "input", "Đầu vào", "", `<ul class="wf-list">${ins.map((x) => box(x, "in")).join("")}</ul>`) + arrow : ""}
    ${stage("proc", "fn", "Xử lý", `${order.length} hàm${parallel ? " · độc lập, cùng đầu vào" : " · theo thứ tự dữ liệu"}`, `<ol class="wf-steps">${steps}</ol>`)}
    ${outs.length ? arrow + stage("out", "output", "Đầu ra", "", `<ul class="wf-list">${outs.map((x) => box(x, "out")).join("")}</ul>`) : ""}
  </div>`;
}

function renderBriefTab() {
  const { lesson, id } = current, m = lesson.meta, b = briefOf(m), body = $("#tabbody");
  const info = lessonById(id), proj = info && info.project;
  const started = lessonStarted(lesson), passed = !!lesson.progress.passed;
  const tasks = Array.isArray(m.tasks) ? m.tasks.filter((t) => t && t.fn) : [];
  const tests = lesson.progress.last_test && lesson.progress.last_test.tests;
  const cons = (b.constraints || []).filter(Boolean);
  const deliv = splitSentences(b.deliverable);
  const hasMap = roadmap.product_map && (roadmap.product_map.nodes || []).length;
  const cta = started ? "Tiếp tục" : "Bắt đầu làm";
  const hours = m.duration_min ? `khoảng ${Math.round(m.duration_min / 6) / 10} giờ` : "";
  let n = 0;
  body.innerHTML = `<div class="col brief">
    <header class="bh">
      <div class="bh-txt">
        ${proj ? `<p class="bf-label"><a href="${projHref(proj.id)}">${esc(proj.id)} · ${esc(proj.title)}</a></p>` : ""}
        ${m.goal ? `<p class="bh-goal">${esc(m.goal)}</p>` : ""}
      </div>
      <button type="button" class="btn amber sm bh-cta take-btn">${cta} <span aria-hidden="true">→</span></button>
    </header>
    <div class="bs-pair">
      ${b.context ? `<section class="bs bs-card">${bfHead(++n, "context", "Bối cảnh")}<p class="bs-p">${esc(b.context)}</p></section>` : ""}
      ${b.problem ? `<section class="bs bs-card bs-problem">${bfHead(++n, "problem", "Bài toán")}<p class="bs-p">${esc(b.problem)}</p></section>` : ""}
    </div>
    ${tasks.length || (b.requirements || []).length ? `<section class="bs">${bfHead(++n, "flow", "Luồng xử lý")}${renderWorkflow(b, tasks, tests)}</section>` : ""}
    ${deliv.length || cons.length ? `<div class="bs-pair bs-pair-2">
      ${deliv.length ? `<section class="bs bs-card">${bfHead(++n, "deliver", "Đầu ra &amp; nghiệm thu")}
        <ul class="bs-check${passed ? " all" : ""}">${deliv.map((d) => `<li>${bfIcon("check", "ck")}<span>${mdInline(d)}</span></li>`).join("")}</ul></section>` : ""}
      ${cons.length ? `<section class="bs bs-card bs-limits">${bfHead(++n, "limits", "Ràng buộc")}
        <ul class="bs-cons">${cons.map((c) => `<li>${mdInline(c)}</li>`).join("")}</ul></section>` : ""}
    </div>` : ""}
    ${hasMap ? `<section class="bs bf-map">${bfHead(++n, "map", "Vị trí trong hệ thống")}
      <div class="pmap-card"><div class="pmap" id="brief-map"></div>
      <p class="pmap-key"><span><i class="pk hl"></i>Bài này xây</span><span><i class="pk done">✓</i>Đã xây ở bài trước</span></p></div></section>` : ""}
    <div class="cta"><button type="button" class="btn amber cta-btn take-btn" id="take">${cta} <span aria-hidden="true">→</span></button>
      <span class="cta-sub">${[tasks.length ? `${tasks.length} hàm cần viết` : "", hours].filter(Boolean).join(" · ")}</span>
      <div id="take-msg" class="runmsg"></div></div>
  </div>`;
  if (hasMap) {
    const doneN = new Set(allLessons().filter((l) => l.status === "passed").flatMap((l) => l.product_nodes || []));
    drawPmap($("#brief-map", body), { hl: new Set(b.product_nodes || []), done: doneN });
  }
  const btns = $$(".take-btn", body);
  const onTake = async (ev) => {
    const btn = ev.currentTarget;
    if (!lessonStarted(lesson) && lesson.status !== "locked") {
      btns.forEach((x) => { x.disabled = true; }); btn.textContent = "Đang tạo thư mục bài…";
      try {
        await capi(`/lessons/${id}/start`, { body: {} });
        await loadRoadmap();
        current.lesson.workspace_exists = true; current.lesson.status = "in_progress";
      } catch (e) {
        btns.forEach((x) => { x.disabled = false; x.innerHTML = `${cta} <span aria-hidden="true">→</span>`; });
        $("#take-msg", body).innerHTML = `<p class="err">${esc(e.message)}</p>`; return;
      }
    }
    current.tab = "lesson"; renderLesson(); renderSidebar(); $("#main").scrollTop = 0;
  };
  btns.forEach((x) => { x.onclick = onTake; });
}

/* Sơ đồ sản phẩm JobRadar: xếp lớp theo cạnh (trái→phải; màn hẹp thì trên→dưới) */
function drawPmap(host, opts) {
  if (!host) return;
  if (opts) host._opts = opts; else opts = host._opts || {};
  const pm = roadmap.product_map || {}, hl = opts.hl || new Set(), done = opts.done || new Set();
  const nodes = (pm.nodes || []).filter((n) => n && n.id);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (pm.edges || []).filter((e) => Array.isArray(e) && ids.has(e[0]) && ids.has(e[1]) && e[0] !== e[1]);
  if (!nodes.length) { host.innerHTML = ""; return; }
  const depth = new Map(nodes.map((n) => [n.id, 0]));
  for (let k = 0; k < nodes.length; k++) { let ch = false; for (const [a, b] of edges) { if (depth.get(a) + 1 > depth.get(b)) { depth.set(b, depth.get(a) + 1); ch = true; } } if (!ch) break; }
  nodes.forEach((n) => { // nút nguồn (không có cha) đặt ngay trước nút con gần nhất → cạnh ngắn
    if (edges.some((e) => e[1] === n.id)) return;
    const ch = edges.filter((e) => e[0] === n.id).map((e) => depth.get(e[1]));
    if (ch.length) depth.set(n.id, Math.max(0, Math.min(...ch) - 1));
  });
  const nL = Math.max(...depth.values()) + 1;
  const layers = Array.from({ length: nL }, () => []);
  nodes.forEach((n, i) => layers[depth.get(n.id)].push({ ...n, i }));
  const pos = new Map();
  layers.forEach((L, d) => { // thứ tự trong lớp: trung bình vị trí nút cha (giảm cạnh chéo)
    if (d) L.forEach((n) => { const ps = edges.filter((e) => e[1] === n.id).map((e) => pos.get(e[0])).filter((x) => x != null); n.bc = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : n.i; });
    if (d) L.sort((a, b) => a.bc - b.bc);
    L.forEach((n, k) => pos.set(n.id, k - (L.length - 1) / 2));
  });
  const W = Math.max(280, host.clientWidth), maxPer = Math.max(...layers.map((L) => L.length));
  const lr = W / nL >= 104;
  let nh = lr ? 64 : 52, H;
  const gap = 12, box = new Map();
  if (lr) {
    const colW = W / nL, nw = Math.min(colW - 18, 190);
    if (nw < 130) nh = 80; // cột hẹp: nhãn dài xuống 4 dòng, không bị cắt
    H = maxPer * (nh + gap) - gap + 8;
    layers.forEach((L, d) => L.forEach((n, k) => box.set(n.id, { x: d * colW + (colW - nw) / 2, y: 4 + (maxPer - L.length) * (nh + gap) / 2 + k * (nh + gap), w: nw })));
  } else {
    const rowH = nh + 30, perRow = Math.max(1, Math.floor((W + 10) / 114)); // lớp quá rộng → tách nhiều hàng
    let r = 0;
    layers.forEach((L) => {
      for (let i = 0; i < L.length; i += perRow, r++) {
        const R = L.slice(i, i + perRow), nw = Math.min(200, (W - (R.length - 1) * 10) / R.length), tot = R.length * nw + (R.length - 1) * 10;
        R.forEach((n, k) => box.set(n.id, { x: (W - tot) / 2 + k * (nw + 10), y: 4 + r * rowH, w: nw }));
      }
    });
    H = r * rowH - 30 + 8;
  }
  const path = ([a, b]) => {
    const p = box.get(a), q = box.get(b);
    if (lr) { const x1 = p.x + p.w, y1 = p.y + nh / 2, x2 = q.x - 3, y2 = q.y + nh / 2, mx = (x1 + x2) / 2; return `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`; }
    const x1 = p.x + p.w / 2, y1 = p.y + nh, x2 = q.x + q.w / 2, y2 = q.y - 3, my = (y1 + y2) / 2; return `M${x1},${y1}C${x1},${my} ${x2},${my} ${x2},${y2}`;
  };
  const uid = host.id || "pm";
  const lit = (x) => hl.has(x) || done.has(x);
  const eCls = ([a, b]) => (done.has(a) && done.has(b) && !(hl.has(a) && hl.has(b)) ? "done" : (hl.has(a) || hl.has(b)) && lit(a) && lit(b) ? "hl" : "");
  // bố cục + fill/stroke đặt inline: style.css tới muộn/thiếu thì sơ đồ vẫn đúng chỗ, không thành khối đen
  host.style.position = "relative"; host.style.height = H + "px";
  host.classList.toggle("tight", lr && nh === 80);
  host.setAttribute("role", "img");
  host.setAttribute("aria-label", `Sơ đồ sản phẩm ${productName()}: ${nodes.length} khối` + (hl.size ? `; bài này xây: ${nodes.filter((n) => hl.has(n.id)).map((n) => n.title).join(", ")}` : "") + (done.size ? `; đã xây: ${nodes.filter((n) => done.has(n.id)).map((n) => n.title).join(", ")}` : ""));
  host.innerHTML = `<svg class="pm-edges" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="position:absolute;left:0;top:0;overflow:visible" aria-hidden="true">
      <defs>${["", "hl", "done"].map((c) => `<marker id="${uid}-ah${c}" viewBox="0 -4 8 8" refX="5" refY="0" markerWidth="7" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,-4L8,0L0,4" class="pm-ah ${c}" fill="#8A94A3"/></marker>`).join("")}</defs>
      ${edges.map((e) => { const c = eCls(e); return `<path class="pm-e ${c}" d="${path(e)}" fill="none" stroke="#8A94A3" stroke-width="1.5" marker-end="url(#${uid}-ah${c})"/>`; }).join("")}</svg>`
    + nodes.map((n) => { const b = box.get(n.id), h = hl.has(n.id), d = done.has(n.id);
      return `<div class="pn${h ? " hl" : ""}${d ? " done" : ""}" style="position:absolute;box-sizing:border-box;left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${nh}px" title="${esc(n.title)}${h ? " — bài này xây" : ""}${d ? " — đã xây" : ""}">
        ${d ? '<span class="pn-ck" aria-hidden="true">✓</span>' : ""}<span class="pn-t">${esc(n.title)}</span></div>`; }).join("");
}

/* ---------- Gia sư AI ---------- */
const SUGGEST = ["Lỗi này nghĩa là gì?", "Gợi ý cho mình bước tiếp theo", "Giải thích lại bằng ví dụ đời thường"];
function setTutorLesson(title) { $("#tutor-lesson").textContent = title ? "Bài: " + title : "Mở một bài để hỏi gia sư"; renderTutor(); }
function renderTutor() {
  const log = $("#tutor-log"), msgs = (current && tutorMsgs[courseId + "/" + current.id]) || [];
  if (msgs.length) {
    log.innerHTML = "";
    msgs.forEach((m) => {
      const d = document.createElement("div"); d.className = "msg " + (m.role === "user" ? "user" : "bot") + (m.error ? " err" : "");
      if (m.role === "user") d.textContent = m.content; else { d.appendChild(mdEl(m.content, "md", true)); }
      log.appendChild(d);
    });
  } else {
    log.innerHTML = `<div class="tutor-empty"><p>Hỏi gì cũng được — gia sư <b>gợi ý</b> để bạn tự nghĩ ra, chứ không đưa đáp án luôn.</p>
      ${current ? `<div class="sugg">${SUGGEST.map((s) => `<button type="button" class="chip-btn">${esc(s)}</button>`).join("")}</div>` : ""}</div>`;
    $$(".chip-btn", log).forEach((b) => b.onclick = () => { const t = $("#tutor-input"); t.value = b.textContent; t.focus(); });
  }
  log.scrollTop = log.scrollHeight;
}
let tutorBusy = false;
async function sendTutor(text) {
  if (!current) { $("#tutor-log").innerHTML = '<div class="tutor-empty"><p>Hãy mở một bài học trước, gia sư cần biết bạn đang học bài nào.</p></div>'; return false; }
  if (tutorBusy) return false;
  const id = current.id, tk = courseId + "/" + id, msgs = (tutorMsgs[tk] = tutorMsgs[tk] || []);
  msgs.push({ role: "user", content: text }); renderTutor(); tutorBusy = true;
  const log = $("#tutor-log"); log.insertAdjacentHTML("beforeend", '<div class="msg bot typing" id="typing"><i></i><i></i><i></i></div>'); log.scrollTop = log.scrollHeight;
  try {
    // Thông báo lỗi chỉ để hiện, không gửi lại cho model
    const r = await capi("/tutor", { body: { lesson_id: id, messages: msgs.filter((m) => !m.error) } });
    msgs.push({ role: "assistant", content: r.reply });
  } catch (e) { msgs.push({ role: "assistant", content: "⚠️ " + e.message, error: true }); }
  tutorBusy = false;
  if (current && courseId + "/" + current.id === tk) renderTutor();
  return true;
}
$("#tutor-form").onsubmit = (e) => { e.preventDefault(); const t = $("#tutor-input"), v = t.value.trim(); if (!v || tutorBusy) return; t.value = ""; sendTutor(v); };
$("#tutor-input").onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#tutor-form").requestSubmit(); } };
function tutorOpen(on) {
  $("#tutor").hidden = !on; $("#tutor-scrim").hidden = !on; $("#tutor-fab").hidden = on;
  if (on) { renderTutor(); $("#tutor-input").focus(); } else $("#tutor-fab").focus();
}
$("#tutor-fab").onclick = () => tutorOpen(true);
$("#tutor-close").onclick = $("#tutor-scrim").onclick = () => tutorOpen(false);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#tutor").hidden) tutorOpen(false); });

/* ---------- Thanh lộ trình thu gọn ---------- */
function sideHide(on) {
  $("#app").classList.toggle("side-hidden", on);
  if (innerWidth > 760) { try { localStorage.setItem("sideHidden", on ? "1" : ""); } catch (_) {} }
  clearTimeout(resizeT); resizeT = setTimeout(() => { if (!current && $("#kg")) drawGraph(); $$(".pmap").forEach((h) => drawPmap(h)); }, 60);
}
$("#side-toggle").onclick = () => sideHide(true);
$("#side-open").onclick = () => sideHide(false);
try { if (localStorage.getItem("sideHidden") || innerWidth <= 760) sideHide(true); } catch (_) {}
$("#roadmap").addEventListener("click", (e) => { if (innerWidth <= 760 && e.target.closest("a[href]")) sideHide(true); });

setTheme(document.documentElement.dataset.theme || "auto");
window.addEventListener("hashchange", route);
route();
