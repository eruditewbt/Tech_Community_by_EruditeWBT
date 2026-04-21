(function () {
  const apiBaseEl = document.getElementById("apiBase");
  const tokenEl = document.getElementById("adminToken");
  const connectBtn = document.getElementById("connectBtn");
  const refreshBtn = document.getElementById("refreshBtn");
  const clearBtn = document.getElementById("clearBtn");
  const statusDot = document.getElementById("adminStatusDot");
  const statusText = document.getElementById("adminStatus");
  const snapshotText = document.getElementById("snapshotText");

  const liveActiveProjects = document.getElementById("liveActiveProjects");
  const liveOpenRoles = document.getElementById("liveOpenRoles");
  const liveCurrentSprint = document.getElementById("liveCurrentSprint");
  const liveIdeasInVoting = document.getElementById("liveIdeasInVoting");
  const liveProofCount = document.getElementById("liveProofCount");
  const liveCommunityUsers = document.getElementById("liveCommunityUsers");
  const liveUserQuestions = document.getElementById("liveUserQuestions");
  const liveLastSync = document.getElementById("liveLastSync");

  const activitiesList = document.getElementById("activitiesList");
  const intentsList = document.getElementById("intentsList");
  const contactsList = document.getElementById("contactsList");
  const proofSignalsList = document.getElementById("proofSignalsList");
  const communityUsersList = document.getElementById("communityUsersList");
  const userQuestionsList = document.getElementById("userQuestionsList");

  const KEY_BASE = "techCommunityAdminApiBase";
  const KEY_TOKEN = "techCommunityAdminToken";
  const CANONICAL_API_BASE = "https://eruditewbt.netlify.app/api";
  const DEFAULT_BASE = CANONICAL_API_BASE;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(text, ok) {
    if (statusText) statusText.textContent = text;
    if (statusDot) statusDot.classList.toggle("is-on", Boolean(ok));
  }

  function getBase() {
    return (apiBaseEl && apiBaseEl.value.trim()) || sessionStorage.getItem(KEY_BASE) || DEFAULT_BASE;
  }

  function resolveApiBases() {
    const host = String(location.hostname || "").toLowerCase();
    const origin = String(location.origin || "").replace(/\/+$/, "");
    const isNetlifyHost = host.endsWith(".netlify.app");
    const localCandidates = isNetlifyHost ? [`${origin}/api`, `${origin}/.netlify/functions`] : [];
    return [getBase(), CANONICAL_API_BASE, ...localCandidates]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value) => value.replace(/\/+$/, ""))
      .filter((value, index, arr) => arr.indexOf(value) === index);
  }

  function getToken() {
    return (tokenEl && tokenEl.value.trim()) || sessionStorage.getItem(KEY_TOKEN) || "";
  }

  function saveConfig() {
    sessionStorage.setItem(KEY_BASE, getBase());
    sessionStorage.setItem(KEY_TOKEN, getToken());
  }

  function clearConfig() {
    sessionStorage.removeItem(KEY_BASE);
    sessionStorage.removeItem(KEY_TOKEN);
    if (apiBaseEl) apiBaseEl.value = DEFAULT_BASE;
    if (tokenEl) tokenEl.value = "";
  }

  async function apiFetch(path) {
    const token = getToken();
    const candidates = resolveApiBases();

    let lastError = null;
    for (const base of candidates) {
      try {
        const res = await fetch(`${base}/${path}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Admin-Token": token,
          },
          cache: "no-store",
        });
        if (res.ok || res.status === 401 || res.status === 403) {
          if (apiBaseEl) apiBaseEl.value = base;
          sessionStorage.setItem(KEY_BASE, base);
          return res;
        }
        lastError = new Error(`HTTP ${res.status}`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("API unavailable");
  }

  function renderItems(el, items, mapper, emptyLabel) {
    if (!el) return;
    if (!Array.isArray(items) || items.length === 0) {
      el.innerHTML = `
        <div class="stackitem">
          <div class="stackitem__top">
            <div class="stackitem__title">${emptyLabel}</div>
            <div class="stackitem__meta mono">empty</div>
          </div>
          <div class="stackitem__body">No records returned yet.</div>
        </div>
      `;
      return;
    }
    el.innerHTML = items.map(mapper).join("");
  }

  function renderActivity(item) {
    return `
      <div class="stackitem">
        <div class="stackitem__top">
          <div class="stackitem__title">${escapeHtml(item.event_type || item.eventType || "Activity")}</div>
          <div class="stackitem__meta mono">${escapeHtml(item.created_at || item.createdAt || "")}</div>
        </div>
        <div class="stackitem__body">
          Page: ${escapeHtml(item.page || "—")}<br/>
          Label: ${escapeHtml(item.label || "—")}<br/>
          Href: ${escapeHtml(item.href || "—")}
        </div>
      </div>
    `;
  }

  function renderIntent(item) {
    return `
      <div class="stackitem">
        <div class="stackitem__top">
          <div class="stackitem__title">${escapeHtml(item.name || "Unnamed")}</div>
          <div class="stackitem__meta mono">${escapeHtml(item.created_at || "")}</div>
        </div>
        <div class="stackitem__body">
          Field: ${escapeHtml(item.field || "—")}<br/>
          Intent: ${escapeHtml(item.intent || "—")}<br/>
          Looking for: ${escapeHtml(item.looking_for || "—")}
        </div>
      </div>
    `;
  }

  function renderContact(item) {
    return `
      <div class="stackitem">
        <div class="stackitem__top">
          <div class="stackitem__title">${escapeHtml(item.subject || "Contact message")}</div>
          <div class="stackitem__meta mono">${escapeHtml(item.created_at || "")}</div>
        </div>
        <div class="stackitem__body">
          From: ${escapeHtml(item.name || "—")} (${escapeHtml(item.email || "—")})<br/>
          ${escapeHtml(item.message || "—")}
        </div>
      </div>
    `;
  }

  function renderProof(item) {
    return `
      <div class="stackitem">
        <div class="stackitem__top">
          <div class="stackitem__title">${escapeHtml(item.title || "Proof signal")}</div>
          <div class="stackitem__meta mono">${escapeHtml(item.label || "")}</div>
        </div>
        <div class="stackitem__body">
          ${escapeHtml(item.description || "")}<br/>
          ${escapeHtml(item.meta || "")}
        </div>
      </div>
    `;
  }

  function renderCommunityUser(item) {
    const answers = Array.isArray(item.answers) ? item.answers : [];
    const questions = Array.isArray(item.questions) ? item.questions : [];
    const recentActivities = Array.isArray(item.recentActivities) ? item.recentActivities : [];
    return `
      <div class="stackitem">
        <div class="stackitem__top">
          <div class="stackitem__title">${escapeHtml(item.name || item.email || item.domain || "Community user")}</div>
          <div class="stackitem__meta mono">${escapeHtml(item.updated_at || item.created_at || "")}</div>
        </div>
        <div class="stackitem__body">
          Domain: ${escapeHtml(item.domain || "—")}<br/>
          Email: ${escapeHtml(item.email || "—")}<br/>
          Goal: ${escapeHtml(item.current_goal || "—")}<br/>
          Level: ${escapeHtml(item.skill_level || "—")}<br/>
          Repo: ${escapeHtml(item.repo_interest || "—")}<br/>
          Session: <span class="mono">${escapeHtml(item.session_id || "—")}</span><br/>
          Answers captured: ${answers.length}<br/>
          Questions asked: ${questions.length}<br/>
          Recent activity events: ${recentActivities.length}
        </div>
      </div>
    `;
  }

  function renderUserQuestion(item) {
    const latestQuestion = Array.isArray(item.questions) && item.questions.length ? item.questions[0] : null;
    if (!latestQuestion) {
      return `
        <div class="stackitem">
          <div class="stackitem__top">
            <div class="stackitem__title">${escapeHtml(item.name || item.email || "Community user")}</div>
            <div class="stackitem__meta mono">no question yet</div>
          </div>
          <div class="stackitem__body">This user has onboarding data but has not asked a free-text question yet.</div>
        </div>
      `;
    }
    return `
      <div class="stackitem">
        <div class="stackitem__top">
          <div class="stackitem__title">${escapeHtml(item.name || item.email || "Community user")}</div>
          <div class="stackitem__meta mono">${escapeHtml(latestQuestion.created_at || "")}</div>
        </div>
        <div class="stackitem__body">
          Question: ${escapeHtml(latestQuestion.question_text || "—")}<br/>
          Suggested reply: ${escapeHtml(latestQuestion.answer_summary || "—")}
        </div>
      </div>
    `;
  }

  async function loadDashboard() {
    saveConfig();
    setStatus("Connecting…", false);
    try {
      const dashboardRes = await apiFetch("admin-dashboard");
      const dashboard = await dashboardRes.json();
      if (!dashboardRes.ok || dashboard.ok === false) {
        throw new Error(dashboard.error || `Dashboard request failed (${dashboardRes.status})`);
      }

      const activitiesRes = await apiFetch("admin-activities");
      const activitiesPayload = await activitiesRes.json();
      if (!activitiesRes.ok || activitiesPayload.ok === false) {
        throw new Error(activitiesPayload.error || `Activities request failed (${activitiesRes.status})`);
      }

      const stats = dashboard.stats || {};
      const counts = stats.dbCounts || activitiesPayload.counts || {};
      if (liveActiveProjects) liveActiveProjects.textContent = stats.activeProjects ?? "—";
      if (liveOpenRoles) liveOpenRoles.textContent = stats.openRoles ?? "—";
      if (liveCurrentSprint) liveCurrentSprint.textContent = stats.currentSprint ?? "—";
      if (liveIdeasInVoting) liveIdeasInVoting.textContent = stats.ideasInVoting ?? "—";
      if (liveProofCount) liveProofCount.textContent = stats.proofCount ?? "—";
      if (liveCommunityUsers) liveCommunityUsers.textContent = counts.communityUserCount ?? "—";
      if (liveUserQuestions) liveUserQuestions.textContent = counts.userQuestionCount ?? "—";
      if (liveLastSync) liveLastSync.textContent = stats.lastSync || new Date().toISOString();

      if (snapshotText) {
        snapshotText.innerHTML = `
          Active projects: <strong>${escapeHtml(stats.activeProjects)}</strong><br/>
          Open roles: <strong>${escapeHtml(stats.openRoles)}</strong><br/>
          Current sprint: <strong>${escapeHtml(stats.currentSprint)}</strong><br/>
          Ideas in voting: <strong>${escapeHtml(stats.ideasInVoting)}</strong><br/>
          Community users: <strong>${escapeHtml(counts.communityUserCount)}</strong><br/>
          Assistant questions: <strong>${escapeHtml(counts.userQuestionCount)}</strong>
        `;
      }

      renderItems(activitiesList, activitiesPayload.activities || dashboard.activities || [], renderActivity, "No activities yet");
      renderItems(intentsList, dashboard.intents || activitiesPayload.intents || [], renderIntent, "No intents yet");
      renderItems(contactsList, dashboard.contacts || activitiesPayload.contacts || [], renderContact, "No contact messages yet");
      renderItems(proofSignalsList, dashboard.proofFeed || [], renderProof, "No proof signals yet");

      const communityUsers = dashboard.communityUsers || activitiesPayload.communityUsers || [];
      renderItems(communityUsersList, communityUsers, renderCommunityUser, "No community users yet");
      renderItems(userQuestionsList, communityUsers.filter((item) => Array.isArray(item.questions) && item.questions.length), renderUserQuestion, "No user questions yet");

      setStatus("Connected. Dashboard is live.", true);
    } catch (err) {
      setStatus(err.message || "Connection failed.", false);
    }
  }

  if (apiBaseEl) apiBaseEl.value = sessionStorage.getItem(KEY_BASE) || DEFAULT_BASE;
  if (tokenEl) tokenEl.value = sessionStorage.getItem(KEY_TOKEN) || "";

  connectBtn && connectBtn.addEventListener("click", loadDashboard);
  refreshBtn && refreshBtn.addEventListener("click", loadDashboard);
  clearBtn && clearBtn.addEventListener("click", () => {
    clearConfig();
    setStatus("Disconnected. Enter admin token to load data.", false);
  });
})();
