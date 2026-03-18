(function () {
  "use strict";

  const titleEl = document.getElementById("title");
  const subEl = document.getElementById("sub");
  const summaryEl = document.getElementById("summary");
  const checklistEl = document.getElementById("checklist");
  const pathEl = document.getElementById("path");
  const roadmapEl = document.getElementById("roadmap");

  const copyLinkEl = document.getElementById("copyLink");
  const copyDiscordEl = document.getElementById("copyDiscord");
  const downloadMdEl = document.getElementById("downloadMd");
  const openGraphEl = document.getElementById("openGraph");

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
  }

  function fmtDate(iso) {
    try {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return "";
      return d.toLocaleDateString();
    } catch (_) {
      return "";
    }
  }

  function parseHash() {
    const h = String(location.hash || "").replace(/^#/, "");
    if (!h) return { kind: "empty" };

    // Support #s=... or #data=... as primary.
    if (h.startsWith("s=")) return { kind: "encoded", value: h.slice(2) };
    if (h.startsWith("data=")) return { kind: "encoded", value: h.slice(5) };

    // Also support query-ish hashes: #s=...&x=y
    const parts = h.split("&");
    for (const p of parts) {
      const [k, v] = p.split("=");
      if ((k === "s" || k === "data") && v) return { kind: "encoded", value: v };
      if ((k === "occ" || k === "occId" || k === "path") && v) return { kind: "occ", value: decodeURIComponent(v) };
    }
    return { kind: "unknown" };
  }

  async function fetchJson(url) {
    const r = await fetch(url, { cache: "force-cache" });
    if (!r.ok) throw new Error(`Fetch failed: ${url}`);
    return await r.json();
  }

  function buildCtx(rawGraph) {
    const rawNodes = rawGraph.nodes || [];
    const rawLinks = rawGraph.links || [];

    const nodes = rawNodes.map((n) => ({
      ...n,
      id: n.id,
      label: n.label || n.id,
      type: n.type || "other",
    }));

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const edgesByNode = new Map();
    for (const n of nodes) edgesByNode.set(n.id, []);

    for (const e of rawLinks) {
      const src = typeof e.source === "object" ? e.source.id : e.source;
      const tgt = typeof e.target === "object" ? e.target.id : e.target;
      if (!nodeById.has(src) || !nodeById.has(tgt)) continue;
      const rel = e.relation || "";
      const w = Number(e.weight || 1);
      edgesByNode.get(src).push({ other: tgt, relation: rel, weight: w, dir: "out" });
      edgesByNode.get(tgt).push({ other: src, relation: rel, weight: w, dir: "in" });
    }

    return { nodeById, edgesByNode };
  }

  function renderSummary(payload, path, guided) {
    const dayDone = payload.dayDone || {};
    const doneCount = Object.values(dayDone).filter(Boolean).length;
    const startedAt = payload.startedAt || payload.createdAt || null;
    const started = startedAt ? fmtDate(startedAt) : "";

    const topPillar = (path.pillars || [])[0]?.label || "Computing";
    const topTools = (path.tools || []).slice(0, 5).join(", ") || "(none)";
    const topTech = (path.technologies || []).slice(0, 5).join(", ") || "(none)";
    const bestFirst = path.best_first_step || "Ship one proof artifact this week.";
    const conf = path.confidence || { label: "—", score: 0, note: "" };

    return `
      <div><b>${escapeHtml(path.role)}</b>${path.code ? ` <span style="opacity:.75">(${escapeHtml(path.code)})</span>` : ""}</div>
      <div style="margin-top:8px">
        <b>Progress:</b> ${doneCount}/7 complete${started ? ` · started ${escapeHtml(started)}` : ""}<br/>
        <b>Confidence:</b> ${escapeHtml(conf.label)} <span style="opacity:.7">(${(Number(conf.score) * 100).toFixed(0)}%)</span><br/>
        <b>Difficulty:</b> ${escapeHtml(path.difficulty || "—")}<br/>
        <b>Time to first result:</b> ${escapeHtml(path.time_to_first_result || "—")}<br/>
        <b>Best first step:</b> ${escapeHtml(bestFirst)}
      </div>
      <div style="margin-top:8px; opacity:.85">
        <b>Pillar:</b> ${escapeHtml(topPillar)}<br/>
        <b>Tools:</b> ${escapeHtml(topTools)}<br/>
        <b>Technologies:</b> ${escapeHtml(topTech)}
      </div>
      <div style="margin-top:8px; opacity:.78">
        This proof page is portable: it encodes sprint progress in the URL hash and regenerates the path from the public dataset.
      </div>
    `;
  }

  function renderChecklist(payload, guided) {
    const dayDone = payload.dayDone || {};
    const rows = (guided.sprint_7_days || [])
      .map((d) => {
        const checked = !!dayDone[d.day];
        const links = (d.links || [])
          .slice(0, 3)
          .map((l) => `<a class="inline" href="${l.url}" ${String(l.url || "").startsWith("http") ? 'target="_blank" rel="noreferrer"' : ""}>${escapeHtml(l.label)}</a>`)
          .join(" · ");
        return `
          <div class="sprintRow">
            <label class="sprintCheck" title="This page is a static snapshot. Track progress from the graph page.">
              <input type="checkbox" ${checked ? "checked" : ""} disabled />
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
    return `<div class="sprintWrap">${rows}</div>`;
  }

  function renderPath(path) {
    const kv = (arr, max) => (arr || []).slice(0, max).map(escapeHtml).join(", ") || "<span style=\"opacity:.75\">(none)</span>";
    const bullets = (arr, max) => {
      const xs = (arr || []).slice(0, max);
      if (!xs.length) return "<span style=\"opacity:.75\">(none)</span>";
      return `<ul class="list">${xs.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>`;
    };
    const onetBlock = (title, items, max = 8) => {
      const xs = (items || []).slice(0, max);
      if (!xs.length) return "";
      const rows = xs.map((it) => `<li>${escapeHtml(it.name)} <span style="opacity:.7">(${Number(it.importance).toFixed(2)})</span></li>`).join("");
      return `<div class="pathH">${escapeHtml(title)}</div><ul class="list">${rows}</ul>`;
    };

    return `
      <div style="opacity:.8"><b>Formula:</b> Field → Role → Skills → Tools → Projects → Income</div>
      <div class="pathH">Fields</div>
      <div>${kv(path.fields, 10)}</div>
      <div class="pathH">Pillars</div>
      <div>${(path.pillars || []).slice(0, 5).map((p) => `• ${escapeHtml(p.label)} <span style=\"opacity:.7\">(${Number(p.score).toFixed(1)})</span>`).join("<br/>") || "<span style=\"opacity:.75\">(none)</span>"}</div>
      <div class="pathH">Tools</div>
      ${bullets(path.tools, 10)}
      <div class="pathH">Technologies</div>
      ${bullets(path.technologies, 10)}
      ${onetBlock("O*NET Skills (importance)", path.onet_skills, 8)}
      ${onetBlock("O*NET Knowledge (importance)", path.onet_knowledge, 8)}
      ${onetBlock("O*NET Abilities (importance)", path.onet_abilities, 6)}
      <div class="pathH">Projects (suggested)</div>
      ${bullets(path.projects, 6)}
      <div class="pathH">Income paths</div>
      ${bullets(path.income_paths, 6)}
      <div class="pathH">Provenance</div>
      <div style="opacity:.78">${escapeHtml(path.provenance?.scope || "")}<br/>${escapeHtml(path.provenance?.note || "")}<br/><i>Not career advice.</i></div>
    `;
  }

  function renderRoadmap(guided) {
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
    return `<details class="roadmapDetails" open><summary class="roadmapSummary">30‑Day Progression (structured)</summary><div style="margin-top:10px">${weeks.join("")}</div></details>`;
  }

  function buildGraphUrl(occId) {
    const u = new URL("graph.html", location.href);
    u.hash = `path=${encodeURIComponent(occId)}&node=${encodeURIComponent(occId)}`;
    return u.toString();
  }

  function buildMarkdown(path, payload, guided, shareUrl) {
    const pg = window.PathGen;
    const base = pg && typeof pg.toMarkdown === "function" ? pg.toMarkdown(path) : `# Career Path: ${path.role}\n`;
    const dayDone = payload.dayDone || {};
    const doneCount = Object.values(dayDone).filter(Boolean).length;
    const startedAt = payload.startedAt || payload.createdAt || null;

    const lines = [];
    lines.push(base.trimEnd());
    lines.push("");
    lines.push("## Sprint Proof (7 days)");
    lines.push(`- Role: ${path.role}${path.code ? ` (${path.code})` : ""}`);
    lines.push(`- Started: ${startedAt ? fmtDate(startedAt) : "—"}`);
    lines.push(`- Progress: ${doneCount}/7 complete`);
    lines.push(`- Proof page: ${shareUrl}`);
    lines.push("");
    lines.push("### Checklist");
    for (const d of guided.sprint_7_days || []) {
      const mark = dayDone[d.day] ? "x" : " ";
      lines.push(`- [${mark}] Day ${d.day}: ${d.title} — ${d.action} (${d.output})`);
    }
    lines.push("");
    return lines.join("\n");
  }

  async function main() {
    const parsed = parseHash();
    if (parsed.kind === "empty") {
      titleEl.textContent = "No sprint data in URL.";
      subEl.textContent = "Open a sprint from the graph page to create a shareable proof link.";
      summaryEl.innerHTML = `Go to <a class="inline" href="./graph.html">graph.html</a>, generate a path for an occupation, then click “Open Sprint Page”.`;
      checklistEl.innerHTML = "";
      pathEl.innerHTML = "";
      roadmapEl.innerHTML = "";
      return;
    }

    let payload = null;
    if (parsed.kind === "encoded") {
      const sc = window.SprintCodec;
      payload = sc && typeof sc.decode === "function" ? sc.decode(parsed.value) : null;
    } else if (parsed.kind === "occ") {
      payload = { v: 1, occId: parsed.value, dayDone: {}, createdAt: new Date().toISOString() };
    }

    if (!payload || !payload.occId) {
      titleEl.textContent = "Invalid sprint link.";
      subEl.textContent = "The sprint data in the URL hash could not be decoded.";
      summaryEl.innerHTML = `Try generating a new sprint link from <a class="inline" href="./graph.html">graph.html</a>.`;
      checklistEl.innerHTML = "";
      pathEl.innerHTML = "";
      roadmapEl.innerHTML = "";
      return;
    }

    // Load datasets
    const [rawGraph, onetIndex] = await Promise.all([
      fetchJson("assets/graph/graph.json"),
      fetchJson("assets/graph/paths_index.json").catch(() => null),
    ]);

    const pg = window.PathGen;
    if (!pg || typeof pg.generateCareerPath !== "function") {
      throw new Error("PathGen not available.");
    }
    if (onetIndex && typeof pg.setOnetIndex === "function") {
      pg.setOnetIndex(onetIndex);
    } else if (typeof pg.loadOnetIndex === "function") {
      // Best-effort background load
      pg.loadOnetIndex("assets/graph/paths_index.json");
    }

    const ctx = buildCtx(rawGraph);
    const path = pg.generateCareerPath(payload.occId, ctx);
    if (!path) {
      titleEl.textContent = "Occupation not found.";
      subEl.textContent = "This sprint link references an occupation that is not present in this web build.";
      summaryEl.innerHTML = `Open the graph to pick a valid occupation: <a class="inline" href="./graph.html">graph.html</a>`;
      checklistEl.innerHTML = "";
      pathEl.innerHTML = "";
      roadmapEl.innerHTML = "";
      return;
    }

    const guided = typeof pg.buildGuidedModePlan === "function" ? pg.buildGuidedModePlan(path) : { sprint_7_days: [], roadmap_30_days: [] };

    const shareUrl = location.href;
    titleEl.textContent = `Sprint: ${path.role}`;
    subEl.textContent = `Portable proof artifact · ${escapeHtml(payload.occId)} · shareable link`;

    summaryEl.innerHTML = renderSummary(payload, path, guided);
    checklistEl.innerHTML = renderChecklist(payload, guided);
    pathEl.innerHTML = renderPath(path);
    roadmapEl.innerHTML = renderRoadmap(guided);

    if (openGraphEl) openGraphEl.href = buildGraphUrl(payload.occId);

    copyLinkEl?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        subEl.textContent = "Copied page link to clipboard.";
      } catch (_) {
        subEl.textContent = "Copy failed (browser permissions).";
      }
    });

    copyDiscordEl?.addEventListener("click", async () => {
      if (!pg || typeof pg.buildDiscordUpdate !== "function") return;
      const msg = pg.buildDiscordUpdate({
        path,
        guided,
        dayDone: payload.dayDone || {},
        shareUrl,
      });
      try {
        await navigator.clipboard.writeText(msg);
        subEl.textContent = "Copied Discord update.";
      } catch (_) {
        subEl.textContent = "Copy failed (browser permissions).";
      }
    });

    downloadMdEl?.addEventListener("click", () => {
      const md = buildMarkdown(path, payload, guided, shareUrl);
      const safe = String(payload.occId).replaceAll(":", "_");
      const blob = new Blob([md], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `sprint_${safe}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  main().catch((err) => {
    if (titleEl) titleEl.textContent = "Failed to load sprint.";
    if (subEl) subEl.textContent = String(err);
    if (summaryEl) summaryEl.innerHTML = "Try opening a new sprint link from graph.html.";
  });
})();

