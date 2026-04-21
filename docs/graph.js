(function () {
  const canvas = document.getElementById("graph");
  const ctx = canvas.getContext("2d");

  const countsEl = document.getElementById("counts");
  const selectedEl = document.getElementById("selected");
  const qEl = document.getElementById("q");
  const searchBtnEl = document.getElementById("searchBtn");
  const typeEl = document.getElementById("type");
  const modeEl = document.getElementById("mode");
  const resetEl = document.getElementById("reset");
  const randomEl = document.getElementById("random");
  const copyLinkEl = document.getElementById("copyLink");
  const pathEl = document.getElementById("path");
  const tooltipEl = document.getElementById("graphTooltip");

  const COLORS = {
    occupation: "#27d0a0",
    industry_division: "#f1c66a",
    technology: "#ff6a3d",
    tool: "#8aa0ff",
    computing_pillar: "#ffffff",
    root: "rgba(232,236,245,0.4)",
    other: "rgba(232,236,245,0.65)",
  };

  const DPR = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  let W = 0;
  let H = 0;
  let nodes = [];
  let links = [];
  let nodeById = new Map();
  let adj = new Map(); // id -> Set<neighborId>
  let edgesByNode = new Map(); // id -> [{other, relation, weight, dir}]
  let pinnedId = null;
  let lastPlanMd = "";
  let lastPathObj = null;
  let lastGuided = null;

  // view transform (world -> screen)
  let scale = 1;
  let panX = 0;
  let panY = 0;

  // simulation
  let raf = 0;
  let tick = 0;
  let dragging = null;
  let dragOffset = { x: 0, y: 0 };
  let hoveredNodeId = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = Math.max(1, Math.floor(rect.width));
    H = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    draw();
  }

  function colorOf(n) {
    return COLORS[n.type] || COLORS.other;
  }

  function worldToScreen(p) {
    return { x: (p.x * scale + panX), y: (p.y * scale + panY) };
  }

  function screenToWorld(p) {
    return { x: (p.x - panX) / scale, y: (p.y - panY) / scale };
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function buildAdj() {
    adj = new Map();
    for (const n of nodes) adj.set(n.id, new Set());
    for (const e of links) {
      const a = e.source;
      const b = e.target;
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a).add(b);
      adj.get(b).add(a);
    }
  }

  function buildEdgeIndex() {
    edgesByNode = new Map();
    for (const n of nodes) edgesByNode.set(n.id, []);
    for (const e of links) {
      if (!edgesByNode.has(e.source)) edgesByNode.set(e.source, []);
      if (!edgesByNode.has(e.target)) edgesByNode.set(e.target, []);
      edgesByNode.get(e.source).push({
        other: e.target,
        relation: e.relation || "",
        weight: e.weight || 1,
        dir: "out",
      });
      edgesByNode.get(e.target).push({
        other: e.source,
        relation: e.relation || "",
        weight: e.weight || 1,
        dir: "in",
      });
    }
  }

  function setHashForNode(id) {
    try {
      if (!id) {
        history.replaceState(null, "", location.pathname + location.search);
        return;
      }
      // Support both legacy (#node=) and plan sharing (#path=)
      const h = `#path=${encodeURIComponent(id)}&node=${encodeURIComponent(id)}`;
      history.replaceState(null, "", h);
    } catch (_) {}
  }

  function parseHashNode() {
    const h = (location.hash || "").replace(/^#/, "");
    if (!h) return null;
    const parts = h.split("&");
    for (const p of parts) {
      const [k, v] = p.split("=");
      if (k === "path" && v) return decodeURIComponent(v);
      if (k === "node" && v) return decodeURIComponent(v);
    }
    return null;
  }

  function pickNode(mx, my) {
    const p = screenToWorld({ x: mx, y: my });
    // brute force; dataset is small enough for a UI build
    let best = null;
    let bestD2 = 1e18;
    for (const n of visibleNodes()) {
      const dx = n.x - p.x;
      const dy = n.y - p.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = n;
      }
    }
    // selection radius in world space
    const r = 10 / scale;
    if (best && bestD2 <= r * r) return best;
    return null;
  }

  function visibleNodes() {
    const mode = modeEl?.value || "ego";
    if (mode === "pillars") {
      return nodes.filter((n) => n.type === "computing_pillar");
    }

    if (pinnedId) {
      const nset = new Set([pinnedId]);
      const neighbors = adj.get(pinnedId) || new Set();
      for (const x of neighbors) nset.add(x);
      // include one more hop for context (limited)
      for (const x of neighbors) {
        const nn = adj.get(x);
        if (!nn) continue;
        let c = 0;
        for (const y of nn) {
          if (c++ > 30) break;
          nset.add(y);
        }
      }
      return nodes.filter((n) => nset.has(n.id));
    }

    // global view: limit to pillars + top occupations by degree + some tech
    const degrees = [];
    for (const n of nodes) degrees.push([n.id, (adj.get(n.id)?.size || 0)]);
    degrees.sort((a, b) => b[1] - a[1]);

    const keep = new Set();
    for (const n of nodes) if (n.type === "computing_pillar") keep.add(n.id);
    for (const [id] of degrees.slice(0, 260)) keep.add(id);
    // add a small tech slice
    let t = 0;
    for (const [id] of degrees) {
      const n = nodeById.get(id);
      if (!n) continue;
      if (n.type === "technology" || n.type === "tool") {
        keep.add(id);
        if (++t >= 140) break;
      }
    }
    return nodes.filter((n) => keep.has(n.id));
  }

  function visibleLinks(vnodes) {
    const set = new Set(vnodes.map((n) => n.id));
    return links.filter((e) => set.has(e.source) && set.has(e.target));
  }

  function stepSim() {
    tick++;
    const vnodes = visibleNodes();
    const vset = new Set(vnodes.map((n) => n.id));
    const vlinks = visibleLinks(vnodes);

    // pull toward center
    const cx = 0;
    const cy = 0;
    for (const n of vnodes) {
      if (dragging && dragging.id === n.id) continue;
      n.vx = (n.vx || 0) * 0.92;
      n.vy = (n.vy || 0) * 0.92;
      n.vx += (cx - n.x) * 0.0008;
      n.vy += (cy - n.y) * 0.0008;
    }

    // link spring
    for (const e of vlinks) {
      const a = nodeById.get(e.source);
      const b = nodeById.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = 44;
      const k = 0.0012;
      const f = (d - target) * k;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      if (!dragging || dragging.id !== a.id) {
        a.vx -= fx;
        a.vy -= fy;
      }
      if (!dragging || dragging.id !== b.id) {
        b.vx += fx;
        b.vy += fy;
      }
    }

    // repel
    const arr = vnodes;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const min = 20;
        const f = (min * min) / d2 * 0.015;
        const fx = dx * f;
        const fy = dy * f;
        if (!dragging || dragging.id !== a.id) {
          a.vx -= fx;
          a.vy -= fy;
        }
        if (!dragging || dragging.id !== b.id) {
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    for (const n of vnodes) {
      if (!vset.has(n.id)) continue;
      if (dragging && dragging.id === n.id) continue;
      n.x += (n.vx || 0);
      n.y += (n.vy || 0);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    const vnodes = visibleNodes();
    const vlinks = visibleLinks(vnodes);
    const vset = new Set(vnodes.map((n) => n.id));

    // edges
    ctx.globalAlpha = 0.65;
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = "rgba(232,236,245,0.12)";
    ctx.beginPath();
    for (const e of vlinks) {
      const a = nodeById.get(e.source);
      const b = nodeById.get(e.target);
      if (!a || !b) continue;
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // nodes
    for (const n of vnodes) {
      const r = n.type === "computing_pillar" ? 8 : 5;
      ctx.beginPath();
      ctx.fillStyle = colorOf(n);
      ctx.arc(n.x, n.y, r / scale, 0, Math.PI * 2);
      ctx.fill();
      if (n.id === pinnedId) {
        ctx.strokeStyle = "rgba(241,198,106,0.9)";
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }
    }

    // labels (only if zoomed in)
    if (scale > 1.35) {
      ctx.font = `${12 / scale}px "Space Grotesk", sans-serif`;
      ctx.fillStyle = "rgba(232,236,245,0.86)";
      for (const n of vnodes) {
        if (n.type === "root") continue;
        const label = (n.label || "").slice(0, 46);
        ctx.fillText(label, n.x + 9 / scale, n.y - 8 / scale);
      }
    }

    ctx.restore();

    if (countsEl) {
      countsEl.textContent = `${vnodes.length} nodes shown · ${vlinks.length} links shown`;
    }
  }

  function showTooltip(n, mx, my) {
    if (!tooltipEl || !n) return;
    const title = escapeHtml(n.label || n.id || "Node");
    const meta = [n.type || "unknown", n.code || ""].filter(Boolean).map(escapeHtml).join(" · ");
    const body = escapeHtml(n.description || "Click to inspect this node and generate a path if it is an occupation.");
    tooltipEl.innerHTML = `
      <div class="graphTooltip__title">${title}</div>
      <div class="graphTooltip__meta">${meta}</div>
      <div class="graphTooltip__body">${body}</div>
    `;
    tooltipEl.hidden = false;
    const pad = 16;
    const rect = canvas.getBoundingClientRect();
    const width = 280;
    const x = Math.min(Math.max(pad, mx + 18), rect.width - width - pad);
    const y = Math.min(Math.max(pad, my + 18), rect.height - 120);
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    tooltipEl.hidden = true;
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      for (let i = 0; i < 2; i++) stepSim();
      draw();
      schedule();
    });
  }

  function setSelected(n) {
    if (!selectedEl) return;
    if (!n) {
      selectedEl.textContent = "Click a node to inspect it.";
      if (pathEl) pathEl.textContent = "Select an occupation to get suggested pillars and project tracks.";
      return;
    }
    const deg = adj.get(n.id)?.size || 0;
    const bits = [];
    bits.push(`<b>Label:</b> ${escapeHtml(n.label || n.id)}`);
    bits.push(`<b>Type:</b> ${escapeHtml(n.type || "unknown")}`);
    if (n.code) bits.push(`<b>O*NET Code:</b> ${escapeHtml(n.code)}`);
    bits.push(`<b>Degree:</b> ${deg}`);
    if (n.description) bits.push(`<b>Description:</b> ${escapeHtml(n.description)}`);
    selectedEl.innerHTML = bits.join("<br/>");

    // Path suggestions (only for occupations)
    if (pathEl) {
      if (n.type !== "occupation") {
        pathEl.textContent = "Select an occupation to get suggested pillars and project tracks.";
      } else {
        const pg = window.PathGen;
        if (!pg || typeof pg.generateCareerPath !== "function" || typeof pg.toMarkdown !== "function") {
          pathEl.textContent = "Path generator not loaded.";
          return;
        }
        const path = pg.generateCareerPath(n.id, { nodeById, edgesByNode });
        if (!path) {
          pathEl.textContent = "No path available for this node.";
          return;
        }
        const guided = typeof pg.buildGuidedModePlan === "function" ? pg.buildGuidedModePlan(path) : null;
        lastPlanMd = pg.toMarkdown(path);
        lastPathObj = path;
        lastGuided = guided;
        pathEl.innerHTML = renderPathHtml(path);
        if (guided) renderGuidedMode(n.id, path, guided);
      }
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalizeSearchText(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function setSearchFeedback(message, kind = "info") {
    if (countsEl && message) countsEl.textContent = message;
    if (selectedEl && kind === "error") {
      selectedEl.innerHTML = `<b>Search:</b> ${escapeHtml(message)}`;
    }
  }

  function rankSearchCandidate(n, rawQuery, normalizedQuery) {
    const label = String(n.label || "");
    const id = String(n.id || "");
    const code = String(n.code || "");
    const desc = String(n.description || "");

    const labelLc = label.toLowerCase();
    const idLc = id.toLowerCase();
    const codeLc = code.toLowerCase();

    const labelNorm = normalizeSearchText(label);
    const idNorm = normalizeSearchText(id);
    const codeNorm = normalizeSearchText(code);
    const descNorm = normalizeSearchText(desc);

    let score = -1;

    if (labelLc === rawQuery || idLc === rawQuery || codeLc === rawQuery) score = Math.max(score, 1000);
    if (labelNorm === normalizedQuery || idNorm === normalizedQuery || codeNorm === normalizedQuery) score = Math.max(score, 960);
    if (labelLc.startsWith(rawQuery) || labelNorm.startsWith(normalizedQuery)) score = Math.max(score, 900);
    if (idLc.startsWith(rawQuery) || codeLc.startsWith(rawQuery)) score = Math.max(score, 860);
    if (labelLc.includes(rawQuery) || labelNorm.includes(normalizedQuery)) score = Math.max(score, 760);
    if (idLc.includes(rawQuery) || codeLc.includes(rawQuery)) score = Math.max(score, 730);
    if (descNorm.includes(normalizedQuery) && normalizedQuery.length >= 3) score = Math.max(score, 520);

    if (score < 0 && normalizedQuery.length >= 3) {
      const qTokens = normalizedQuery.split(" ").filter(Boolean);
      const hay = `${labelNorm} ${idNorm} ${codeNorm} ${descNorm}`;
      let tokenHits = 0;
      for (const tok of qTokens) {
        if (hay.includes(tok)) tokenHits++;
      }
      if (tokenHits > 0) score = 300 + tokenHits * 40;
    }

    if (score < 0) return null;
    return { node: n, score };
  }

  function applySearch() {
    const rawQuery = (qEl?.value || "").trim().toLowerCase();
    const normalizedQuery = normalizeSearchText(rawQuery);
    const t = typeEl?.value || "all";
    if (!rawQuery || !normalizedQuery) {
      setSearchFeedback("Type a search query first.", "error");
      return null;
    }

    let best = null;
    for (const n of nodes) {
      if (t !== "all" && n.type !== t) continue;
      const ranked = rankSearchCandidate(n, rawQuery, normalizedQuery);
      if (!ranked) continue;
      if (!best || ranked.score > best.score) best = ranked;
    }
    return best?.node || null;
  }

  function runSearch() {
    const n = applySearch();
    if (!n) {
      const q = (qEl?.value || "").trim();
      setSearchFeedback(`No result found for "${q}". Try a broader term or switch the type filter to All.`, "error");
      return;
    }
    pinNode(n);
    setSearchFeedback(`Pinned: ${n.label || n.id}`);
  }

  function resetView() {
    pinnedId = null;
    scale = 1;
    panX = W * 0.5;
    panY = H * 0.5;
    setHashForNode(null);
    setSelected(null);
  }

  function pinNode(n) {
    if (!n) return;
    pinnedId = n.id;
    setSelected(n);
    setHashForNode(n.id);
    // center view
    panX = W * 0.5 - n.x * scale;
    panY = H * 0.5 - n.y * scale;
  }

  function renderPathHtml(path) {
    const escape = escapeHtml;
    const bullets = (arr, max = 8) => {
      const xs = (arr || []).slice(0, max);
      if (!xs.length) return "<div style=\"opacity:.75\">(none)</div>";
      return `<ul class="list">${xs.map((x) => `<li>${escape(x)}</li>`).join("")}</ul>`;
    };

    const kvList = (arr, max = 6) => {
      const xs = (arr || []).slice(0, max);
      if (!xs.length) return "<span style=\"opacity:.75\">(none)</span>";
      return xs.map((x) => escape(x)).join(", ");
    };

    const pillars = (path.pillars || []).slice(0, 4);
    const pillarLine = pillars.length
      ? pillars.map((p) => `${escape(p.label)} <span style="opacity:.7">(${Number(p.score).toFixed(1)})</span>`).join("<br/>• ")
      : "(none)";

    const industries = (path.industries || []).slice(0, 5).map((x) => `${escape(x.label)} <span style="opacity:.7">(${Number(x.weight).toFixed(1)}%)</span>`);

    const weeks = (path.plan_4_weeks || []).map((w) => {
      const b = (w.bullets || []).map((x) => `<li>${escape(x)}</li>`).join("");
      return `<div class="pathH">Week ${w.week}: ${escape(w.title)}</div><ul class="list">${b}</ul>`;
    });

    const onetBlock = (title, items, max = 8) => {
      const xs = (items || []).slice(0, max);
      if (!xs.length) return "";
      const rows = xs
        .map((it) => `<li>${escape(it.name)} <span style="opacity:.7">(${Number(it.importance).toFixed(2)})</span></li>`)
        .join("");
      return `<div class="pathH">${escape(title)}</div><ul class="list">${rows}</ul>`;
    };

    const confidence = path.confidence || { label: "—", score: 0, note: "" };

    return `
      <div><b>${escape(path.role)}</b>${path.code ? ` <span style="opacity:.75">(${escape(path.code)})</span>` : ""}</div>
      <div style="opacity:.8; margin-top:6px"><b>Formula:</b> Field → Role → Skills → Tools → Projects → Income</div>

      <div class="pathActions">
        <button class="miniBtn" type="button" data-copy-plan="1">Copy Plan</button>
        <button class="miniBtn" type="button" data-download-plan="md">Download .md</button>
        <button class="miniBtn" type="button" data-download-plan="json">Download .json</button>
        <button class="miniBtn" type="button" data-start-sprint="7">Start 7‑Day Sprint</button>
        <button class="miniBtn" type="button" data-open-sprint="1">Open Sprint Page</button>
        <button class="miniBtn" type="button" data-copy-sprint="1">Copy Sprint Link</button>
        <button class="miniBtn" type="button" data-toggle-roadmap="30">30‑Day Mode</button>
        <button class="miniBtn" type="button" data-copy-discord="1">Copy Discord Update</button>
        <a class="miniBtn" href="https://github.com/eruditewbt/Tech_Community_by_EruditeWBT/tree/main/projects/tracks" target="_blank" rel="noreferrer">Open Tracks</a>
        <a class="miniBtn" href="https://github.com/eruditewbt/Tech_Community_by_EruditeWBT/blob/main/community_guides/HOW_TO_USE_THE_GRAPH.md" target="_blank" rel="noreferrer">Guide</a>
        <a class="miniBtn" href="./learn.html">Learn</a>
        <a class="miniBtn" href="./projects.html">Projects</a>
        <a class="miniBtn" href="./join.html">Join</a>
        <a class="miniBtn" href="./START.html">Start</a>
      </div>

      <div class="pathH">Trust</div>
      <div>
        <b>Confidence:</b> ${escape(confidence.label)} <span style="opacity:.7">(${(Number(confidence.score) * 100).toFixed(0)}%)</span><br/>
        <b>Difficulty:</b> ${escape(path.difficulty || "—")}<br/>
        <b>Time to first result:</b> ${escape(path.time_to_first_result || "—")}<br/>
        <b>Best first step:</b> ${escape(path.best_first_step || "—")}<br/>
        <span style="opacity:.75">${escape(confidence.note || "")}</span>
      </div>

      <div class="pathH">Related fields</div>
      <div>${kvList(path.fields, 8)}</div>

      <div class="pathH">Top pillars</div>
      <div>• ${pillarLine}</div>

      <div class="pathH">Industries</div>
      <div>${industries.length ? "• " + industries.join("<br/>• ") : "<span style=\"opacity:.75\">(none)</span>"}</div>

      <div class="pathH">Technologies</div>
      ${bullets(path.technologies, 8)}

      <div class="pathH">Tools</div>
      ${bullets(path.tools, 8)}

      ${onetBlock("O*NET Skills (importance)", path.onet_skills, 8)}
      ${onetBlock("O*NET Knowledge (importance)", path.onet_knowledge, 8)}
      ${onetBlock("O*NET Abilities (importance)", path.onet_abilities, 6)}

      <div class="pathH">Skills (suggested)</div>
      ${bullets(path.skills, 10)}

      <div class="pathH">Projects (suggested)</div>
      ${bullets(path.projects, 6)}

      <div class="pathH">Income paths</div>
      ${bullets(path.income_paths, 6)}

      <div class="pathH">4-week plan</div>
      ${weeks.join("")}

      <div class="pathH">Provenance</div>
      <div style="opacity:.78">${escape(path.provenance.scope)}<br/>${escape(path.provenance.note)}<br/><i>Not career advice.</i></div>

      <div id="guided" style="margin-top:12px"></div>
    `;
  }

  function sprintStorageKey(occId) {
    return `ewbt:sprint7:${occId}`;
  }

  function loadSprintProgress(occId) {
    try {
      const raw = localStorage.getItem(sprintStorageKey(occId));
      if (!raw) return { startedAt: null, dayDone: {} };
      const j = JSON.parse(raw);
      if (!j || typeof j !== "object") return { startedAt: null, dayDone: {} };
      return { startedAt: j.startedAt || null, dayDone: j.dayDone || {} };
    } catch (_) {
      return { startedAt: null, dayDone: {} };
    }
  }

  function saveSprintProgress(occId, st) {
    try {
      localStorage.setItem(sprintStorageKey(occId), JSON.stringify(st));
    } catch (_) {}
  }

  function renderGuidedMode(occId, path, guided) {
    const host = document.getElementById("guided");
    if (!host) return;

    const st = loadSprintProgress(occId);
    const done = st.dayDone || {};

    const doneCount = Object.values(done).filter(Boolean).length;
    const started = st.startedAt ? new Date(st.startedAt).toLocaleDateString() : null;

    const rows = guided.sprint_7_days
      .map((d) => {
        const checked = !!done[d.day];
        const links = (d.links || [])
          .slice(0, 3)
          .map((l) => `<a class="inline" href="${l.url}" ${l.url.startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>${escapeHtml(l.label)}</a>`)
          .join(" · ");
        return `
          <div class="sprintRow">
            <label class="sprintCheck">
              <input type="checkbox" data-sprint-day="${d.day}" ${checked ? "checked" : ""} />
              <span><b>Day ${d.day}:</b> ${escapeHtml(d.title)}</span>
            </label>
            <div class="sprintMeta">
              <div><span style="opacity:.8">Action:</span> ${escapeHtml(d.action)}</div>
              <div><span style="opacity:.8">Output:</span> ${escapeHtml(d.output)}</div>
              <div class="sprintLinks">${links}</div>
            </div>
          </div>
        `;
      })
      .join("");

    // 30-day: show week headers + bullets (no checkboxes by default)
    const roadmap = guided.roadmap_30_days || [];
    const weeks = [];
    for (let w = 1; w <= 5; w++) {
      const slice = roadmap.filter((x) => Math.floor((x.day - 1) / 7) + 1 === w);
      if (!slice.length) continue;
      const lines = slice
        .slice(0, 7)
        .map((d) => `<li><b>Day ${d.day}:</b> ${escapeHtml(d.action)} <span style="opacity:.7">(${escapeHtml(d.output)})</span></li>`)
        .join("");
      weeks.push(`<div class="pathH">Week ${w}</div><ul class="list">${lines}</ul>`);
    }

    host.innerHTML = `
      <div class="pathH">Guided Mode</div>
      <div style="opacity:.85">
        <b>7‑Day Sprint:</b> ${doneCount}/7 complete${started ? ` · started ${started}` : ""}<br/>
        This is the behavior engine: do one thing <b>today</b>, ship proof weekly.
      </div>
      <div class="sprintWrap">${rows}</div>
      <details class="roadmapDetails" id="roadmapDetails">
        <summary class="roadmapSummary">30‑Day Progression (structured)</summary>
        <div style="margin-top:10px">${weeks.join("")}</div>
      </details>
    `;
  }

  function normalizeData(raw) {
    const rawNodes = raw.nodes || [];
    const rawLinks = raw.links || raw.links || [];

    nodes = rawNodes.map((n, i) => ({
      ...n,
      id: n.id,
      label: n.label || n.id,
      type: n.type || "other",
      x: (Math.random() - 0.5) * 600,
      y: (Math.random() - 0.5) * 520,
      vx: 0,
      vy: 0,
      _i: i,
    }));

    nodeById = new Map(nodes.map((n) => [n.id, n]));

    links = rawLinks.map((e) => ({
      source: typeof e.source === "object" ? e.source.id : e.source,
      target: typeof e.target === "object" ? e.target.id : e.target,
      relation: e.relation || "",
      weight: Number(e.weight || 1),
    }));

    // drop links to missing nodes (just in case)
    links = links.filter((e) => nodeById.has(e.source) && nodeById.has(e.target));
    buildAdj();
    buildEdgeIndex();

    if (countsEl) countsEl.textContent = `${nodes.length} nodes · ${links.length} links loaded`;
  }

  async function load() {
    resize();
    resetView();

    const res = await fetch("assets/graph/graph.json", { cache: "no-store" });
    const raw = await res.json();
    normalizeData(raw);

    // If URL specifies a node, pin it.
    const hashNode = parseHashNode();
    if (hashNode && nodeById.has(hashNode)) {
      pinNode(nodeById.get(hashNode));
      scale = 1.2;
    }

    schedule();
  }

  // Copy plan action (delegated)
  document.addEventListener("click", async (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const btn = t.closest("[data-copy-plan]");
    if (!btn) return;
    if (!lastPlanMd) return;
    try {
      await navigator.clipboard.writeText(lastPlanMd);
      if (countsEl) countsEl.textContent = "Plan copied.";
      window.setTimeout(() => {
        if (countsEl) countsEl.textContent = `${visibleNodes().length} nodes shown · ${visibleLinks(visibleNodes()).length} links shown`;
      }, 1200);
    } catch (_) {
      if (countsEl) countsEl.textContent = "Copy failed.";
    }
  });

  document.addEventListener("click", async (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const btn = t.closest("[data-download-plan]");
    if (!btn) return;
    const kind = btn.getAttribute("data-download-plan");
    if (!pinnedId) return;
    const safe = String(pinnedId).replaceAll(":", "_");
    if (kind === "md" && lastPlanMd) {
      const blob = new Blob([lastPlanMd], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `career_path_${safe}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (kind === "json" && lastPathObj) {
      const blob = new Blob([JSON.stringify(lastPathObj, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `career_path_${safe}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return;
    }
  });

  // Guided mode controls
  document.addEventListener("click", async (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;

    const sprintOpenBtn = t.closest("[data-open-sprint]");
    const sprintCopyBtn = t.closest("[data-copy-sprint]");
    if (sprintOpenBtn || sprintCopyBtn) {
      if (!pinnedId) return;
      const sc = window.SprintCodec;
      if (!sc || typeof sc.encode !== "function") {
        if (countsEl) countsEl.textContent = "Sprint codec missing (refresh page).";
        return;
      }
      const st = loadSprintProgress(pinnedId);
      const payload = {
        v: 1,
        occId: pinnedId,
        createdAt: new Date().toISOString(),
        startedAt: st.startedAt || null,
        dayDone: st.dayDone || {},
      };
      const encoded = sc.encode(payload);
      const u = new URL("sprint.html", location.href);
      u.hash = `s=${encoded}`;
      const url = u.toString();

      if (sprintOpenBtn) {
        window.open(url, "_blank", "noopener");
        return;
      }

      try {
        await navigator.clipboard.writeText(url);
        if (countsEl) countsEl.textContent = "Sprint link copied.";
        window.setTimeout(() => {
          if (countsEl) countsEl.textContent = `${visibleNodes().length} nodes shown · ${visibleLinks(visibleNodes()).length} links shown`;
        }, 1200);
      } catch (_) {
        if (countsEl) countsEl.textContent = "Copy failed.";
      }
      return;
    }

    const startBtn = t.closest("[data-start-sprint]");
    if (startBtn) {
      if (!pinnedId || !lastGuided) return;
      const st = loadSprintProgress(pinnedId);
      st.startedAt = new Date().toISOString();
      st.dayDone = {};
      saveSprintProgress(pinnedId, st);
      renderGuidedMode(pinnedId, lastPathObj, lastGuided);
      return;
    }

    const toggleBtn = t.closest("[data-toggle-roadmap]");
    if (toggleBtn) {
      const det = document.getElementById("roadmapDetails");
      if (det && det.tagName === "DETAILS") det.open = !det.open;
      return;
    }

    const discBtn = t.closest("[data-copy-discord]");
    if (discBtn) {
      if (!pinnedId || !lastPathObj || !lastGuided) return;
      const pg = window.PathGen;
      if (!pg || typeof pg.buildDiscordUpdate !== "function") return;
      const st = loadSprintProgress(pinnedId);
      const shareUrl = location.href;
      const msg = pg.buildDiscordUpdate({ path: lastPathObj, guided: lastGuided, dayDone: st.dayDone || {}, shareUrl });
      try {
        await navigator.clipboard.writeText(msg);
        if (countsEl) countsEl.textContent = "Discord update copied.";
        window.setTimeout(() => {
          if (countsEl) countsEl.textContent = `${visibleNodes().length} nodes shown · ${visibleLinks(visibleNodes()).length} links shown`;
        }, 1200);
      } catch (_) {
        if (countsEl) countsEl.textContent = "Copy failed.";
      }
      return;
    }
  });

  document.addEventListener("change", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const cb = t.closest("[data-sprint-day]");
    if (!cb) return;
    if (!pinnedId || !lastGuided) return;
    const day = Number(cb.getAttribute("data-sprint-day"));
    if (!Number.isFinite(day)) return;
    const st = loadSprintProgress(pinnedId);
    st.startedAt = st.startedAt || new Date().toISOString();
    st.dayDone = st.dayDone || {};
    st.dayDone[day] = cb.checked;
    saveSprintProgress(pinnedId, st);
    renderGuidedMode(pinnedId, lastPathObj, lastGuided);
  });

  // interactions
  let isPanning = false;
  let panStart = { x: 0, y: 0, ox: 0, oy: 0 };

  canvas.addEventListener("mousedown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const picked = pickNode(mx, my);
    if (picked) {
      dragging = picked;
      const w = screenToWorld({ x: mx, y: my });
      dragOffset.x = picked.x - w.x;
      dragOffset.y = picked.y - w.y;
      return;
    }
    isPanning = true;
    panStart = { x: mx, y: my, ox: panX, oy: panY };
  });

  window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (dragging) {
      const w = screenToWorld({ x: mx, y: my });
      dragging.x = w.x + dragOffset.x;
      dragging.y = w.y + dragOffset.y;
      dragging.vx = 0;
      dragging.vy = 0;
      hideTooltip();
      return;
    }
    if (isPanning) {
      panX = panStart.ox + (mx - panStart.x);
      panY = panStart.oy + (my - panStart.y);
      hideTooltip();
      return;
    }
    const picked = pickNode(mx, my);
    hoveredNodeId = picked ? picked.id : null;
    if (picked) {
      canvas.style.cursor = "pointer";
      showTooltip(picked, mx, my);
    } else {
      canvas.style.cursor = "default";
      hideTooltip();
    }
  });

  window.addEventListener("mouseup", (e) => {
    if (dragging) {
      dragging = null;
      return;
    }
    if (isPanning) isPanning = false;
  });

  canvas.addEventListener("mouseleave", () => {
    hoveredNodeId = null;
    canvas.style.cursor = "default";
    hideTooltip();
  });

  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const picked = pickNode(mx, my);
    if (!picked) return;
    pinNode(picked);
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const before = screenToWorld({ x: mx, y: my });
      const dz = e.deltaY > 0 ? 0.92 : 1.08;
      scale = clamp(scale * dz, 0.5, 3.2);
      const after = screenToWorld({ x: mx, y: my });

      // zoom around cursor
      panX += (after.x - before.x) * scale;
      panY += (after.y - before.y) * scale;
    },
    { passive: false }
  );

  qEl?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    runSearch();
  });

  searchBtnEl?.addEventListener("click", () => {
    runSearch();
  });

  modeEl?.addEventListener("change", () => {
    pinnedId = null;
    setSelected(null);
  });

  resetEl?.addEventListener("click", () => {
    qEl.value = "";
    typeEl.value = "all";
    modeEl.value = "ego";
    resetView();
  });

  randomEl?.addEventListener("click", () => {
    const occ = nodes.filter((n) => n.type === "occupation");
    if (!occ.length) return;
    const pick = occ[Math.floor(Math.random() * occ.length)];
    pinNode(pick);
  });

  copyLinkEl?.addEventListener("click", async () => {
    const url = location.href;
    try {
      await navigator.clipboard.writeText(url);
      if (countsEl) countsEl.textContent = "Link copied.";
      window.setTimeout(() => {
        if (countsEl) countsEl.textContent = `${visibleNodes().length} nodes shown · ${visibleLinks(visibleNodes()).length} links shown`;
      }, 1200);
    } catch (_) {
      if (countsEl) countsEl.textContent = "Copy failed.";
    }
  });

  window.addEventListener("resize", resize);

  load().catch((err) => {
    if (countsEl) countsEl.textContent = "Failed to load graph.";
    if (selectedEl) selectedEl.textContent = String(err);
  });
})();
