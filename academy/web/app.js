"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
const view = $("#view");
const ICON = { passed: "✓", in_progress: "●", not_started: "○", locked: "🔒", planned: "" };
const STATUS_LABEL = { passed: "Đã xong", in_progress: "Đang học", not_started: "Chưa học", locked: "Đang khóa", planned: "Sắp có" };
const TRACK = { "AI": "ai", "Data": "data", "AI×Data": "aixdata", "Nâng cao": "adv" };
const GROUP_COLORS = ["#E9A23B", "#3D6EF5", "#12A27A", "#E2557F", "#8B5CF6", "#5B7A99", "#C2681E", "#0EA5B7"];
let roadmap = null;
let current = null; // {id, lesson, tab, iv, guide}
let tutorMsgs = {}; // lessonId -> messages

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* private mode */ } },
};
function md(text) {
  if (window.marked) return marked.parse(text || "", { gfm: true, breaks: false });
  return "<pre>" + esc(text) + "</pre>";
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
const CALLOUTS = [["💡", "tip"], ["⚠️", "warn"], ["⚠", "warn"], ["🧠", "remember"], ["🎯", "interview"]];
const LANG = { py: "python", python: "python", python3: "python", sh: "bash", bash: "bash", shell: "bash", console: "bash", zsh: "bash", json: "json" };
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
    head.innerHTML = `<span>${esc(lang ? { python: "Python", bash: "Terminal", json: "JSON" }[lang] : (raw || "Code"))}</span>`;
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
function mdEl(text, cls = "md") {
  const d = document.createElement("div");
  d.className = cls; d.innerHTML = md(text);
  return enhance(d);
}
const mdHTML = (text, cls = "md") => mdEl(text, cls).outerHTML; // chỉ dùng khi không có mermaid/nút

/* ---------- Tách lesson.md ---------- */
function isFence(line) { return /^\s*(```|~~~)/.test(line); }
function splitLesson(text) {
  const out = { intro: "", goal: "", task: "", check: "", steps: "", concepts: "", extra: [] };
  let intro = [], cur = null, fence = false;
  const push = () => {
    if (!cur) return;
    const t = cur.title.toLowerCase().replace(/^[^\p{L}]+/u, "").trim(), body = cur.lines.join("\n").trim();
    if (t.includes("phỏng vấn")) return;
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
async function loadRoadmap() { roadmap = await api("/roadmap"); renderSidebar(); }
function renderSidebar() {
  const s = roadmap.summary;
  $("#overall-bar").style.width = (s.total ? (100 * s.passed) / s.total : 0) + "%";
  $("#overall-text").textContent = `${s.passed}/${s.total} bài đã xong` + (s.planned ? ` · ${s.planned} bài sắp có` : "");
  $("#nav-home").classList.toggle("active", !current);
  $("#roadmap").innerHTML = roadmap.projects.map((p) => `
    <div class="proj t-${TRACK[p.track] || "ai"}"><h4><span class="dot"></span>${esc(p.id)} · ${esc(p.title)}</h4>
    ${p.lessons.filter((l) => l.status !== "planned").map((l) => {
      const active = current && current.id === l.id ? " active" : "";
      return `<a class="lesson-link st-${l.status}${active}" href="#/lesson/${encodeURIComponent(l.id)}" title="${esc(l.goal || "")}"${active ? ' aria-current="page"' : ""}>
        <span class="ic" aria-label="${STATUS_LABEL[l.status] || ""}">${ICON[l.status] || ""}</span><span class="lt">${esc(l.title)}</span></a>`;
    }).join("")}
    ${(() => { const soon = p.lessons.filter((l) => l.status === "planned"); return soon.length ? `<details class="soon"><summary>${soon.length} bài sắp có</summary>
      ${soon.map((l) => `<div class="lesson-link st-planned disabled" title="${esc(l.goal || "")}"><span class="ic"></span><span class="lt">${esc(l.title)}</span></div>`).join("")}</details>` : ""; })()}</div>`).join("");
}

/* ---------- Router ---------- */
async function route() {
  const h = location.hash || "#/";
  if (h === "#/map") { location.replace("#/"); return; }
  try {
    if (!roadmap) await loadRoadmap();
    if (h.startsWith("#/lesson/")) { await showLesson(decodeURIComponent(h.slice(9))); return; }
    current = null; setTutorLesson(null); $("#main").classList.remove("fill");
    showHome();
    renderSidebar();
    $("#main").scrollTop = 0;
  } catch (e) {
    view.innerHTML = `<div class="col"><p class="err">${esc(e.message)}</p></div>`;
  }
  if (innerWidth <= 760) sideHide(true);
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
  const nx = nextLesson();
  const learned = roadmap.concepts.filter((c) => c.learned).length;
  const greet = (() => { const h = new Date().getHours(); return h < 11 ? "Chào buổi sáng" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối"; })();
  const projs = roadmap.projects.map((p) => {
    const ready = p.lessons.filter((l) => l.status !== "planned"), done = p.lessons.filter((l) => l.status === "passed").length;
    const first = ready.find((l) => l.status !== "passed" && l.status !== "locked") || ready[0];
    const state = !ready.length ? "soon" : done === p.lessons.length ? "done" : (p.lessons.some((l) => l.status === "in_progress" || l.status === "passed") ? "active" : "open");
    const tag = first ? "a" : "div", href = first ? ` href="#/lesson/${encodeURIComponent(first.id)}"` : "";
    return `<li class="tl-item t-${TRACK[p.track] || "ai"} s-${state}">
      <${tag} class="tl-card"${href}>
        <span class="tl-node" aria-hidden="true">${state === "done" ? "✓" : esc(p.id.replace("P", ""))}</span>
        <span class="tl-track">${esc(p.track || "")}</span>
        <b class="tl-title">${esc(p.title)}</b>
        <span class="tl-count">${state === "soon" ? "Sắp có" : `${done}/${p.lessons.length} bài`}</span>
        <span class="tl-bar"><i style="width:${(100 * done) / p.lessons.length}%"></i></span>
      </${tag}></li>`;
  }).join("");
  const tracks = [...new Set(roadmap.projects.map((p) => p.track).filter(Boolean))];
  view.innerHTML = `<div class="home">
    <section class="hero">
      <div class="hero-main">
        <p class="eyebrow">${greet} 👋</p>
        <h1>Học AI & Data<br>từng bước một.</h1>
        <p class="hero-sub">${esc(roadmap.title)}</p>
        <div class="hero-stats">
          <div class="ring-wrap">${ring(pct)}<div class="ring-txt"><b>${pct}%</b><small>hoàn thành</small></div></div>
          <ul class="mini-stats">
            <li><b>${s.passed}</b><span>/ ${s.total} bài đã xong</span></li>
            <li><b>${learned}</b><span>/ ${roadmap.concepts.length} khái niệm</span></li>
          </ul>
        </div>
      </div>
      ${nx ? `<a class="continue t-${TRACK[nx.project.track] || "ai"}" href="#/lesson/${encodeURIComponent(nx.id)}">
          <span class="continue-k">${nx.status === "in_progress" ? "Tiếp tục học" : "Bài tiếp theo"}</span>
          <span class="continue-proj">${esc(nx.project.id)} · ${esc(nx.project.title)}</span>
          <b class="continue-title">${esc(nx.title)}</b>
          <span class="continue-goal">${esc(nx.goal || "")}</span>
          <span class="btn continue-btn">${nx.status === "in_progress" ? "Học tiếp" : "Bắt đầu học"} <span aria-hidden="true">→</span></span>
        </a>` : `<div class="continue done"><span class="continue-k">Tuyệt vời!</span><b class="continue-title">Bạn đã xong mọi bài hiện có 🎉</b><span class="continue-goal">Bài mới sẽ sớm xuất hiện trong lộ trình.</span></div>`}
    </section>
    ${roadmap.has_key ? "" : '<div class="notice">🔑 Chưa có <code>NVIDIA_API_KEY</code> — Gia sư AI và chấm phỏng vấn chưa dùng được. Thêm key vào <code>academy/.env</code>.</div>'}
    <section class="sec">
      <div class="sec-head"><h2>Lộ trình</h2>
        <div class="legend">${tracks.map((t) => `<span class="lg t-${TRACK[t] || "ai"}"><i></i>${esc(t)}</span>`).join("")}</div></div>
      <ol class="timeline">${projs}</ol>
    </section>
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
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { if (!current) drawGraph(); });
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
  const go = (n) => { if (n.target) location.hash = "#/lesson/" + encodeURIComponent(n.target.id); };
  node.on("mouseenter", show).on("mouseleave", hide).on("focus", show).on("blur", hide)
    .on("click", (ev, n) => go(n)).on("keydown", (ev, n) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); go(n); } });
}
let resizeT = null;
addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!current && $("#kg")) drawGraph(); }, 200); });

