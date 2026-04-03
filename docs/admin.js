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
  const liveLastSync = document.getElementById("liveLastSync");

  const activitiesList = document.getElementById("activitiesList");
  const intentsList = document.getElementById("intentsList");
  const contactsList = document.getElementById("contactsList");
  const proofSignalsList = document.getElementById("proofSignalsList");

  const KEY_BASE = "techCommunityAdminApiBase";
  const KEY_TOKEN = "techCommunityAdminToken";
  const DEFAULT_BASE = "/api";

  function setStatus(text, ok) {
    if (statusText) statusText.textContent = text;
    if (statusDot) statusDot.classList.toggle("is-on", Boolean(ok));
  }

  function getBase() {
    return (apiBaseEl && apiBaseEl.value.trim()) || sessionStorage.getItem(KEY_BASE) || DEFAULT_BASE;
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
    const candidates = [getBase(), "/api", "/.netlify/functions"]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .map((value, index, arr) => value.replace(/\/+$/, ""))
      .filter((value, index, arr) => arr.indexOf(value) === index);

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

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
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
      if (liveActiveProjects) liveActiveProjects.textContent = stats.activeProjects ?? "—";
      if (liveOpenRoles) liveOpenRoles.textContent = stats.openRoles ?? "—";
      if (liveCurrentSprint) liveCurrentSprint.textContent = stats.currentSprint ?? "—";
      if (liveIdeasInVoting) liveIdeasInVoting.textContent = stats.ideasInVoting ?? "—";
      if (liveProofCount) liveProofCount.textContent = stats.proofCount ?? "—";
      if (liveLastSync) liveLastSync.textContent = stats.lastSync ? new Date(stats.lastSync).toLocaleString() : "—";

      if (snapshotText) {
        snapshotText.textContent =
          `Loaded ${stats.activeProjects ?? 0} active projects, ${stats.openRoles ?? 0} open roles, ` +
          `${stats.proofCount ?? 0} proof signals, and recent user activity from the API layer.`;
      }

      renderItems(activitiesList, activitiesPayload.activities || dashboard.activities, renderActivity, "No recent activities");
      renderItems(intentsList, activitiesPayload.intents || dashboard.intents, renderIntent, "No recent intents");
      renderItems(contactsList, activitiesPayload.contacts || dashboard.contacts, renderContact, "No recent contacts");
      renderItems(proofSignalsList, dashboard.proofFeed || [], renderProof, "No proof signals");

      setStatus("Connected. Admin data loaded successfully.", true);
    } catch (err) {
      setStatus(`Connection failed. ${err.message || ""}`.trim(), false);
      if (snapshotText) {
        snapshotText.textContent = "Could not load admin data. Check the API base path, token, and deployed functions.";
      }
    }
  }

  if (apiBaseEl) apiBaseEl.value = sessionStorage.getItem(KEY_BASE) || DEFAULT_BASE;
  if (tokenEl) tokenEl.value = sessionStorage.getItem(KEY_TOKEN) || "";

  if (connectBtn) connectBtn.addEventListener("click", loadDashboard);
  if (refreshBtn) refreshBtn.addEventListener("click", loadDashboard);
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearConfig();
      setStatus("Disconnected. Enter admin token to load data.", false);
      if (snapshotText) snapshotText.textContent = "No data loaded yet. Connect with a token and the dashboard will populate automatically.";
    });
  }

  if (sessionStorage.getItem(KEY_TOKEN)) {
    loadDashboard();
  }
})();
