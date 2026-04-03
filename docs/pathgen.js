(function () {
  "use strict";

  /**
   * @typedef {{name:string, importance:number}} OnetImportanceItem
   */

  /**
   * @typedef {Object} CareerPath
   * @property {string} role
   * @property {string|null} code
   * @property {string[]} fields
   * @property {{label:string, weight:number}[]} industries
   * @property {{label:string, score:number, id:string}[]} pillars
   * @property {string[]} technologies
   * @property {string[]} tools
   * @property {string[]} related_roles
   * @property {OnetImportanceItem[]} onet_skills
   * @property {OnetImportanceItem[]} onet_knowledge
   * @property {OnetImportanceItem[]} onet_abilities
   * @property {string[]} skills
   * @property {string[]} projects
   * @property {string[]} income_paths
   * @property {{week:number, title:string, bullets:string[]}[]} plan_4_weeks
   * @property {string} best_first_step
   * @property {string} difficulty
   * @property {string} time_to_first_result
   * @property {{score:number, label:string, note:string}} confidence
   * @property {string[]} next_actions
   * @property {{scope:string, note:string}} provenance
   */

  const PILLAR_SKILLS = {
    "pill:data": [
      "Data literacy (tables, metrics, definitions)",
      "SQL fundamentals (select, joins, group by)",
      "Dashboard design (KPIs, charts, narrative)",
      "ETL basics (extract → clean → load)",
    ],
    "pill:ai": [
      "Prompting + evaluation (what works / fails)",
      "Basic ML concepts (classification, regression)",
      "Data prep + labeling mindset",
      "Safety + privacy awareness",
    ],
    "pill:software": [
      "APIs (requests, auth, error handling)",
      "Version control (Git, pull requests)",
      "Building small services (CRUD, validation)",
      "Debugging + testing habits",
    ],
    "pill:cloud": [
      "Deployment basics (hosting, env vars)",
      "Containers (Docker basics)",
      "Observability (logs, metrics)",
      "Infrastructure mindset (reliability, cost)",
    ],
    "pill:security": [
      "Access control basics (roles, least privilege)",
      "Secure defaults (secrets, updates)",
      "Threat thinking (what can go wrong?)",
      "Basic monitoring + incident response",
    ],
    "pill:networks": [
      "Internet basics (DNS, HTTP, TCP/IP)",
      "Networking mindset (latency, failures)",
      "Debugging connectivity (tools + logs)",
    ],
    "pill:automation": [
      "Workflow mapping (inputs → steps → outputs)",
      "Automation design (triggers, retries, QA)",
      "Integration thinking (APIs, data flow)",
    ],
    "pill:computing": [
      "Systems thinking",
      "Documentation as leverage",
      "Problem decomposition",
    ],
  };

  const INDUSTRY_TO_FIELDS = [
    { match: "Manufacturing", fields: ["Manufacturing", "Operations", "Industrial Systems"] },
    { match: "Construction", fields: ["Construction", "Project Systems", "Infrastructure"] },
    { match: "Financial", fields: ["Finance", "Business Systems", "Risk"] },
    { match: "Retail", fields: ["Retail", "Customer Systems", "Logistics"] },
    { match: "Wholesale", fields: ["Supply Chain", "Distribution", "Operations"] },
    { match: "Transportation", fields: ["Transportation", "Logistics", "Infrastructure"] },
    { match: "Public Administration", fields: ["Public Systems", "Policy", "Civic Infrastructure"] },
    { match: "Agriculture", fields: ["Agriculture", "Food Systems", "Biology"] },
    { match: "Services", fields: ["Services", "Operations", "Business"] },
    { match: "Mining", fields: ["Energy", "Extraction", "Industrial Safety"] },
  ];

  const FRIENDLY_FIELDS = {
    "Public Systems": "Government & Public Services",
    "Civic Infrastructure": "Cities & Public Infrastructure",
    "Project Systems": "Projects & Coordination",
    "Industrial Systems": "Industry & Operations",
    "Customer Systems": "Customers & Markets",
  };

  /** @type {Record<string, any>|null} */
  let ONET_INDEX = null;
  let ONET_INDEX_LOADING = false;

  /**
   * Allows callers (e.g., sprint proof page) to inject the O*NET index immediately,
   * avoiding an async race where the first generated path misses the enrichment layer.
   * @param {Record<string, any>|null} index
   */
  function setOnetIndex(index) {
    if (index && typeof index === "object") ONET_INDEX = index;
  }

  function loadOnetIndex(url) {
    if (ONET_INDEX || ONET_INDEX_LOADING) return;
    ONET_INDEX_LOADING = true;
    fetch(url, { cache: "force-cache" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && typeof j === "object") ONET_INDEX = j;
      })
      .catch(() => {})
      .finally(() => {
        ONET_INDEX_LOADING = false;
      });
  }

  function uniq(arr) {
    const out = [];
    const seen = new Set();
    for (const x of arr) {
      const v = String(x || "").trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
    return out;
  }

  function topN(items, n) {
    return items.slice(0, Math.max(0, n));
  }

  function normalizeNum(x, def = 1) {
    const v = Number(x);
    return Number.isFinite(v) ? v : def;
  }

  function buildFieldsFromIndustries(industryLabels) {
    const fields = [];
    for (const lbl of industryLabels) {
      for (const row of INDUSTRY_TO_FIELDS) {
        if (lbl.includes(row.match)) fields.push(...row.fields);
      }
    }
    if (!fields.length) fields.push("Modern Work", "Systems", "Technology");
    const norm = uniq(fields).map((f) => FRIENDLY_FIELDS[f] || f);
    return uniq(norm);
  }

  function pillarDisplayOrder(p) {
    const ord = {
      "pill:data": 10,
      "pill:ai": 11,
      "pill:software": 12,
      "pill:cloud": 13,
      "pill:security": 14,
      "pill:networks": 15,
      "pill:automation": 16,
      "pill:computing": 99,
    };
    return ord[p] ?? 50;
  }

  /**
   * @param {string} occId
   * @param {{nodeById: Map<string, any>, edgesByNode: Map<string, any[]>}} ctx
   * @returns {CareerPath|null}
   */
  function generateCareerPath(occId, ctx) {
    const n = ctx.nodeById.get(occId);
    if (!n || n.type !== "occupation") return null;

    const edges = ctx.edgesByNode.get(occId) || [];
    const industries = [];
    const tech = [];
    const tools = [];
    const related = [];
    const pillarScores = new Map();
    let evidenceEdges = 0;

    for (const e of edges) {
      const other = ctx.nodeById.get(e.other);
      if (!other) continue;
      evidenceEdges++;

      if (e.relation === "works_in_industry" && other.type === "industry_division") {
        industries.push({ label: other.label || other.id, weight: normalizeNum(e.weight, 0) });
      }

      if (e.relation === "uses_technology" && other.type === "technology") {
        tech.push({ label: other.label || other.id, score: normalizeNum(e.weight, 1) });
      }

      if (e.relation === "uses_tool" && other.type === "tool") {
        tools.push({ label: other.label || other.id, score: normalizeNum(e.weight, 1) });
      }

      if (e.relation === "related_occupation" && other.type === "occupation") {
        related.push(other.label || other.id);
      }

      if (e.relation === "digitized_by" && other.type === "computing_pillar") {
        pillarScores.set(other.id, (pillarScores.get(other.id) || 0) + normalizeNum(e.weight, 1));
      }
    }

    industries.sort((a, b) => b.weight - a.weight);
    tech.sort((a, b) => b.score - a.score);
    tools.sort((a, b) => b.score - a.score);

    // If we somehow got no pillars (rare), anchor to computing.
    if (pillarScores.size === 0) pillarScores.set("pill:computing", 1);

    const pillars = Array.from(pillarScores.entries())
      .map(([id, score]) => ({ id, score, label: (ctx.nodeById.get(id)?.label || id) }))
      .sort((a, b) => b.score - a.score || pillarDisplayOrder(a.id) - pillarDisplayOrder(b.id))
      .slice(0, 4);

    const industryLabels = industries.map((x) => x.label);
    const fields = buildFieldsFromIndustries(industryLabels);

    // O*NET importance layers (if available)
    /** @type {OnetImportanceItem[]} */
    const onet_skills = [];
    /** @type {OnetImportanceItem[]} */
    const onet_knowledge = [];
    /** @type {OnetImportanceItem[]} */
    const onet_abilities = [];
    if (ONET_INDEX && ONET_INDEX[occId]) {
      const o = ONET_INDEX[occId] || {};
      if (Array.isArray(o.skills)) onet_skills.push(...o.skills.slice(0, 12));
      if (Array.isArray(o.knowledge)) onet_knowledge.push(...o.knowledge.slice(0, 10));
      if (Array.isArray(o.abilities)) onet_abilities.push(...o.abilities.slice(0, 8));
    }

    // Skills = pillar skills + universal skills
    const skills = [];
    skills.push("Systems thinking (inputs → process → outputs)");
    skills.push("Clear documentation (one-page explanations)");
    skills.push("Basic data literacy (metrics, quality, definitions)");
    for (const p of pillars) {
      const s = PILLAR_SKILLS[p.id] || [];
      skills.push(...s);
    }
    // Merge in top O*NET skills/knowledge/abilities (when present) as human-readable items
    for (const it of onet_skills.slice(0, 6)) skills.push(`O*NET skill: ${it.name}`);
    for (const it of onet_knowledge.slice(0, 4)) skills.push(`O*NET knowledge: ${it.name}`);
    for (const it of onet_abilities.slice(0, 3)) skills.push(`O*NET ability: ${it.name}`);

    // Projects based on pillars + tools/tech presence
    const projects = [];
    projects.push("Build a dashboard that answers: “What are the top 3 drivers of X?” (use 3–5 KPIs).");
    if (pillars.some((p) => p.id === "pill:data")) projects.push("Create a small dataset → clean it → produce a report.");
    if (pillars.some((p) => p.id === "pill:ai")) projects.push("Build an AI-assisted workflow + write evaluation notes (what works/fails).");
    if (pillars.some((p) => p.id === "pill:software")) projects.push("Build a small API/service with a README + diagram.");
    if (pillars.some((p) => p.id === "pill:cloud")) projects.push("Deploy a small app + add logging/monitoring notes.");
    if (pillars.some((p) => p.id === "pill:automation")) projects.push("Automate a weekly process (trigger → action → QA).");
    if (topN(tech, 1).length) projects.push(`Use one tool/tech from the graph: ${topN(tech, 1)[0].label}.`);
    if (industries[0]?.label) projects.push(`Write a one-page “system brief” for ${industries[0].label}: inputs → process → outputs → risks.`);

    const income_paths = uniq([
      "Freelance micro-projects",
      "Entry role / internship",
      "Consulting (junior scope)",
      "Product builder (small tool)",
    ]);

    // Confidence, difficulty, time-to-first-result
    const hasOnet = onet_skills.length + onet_knowledge.length + onet_abilities.length > 0;
    const edgeScore = Math.min(1, evidenceEdges / 22);
    const dataScore = (hasOnet ? 0.5 : 0.2) + Math.min(0.5, (industries.length + tech.length + tools.length + related.length) / 40);
    const confidenceScore = Math.max(0, Math.min(1, 0.55 * edgeScore + 0.45 * dataScore));
    const confidenceLabel = confidenceScore >= 0.72 ? "High" : confidenceScore >= 0.42 ? "Medium" : "Low";

    const difficulty =
      pillars.length >= 4 || (tech.length + tools.length >= 18) ? "Intermediate" : "Beginner";
    const time_to_first_result = difficulty === "Beginner" ? "2–4 weeks" : "3–6 weeks";

    const best_first_step =
      pillars[0]?.id === "pill:data"
        ? "Start here: ship a small KPI dashboard this week (3–5 metrics) + a 1-page write-up."
        : pillars[0]?.id === "pill:ai"
        ? "Start here: ship a small AI workflow + evaluation notes (5–10 test cases)."
        : pillars[0]?.id === "pill:software"
        ? "Start here: ship a tiny API/service + diagram + README."
        : "Start here: pick one tool from the graph and build a small proof artifact this week.";

    // 4-week plan
    const plan_4_weeks = [
      {
        week: 1,
        title: "Clarity + setup",
        bullets: uniq([
          "Pick 1 pillar to focus on.",
          "Pick 1 starter project (small).",
          "Collect example data (or choose a public dataset).",
          "Write a 1-page problem statement.",
        ]),
      },
      {
        week: 2,
        title: "Core skills + first draft",
        bullets: uniq([
          "Learn only what your project needs (avoid course-binging).",
          "Build the first working draft (ugly is fine).",
          "Add a simple diagram of the system.",
        ]),
      },
      {
        week: 3,
        title: "Iteration + proof",
        bullets: uniq([
          "Improve reliability (edge cases, validation).",
          "Add 2–3 screenshots or a short demo.",
          "Write the README as if you’re teaching a beginner.",
        ]),
      },
      {
        week: 4,
        title: "Publish + opportunity",
        bullets: uniq([
          "Publish the project and share it in Discord.",
          "Create a portfolio page / proof post linking to the demo.",
          "Identify 3 adjacent roles and one next project.",
        ]),
      },
    ];

    const next_actions = uniq([
      "Open `docs/START.html` if you’re not sure where to begin.",
      "Use `projects/tracks/` to pick a project type.",
      "Ship one proof artifact this week (demo/diagram/write-up).",
    ]);

    return {
      role: n.label || occId,
      code: n.code || null,
      fields,
      industries: topN(industries, 5),
      pillars,
      technologies: topN(tech.map((x) => x.label), 10),
      tools: topN(tools.map((x) => x.label), 10),
      related_roles: topN(uniq(related), 10),
      onet_skills: topN(onet_skills, 12),
      onet_knowledge: topN(onet_knowledge, 10),
      onet_abilities: topN(onet_abilities, 8),
      skills: topN(uniq(skills), 14),
      projects: topN(uniq(projects), 8),
      income_paths,
      plan_4_weeks,
      best_first_step,
      difficulty,
      time_to_first_result,
      confidence: {
        score: confidenceScore,
        label: confidenceLabel,
        note: hasOnet
          ? "Backed by O*NET importance + graph neighborhood."
          : "Inferred from graph neighborhood + templates (O*NET layer still loading or unavailable).",
      },
      next_actions,
      provenance: {
        scope: "Web build (O*NET occupations + industries + tools/tech + related occupations + computing pillars).",
        note: "Skills/projects/plan are generated suggestions from O*NET importance (when available), graph neighborhood, and templates.",
      },
    };
  }

  /**
   * @param {CareerPath} path
   * @returns {string}
   */
  function toMarkdown(path) {
    const lines = [];
    lines.push(`# Career Path: ${path.role}`);
    if (path.code) lines.push(`O*NET Code: \`${path.code}\``);
    lines.push("");
    lines.push(`**Formula:** Field → Role → Skills → Tools → Projects → Income`);
    lines.push("");
    lines.push(`**Confidence:** ${path.confidence.label} (${(path.confidence.score * 100).toFixed(0)}%)`);
    lines.push(`**Difficulty:** ${path.difficulty}`);
    lines.push(`**Time to first result:** ${path.time_to_first_result}`);
    lines.push("");
    lines.push(`**Best first step:** ${path.best_first_step}`);
    lines.push("");

    lines.push(`## Related Fields`);
    lines.push(path.fields.map((x) => `- ${x}`).join("\n") || "- (none)");
    lines.push("");

    lines.push(`## Computing Pillars`);
    lines.push(
      path.pillars.map((p) => `- ${p.label} (${p.score.toFixed(1)})`).join("\n") || "- (none)"
    );
    lines.push("");

    lines.push(`## Industries`);
    lines.push(path.industries.map((x) => `- ${x.label} (${x.weight.toFixed(1)}%)`).join("\n") || "- (none)");
    lines.push("");

    lines.push(`## Technologies`);
    lines.push(path.technologies.map((x) => `- ${x}`).join("\n") || "- (none)");
    lines.push("");

    lines.push(`## Tools`);
    lines.push(path.tools.map((x) => `- ${x}`).join("\n") || "- (none)");
    lines.push("");

    if ((path.onet_skills || []).length) {
      lines.push(`## O*NET Skills (Importance)`);
      lines.push(path.onet_skills.map((x) => `- ${x.name} (${x.importance.toFixed(2)})`).join("\n"));
      lines.push("");
    }
    if ((path.onet_knowledge || []).length) {
      lines.push(`## O*NET Knowledge (Importance)`);
      lines.push(path.onet_knowledge.map((x) => `- ${x.name} (${x.importance.toFixed(2)})`).join("\n"));
      lines.push("");
    }
    if ((path.onet_abilities || []).length) {
      lines.push(`## O*NET Abilities (Importance)`);
      lines.push(path.onet_abilities.map((x) => `- ${x.name} (${x.importance.toFixed(2)})`).join("\n"));
      lines.push("");
    }

    lines.push(`## Skills (Suggested)`);
    lines.push(path.skills.map((x) => `- ${x}`).join("\n") || "- (none)");
    lines.push("");

    lines.push(`## Projects (Suggested)`);
    lines.push(path.projects.map((x) => `- ${x}`).join("\n") || "- (none)");
    lines.push("");

    lines.push(`## Income Paths`);
    lines.push(path.income_paths.map((x) => `- ${x}`).join("\n") || "- (none)");
    lines.push("");

    lines.push(`## 4-Week Starter Plan`);
    for (const w of path.plan_4_weeks) {
      lines.push(`### Week ${w.week}: ${w.title}`);
      lines.push(w.bullets.map((b) => `- ${b}`).join("\n"));
      lines.push("");
    }

    lines.push(`## Next Actions`);
    lines.push(path.next_actions.map((x) => `- ${x}`).join("\n") || "- (none)");
    lines.push("");

    lines.push(`## Provenance`);
    lines.push(`- Scope: ${path.provenance.scope}`);
    lines.push(`- Note: ${path.provenance.note}`);
    lines.push("");
    lines.push(`*Not career advice. Verify decisions with multiple sources.*`);
    lines.push("");

    return lines.join("\n");
  }

  /**
   * @typedef {{label:string, url:string}} SprintLink
   * @typedef {{day:number, title:string, action:string, output:string, links:SprintLink[]}} SprintDay
   * @typedef {{sprint_7_days:SprintDay[], roadmap_30_days:SprintDay[]}} GuidedModePlan
   */

  function _link(label, url) {
    return { label, url };
  }

  /**
   * @param {CareerPath} path
   * @returns {GuidedModePlan}
   */
  function buildGuidedModePlan(path) {
    const topTool = (path.tools || [])[0] || null;
    const topTech = (path.technologies || [])[0] || null;
    const topProject = (path.projects || [])[0] || "Ship a small proof artifact (demo + write-up).";

    const guideBase =
      "https://github.com/eruditewbt/Tech_Community_by_EruditeWBT/blob/main/community_guides/";
    const tracksBase =
      "https://github.com/eruditewbt/Tech_Community_by_EruditeWBT/tree/main/projects/tracks";
    const templatesBase =
      "https://github.com/eruditewbt/Tech_Community_by_EruditeWBT/tree/main/templates";

    const commonLinks = [
      _link("Learn", "./learn.html"),
      _link("Join", "./join.html"),
      _link("How to use the graph", guideBase + "HOW_TO_USE_THE_GRAPH.md"),
      _link("Weekly system", guideBase + "WEEKLY_SYSTEM.md"),
      _link("Project tracks", tracksBase),
      _link("Templates", templatesBase),
    ];

    const sprint_7_days = [
      {
        day: 1,
        title: "Understand the problem",
        action: "Write a 1-page problem statement (what, why, who, success metric).",
        output: "A short markdown note.",
        links: [_link("START", "./START.html"), ...commonLinks],
      },
      {
        day: 2,
        title: "Set up tools",
        action: `Install/test your basics${topTool ? ` (start with: ${topTool})` : ""}${topTech ? ` and ${topTech}` : ""}.`,
        output: "Working environment + hello-world proof (screenshot).",
        links: commonLinks,
      },
      {
        day: 3,
        title: "Build the first draft",
        action: topProject,
        output: "First working version (ugly is fine).",
        links: [_link("Project pitch template", templatesBase + "/PROJECT_PITCH_TEMPLATE.md"), ...commonLinks],
      },
      {
        day: 4,
        title: "Stabilize",
        action: "Fix the biggest bugs, add basic validation, and make output repeatable.",
        output: "Stable version.",
        links: commonLinks,
      },
      {
        day: 5,
        title: "Add clarity",
        action: "Create a simple diagram + write a README that teaches a beginner.",
        output: "Documented project (diagram + README).",
        links: [_link("Project review template", templatesBase + "/PROJECT_REVIEW_TEMPLATE.md"), ...commonLinks],
      },
      {
        day: 6,
        title: "Polish",
        action: "Improve usability/output. Add 2–3 screenshots or a short demo video.",
        output: "Presentable demo.",
        links: commonLinks,
      },
      {
        day: 7,
        title: "Publish + share",
        action: "Publish and share: what you built, what you learned, what you’ll do next.",
        output: "Public proof link.",
        links: [_link("Discord", "https://discord.gg/8e4bQNknA"), ...commonLinks],
      },
    ];

    // 30-day plan = 4-week structure with daily actions (kept light + repeatable).
    const roadmap_30_days = [];
    const days = 30;
    for (let d = 1; d <= days; d++) {
      const week = Math.floor((d - 1) / 7) + 1;
      const dayInWeek = ((d - 1) % 7) + 1;

      let title = "";
      let action = "";
      let output = "";
      /** @type {SprintLink[]} */
      let links = [...commonLinks];

      if (week === 1) {
        title = dayInWeek <= 2 ? "Clarity + setup" : "First draft";
        action =
          dayInWeek === 1
            ? "Pick 1 pillar, 1 project track, and write a 1-page problem statement."
            : dayInWeek === 2
            ? `Set up tools + data. Confirm you can produce one output end-to-end.${topTool ? ` (Try: ${topTool})` : ""}`
            : dayInWeek === 3
            ? topProject
            : dayInWeek === 4
            ? "Turn the draft into a repeatable workflow (steps, inputs, outputs)."
            : dayInWeek === 5
            ? "Add a diagram of the system (boxes + arrows is enough)."
            : dayInWeek === 6
            ? "Write README v1: what it does, how to run it, demo proof."
            : "Share a progress update (what’s done / blocked / next).";
        output =
          dayInWeek <= 2
            ? "Setup complete + notes."
            : dayInWeek <= 4
            ? "Working draft."
            : dayInWeek === 5
            ? "Diagram."
            : dayInWeek === 6
            ? "README v1."
            : "Progress post.";
      } else if (week === 2) {
        title = "Iteration + reliability";
        action =
          dayInWeek === 1
            ? "Identify top 3 failure cases and handle them."
            : dayInWeek === 2
            ? "Improve data quality and add sanity checks."
            : dayInWeek === 3
            ? "Refactor for clarity (functions/modules)."
            : dayInWeek === 4
            ? "Add a basic test or validation checklist."
            : dayInWeek === 5
            ? "Add screenshots + demo recording."
            : dayInWeek === 6
            ? "Write README v2: add troubleshooting + limitations."
            : "Share a week-2 update + ask one focused question.";
        output =
          dayInWeek <= 4 ? "More reliable system." : dayInWeek <= 6 ? "Better proof + docs." : "Community feedback.";
      } else if (week === 3) {
        title = "Portfolio + legibility";
        action =
          dayInWeek === 1
            ? "Write a 1-page case study: problem → system → result."
            : dayInWeek === 2
            ? "Create a clean project page (README + diagrams + links)."
            : dayInWeek === 3
            ? "Find 3 adjacent roles in the graph and note what differs."
            : dayInWeek === 4
            ? "Add one improvement based on adjacency (tool, tech, metric)."
            : dayInWeek === 5
            ? "Create a short public explanation (post/short video)."
            : dayInWeek === 6
            ? "Prepare a 'pitch': what you can do + proof link."
            : "Share the pitch in Discord and request review.";
        output = dayInWeek <= 2 ? "Portfolio asset." : dayInWeek <= 5 ? "Visibility asset." : "Pitch + feedback.";
      } else {
        title = "Opportunity + next sprint";
        action =
          dayInWeek === 1
            ? "Choose a monetization route (micro-gig, internship, role, consulting)."
            : dayInWeek === 2
            ? "Draft 5 outreach messages (client/employer/mentor)."
            : dayInWeek === 3
            ? "Apply/ship: send 2–3 messages + share proof."
            : dayInWeek === 4
            ? "Upgrade the project with one measurable improvement."
            : dayInWeek === 5
            ? "Write a “what I learned” post (lessons + next steps)."
            : dayInWeek === 6
            ? "Pick the next sprint project based on feedback."
            : "Start sprint #2 (repeat the loop).";
        output = dayInWeek <= 3 ? "Outreach attempts." : dayInWeek <= 6 ? "Improved proof." : "Next sprint started.";
        links = [_link("From skills to income", guideBase + "FROM_SKILLS_TO_INCOME.md"), ...links];
      }

      roadmap_30_days.push({ day: d, title, action, output, links });
    }

    return { sprint_7_days, roadmap_30_days };
  }

  /**
   * @param {{path: CareerPath, guided: GuidedModePlan, dayDone: Record<number, boolean>, shareUrl: string}} params
   * @returns {string}
   */
  function buildDiscordUpdate(params) {
    const role = params.path.role;
    const doneCount = Object.values(params.dayDone || {}).filter(Boolean).length;
    const nextDay = (() => {
      for (const d of params.guided.sprint_7_days) {
        if (!params.dayDone[d.day]) return d;
      }
      return null;
    })();

    const topPillar = (params.path.pillars || [])[0]?.label || "Computing";
    const firstStep = params.path.best_first_step || "Ship one proof artifact this week.";

    const lines = [];
    lines.push(`**Sprint Update — ${role}**`);
    lines.push(`Pillar: **${topPillar}**`);
    lines.push(`Progress: **${doneCount}/7 days**`);
    lines.push(`Best first step: ${firstStep}`);
    if (nextDay) {
      lines.push(`Next: **Day ${nextDay.day} — ${nextDay.title}**`);
      lines.push(nextDay.action);
    }
    lines.push(`Share: ${params.shareUrl}`);
    return lines.join("\n");
  }

  window.PathGen = {
    setOnetIndex,
    loadOnetIndex,
    generateCareerPath,
    toMarkdown,
    buildGuidedModePlan,
    buildDiscordUpdate,
  };
})();