/* ---------- Trang bài học ---------- */
async function showLesson(id) {
  const lesson = await api("/lessons/" + encodeURIComponent(id));
  const keep = current && current.id === id ? current : null;
  current = { id, lesson, tab: keep ? keep.tab : "lesson", iv: keep ? keep.iv : {}, guide: store.get("guide:" + id, "steps"), pane: keep ? keep.pane : "left" };
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
    <div class="crumb">${info ? `<span class="trk t-${TRACK[info.project.track] || "ai"}">${esc(info.project.track || "")}</span> ${esc(info.project.id)} · ${esc(info.project.title)}` : ""}</div>
    <h1>${esc(m.title)}</h1>
    <div class="lmeta"><span class="chip time">⏱ ${m.duration_min ? Math.round(m.duration_min / 6) / 10 + " giờ" : "?"}</span>${concepts}</div>
    <div class="tabs" role="tablist">
      <button class="tab${tab === "lesson" ? " active" : ""}" data-tab="lesson" role="tab" aria-selected="${tab === "lesson"}">Bài học</button>
      <button class="tab${tab === "interview" ? " active" : ""}" data-tab="interview" role="tab" aria-selected="${tab === "interview"}">Phỏng vấn thử</button></div></header>
    <div id="tabbody" class="lbody${tab === "lesson" ? "" : " scroll"}"></div>`;
  $$(".tab", view).forEach((b) => b.onclick = () => { current.tab = b.dataset.tab; renderLesson(); });
  if (tab === "lesson") renderLessonTab(); else renderInterviewTab();
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
      const r = await api(`/lessons/${id}/checklist`, { body: { index: +c.dataset.i, done: c.checked } });
      current.lesson.progress.checklist = r.checklist;
      const n = Object.values(r.checklist).filter(Boolean).length;
      $("#cl-count", body).textContent = `${n}/${nCl}`;
    } catch (e) { c.checked = !c.checked; alert(e.message); }
  });

  // Hướng dẫn
  renderSteps(sec);
  renderConcepts(sec);
  const setGuide = (g) => {
    current.guide = g; store.set("guide:" + id, g);
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
  const pyCmd = m.entry ? `${roadmap.platform === "windows" ? "python" : "python3"} ${esc(m.entry)}` : "";
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
        <li>Mở thư mục bằng <b>VS Code</b>, mở ${entry}${pyCmd ? ` (chạy thử: <code>${pyCmd}</code>)` : ""}.</li>
        <li>Viết code vào chỗ <code># TODO</code>, xem tab <b>Hướng dẫn</b> khi bí.</li>
        <li><b>Chạy test</b> — đạt hết là qua bài, mở bài tiếp.</li></ol></details>
  </div>`;
  const c = $(".cmd", host); if (c) c.appendChild(copyBtn(() => cmd));
  const un = $("#unlock", host);
  if (un) un.onclick = async () => { await api(`/lessons/${id}/unlock`, { body: {} }); await loadRoadmap(); showLesson(id); };
  const st = $("#start", host);
  if (st) st.onclick = async () => {
    st.disabled = true; st.textContent = "Đang tạo…";
    try { await api(`/lessons/${id}/start`, { body: {} }); await loadRoadmap(); current.lesson.workspace_exists = true; current.lesson.status = "in_progress"; renderStatus(); renderSidebar(); }
    catch (e) { $("#runmsg", host).innerHTML = `<p class="err">${esc(e.message)}</p>`; st.disabled = false; st.textContent = "🚀 Bắt đầu"; }
  };
  const rt = $("#runtest", host);
  if (rt) rt.onclick = async () => {
    rt.disabled = true; rt.innerHTML = '<span class="spin" aria-hidden="true"></span> Đang chạy…';
    try {
      const r = await api(`/lessons/${id}/test`, { body: {} });
      current.lesson.progress.last_test = { passed: r.passed, failed: r.failed, total: r.total, tests: r.tests || [] };
      if (r.ok) { current.lesson.progress.passed = true; await loadRoadmap(); }
      renderStatus(); renderTasks();
      const msg = $("#runmsg");
      if (r.timeout) msg.innerHTML = `<p class="err">${esc(r.output)}</p>`;
      else if (!r.ok && r.output) {
        msg.innerHTML = `<details class="more out"><summary>Xem chi tiết pytest</summary><pre class="output">${esc(r.output)}</pre></details>`;
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
  const claimed = new Set();
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
  let done = new Set(store.get(key, []));
  const items = parts.items.map((it, i) => {
    const m = it.title.match(/^bước\s*(\d+)\s*[—–:\-.]*\s*(.*)$/i);
    return { i, num: m ? m[1] : "★", title: m ? (m[2] || it.title) : it.title, body: it.body, extra: !m };
  });
  const prog = document.createElement("div"); prog.className = "step-prog";
  const list = document.createElement("ol"); list.className = "stepper";
  host.append(prog, list);
  let open = items.findIndex((it) => !done.has(it.i)); if (open < 0) open = items.length - 1;
  const save = () => store.set(key, [...done]);
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
  body.innerHTML = `<div class="col iv"><p class="iv-intro">Trả lời như đang nói với nhà tuyển dụng — ngắn, rõ, có ví dụ. Gia sư AI sẽ chấm điểm và gợi ý câu trả lời tốt hơn.</p>` + qs.map((q, i) => `<div class="q" data-i="${i}">
    <div class="q-h"><span class="q-n">${i + 1}</span><p>${mdInline(q)}</p></div>
    <textarea rows="4" placeholder="Câu trả lời của bạn…" aria-label="Trả lời câu ${i + 1}">${esc(current.iv[i]?.answer || "")}</textarea>
    <div class="row"><button class="btn" type="button">Chấm điểm</button></div><div class="fb">${current.iv[i]?.html || ""}</div></div>`).join("") + "</div>";
  $$(".q", body).forEach((el) => {
    const i = +el.dataset.i, ta = $("textarea", el), fb = $(".fb", el), btn = $("button", el);
    ta.oninput = () => { current.iv[i] = { ...(current.iv[i] || {}), answer: ta.value }; };
    btn.onclick = async () => {
      btn.disabled = true; fb.innerHTML = '<p class="meta">Đang chấm…</p>';
      try {
        const g = await api("/interview/grade", { body: { lesson_id: id, question: qs[i], answer: ta.value } });
        const li = (a) => a.map((x) => `<li>${esc(x)}</li>`).join("");
        const html = `<div class="grade"><div class="score"><b>${g.score}</b>/10</div>
          <div class="gcols"><div><h5>Điểm tốt</h5><ul>${li(g.strengths)}</ul></div><div><h5>Còn thiếu</h5><ul>${li(g.gaps)}</ul></div></div>
          <details class="more"><summary>Câu trả lời tốt hơn</summary>${mdHTML(g.better_answer)}</details></div>`;
        current.iv[i] = { answer: ta.value, html }; fb.innerHTML = html;
      } catch (e) { fb.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
      btn.disabled = false;
    };
  });
}

/* ---------- Gia sư AI ---------- */
const SUGGEST = ["Lỗi này nghĩa là gì?", "Gợi ý cho mình bước tiếp theo", "Giải thích lại bằng ví dụ đời thường"];
function setTutorLesson(title) { $("#tutor-lesson").textContent = title ? "Bài: " + title : "Mở một bài để hỏi gia sư"; renderTutor(); }
function renderTutor() {
  const log = $("#tutor-log"), msgs = (current && tutorMsgs[current.id]) || [];
  if (msgs.length) {
    log.innerHTML = "";
    msgs.forEach((m) => {
      const d = document.createElement("div"); d.className = "msg " + (m.role === "user" ? "user" : "bot");
      if (m.role === "user") d.textContent = m.content; else { d.appendChild(mdEl(m.content)); }
      log.appendChild(d);
    });
  } else {
    log.innerHTML = `<div class="tutor-empty"><p>Hỏi gì cũng được — gia sư <b>gợi ý</b> để bạn tự nghĩ ra, chứ không đưa đáp án luôn.</p>
      ${current ? `<div class="sugg">${SUGGEST.map((s) => `<button type="button" class="chip-btn">${esc(s)}</button>`).join("")}</div>` : ""}</div>`;
    $$(".chip-btn", log).forEach((b) => b.onclick = () => { const t = $("#tutor-input"); t.value = b.textContent; t.focus(); });
  }
  log.scrollTop = log.scrollHeight;
}
async function sendTutor(text) {
  if (!current) { alert("Hãy mở một bài học trước."); return; }
  const id = current.id, msgs = (tutorMsgs[id] = tutorMsgs[id] || []);
  msgs.push({ role: "user", content: text }); renderTutor();
  const log = $("#tutor-log"); log.insertAdjacentHTML("beforeend", '<div class="msg bot typing" id="typing"><i></i><i></i><i></i></div>'); log.scrollTop = log.scrollHeight;
  try {
    const r = await api("/tutor", { body: { lesson_id: id, messages: msgs } });
    msgs.push({ role: "assistant", content: r.reply });
  } catch (e) { msgs.push({ role: "assistant", content: "⚠️ " + e.message }); }
  if (current && current.id === id) renderTutor();
}
$("#tutor-form").onsubmit = (e) => { e.preventDefault(); const t = $("#tutor-input"), v = t.value.trim(); if (!v) return; t.value = ""; sendTutor(v); };
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
  if (!current && $("#kg")) { clearTimeout(resizeT); resizeT = setTimeout(drawGraph, 60); }
}
$("#side-toggle").onclick = () => sideHide(true);
$("#side-open").onclick = () => sideHide(false);
try { if (localStorage.getItem("sideHidden") || innerWidth <= 760) sideHide(true); } catch (_) {}
$("#roadmap").addEventListener("click", (e) => { if (innerWidth <= 760 && e.target.closest("a[href]")) sideHide(true); });

setTheme(document.documentElement.dataset.theme || "auto");
window.addEventListener("hashchange", route);
route();
