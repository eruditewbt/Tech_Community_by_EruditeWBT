(function () {
  const modal = document.getElementById("modal");
  const modalImg = document.getElementById("modalImg");
  const toast = document.getElementById("toast");
  const CANONICAL_API_BASE = "https://eruditewbt.netlify.app/api";
  const configuredApiBase =
    sessionStorage.getItem("tech-community-api-base") || window.TECH_COMMUNITY_API_BASE || "";
  const liveIds = {
    activeProjects: document.getElementById("liveActiveProjects"),
    openRoles: document.getElementById("liveOpenRoles"),
    currentSprint: document.getElementById("liveCurrentSprint"),
    ideasInVoting: document.getElementById("liveIdeasInVoting"),
  };
  const proofFeed = document.getElementById("proofFeed");
  const nextActivitiesFeed = document.getElementById("nextActivitiesFeed");
  const blogPostsFeed = document.getElementById("blogPostsFeed");
  const deployedProductsFeed = document.getElementById("deployedProductsFeed");
  const intentForm = document.getElementById("intentForm");
  const contactForm = document.getElementById("contactForm");
  const intentFormStatus = document.getElementById("intentFormStatus");
  const contactFormStatus = document.getElementById("contactFormStatus");
  const apiBases = resolveApiBases();

  function resolveApiBases() {
    const host = String(location.hostname || "").toLowerCase();
    const origin = String(location.origin || "").replace(/\/$/, "");
    const isNetlifyHost = host.endsWith(".netlify.app");
    const localCandidates = isNetlifyHost ? [`${origin}/api`, `${origin}/.netlify/functions`] : [];
    return [configuredApiBase, CANONICAL_API_BASE, ...localCandidates]
      .map((base) => String(base || "").trim())
      .filter(Boolean)
      .map((base) => base.replace(/\/$/, ""))
      .filter((base, index, arr) => arr.indexOf(base) === index);
  }

  function readForm(form) {
    const data = {};
    if (!form) return data;
    for (const [key, value] of new FormData(form).entries()) data[key] = String(value || "").trim();
    return data;
  }

  async function fetchFromApi(path, options) {
    let lastError = null;
    for (const base of apiBases) {
      try {
        const res = await fetch(`${base}/${path}`, options);
        if (res.ok) {
          try {
            sessionStorage.setItem("tech-community-api-base", base);
          } catch (_) {}
          return res;
        }
        lastError = new Error(`HTTP ${res.status}`);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("API unavailable");
  }

  function buildIntentFallback(payload) {
    return [
      `Name: ${payload.name || ""}`,
      `Field: ${payload.field || ""}`,
      `I want to: ${payload.intent || ""}`,
      `Skills: ${payload.skills || ""}`,
      `Looking for: ${payload.looking_for || ""}`,
    ].join("\n");
  }

  function buildContactFallback(payload) {
    return [
      `Name: ${payload.name || ""}`,
      `Email: ${payload.email || ""}`,
      `Subject: ${payload.subject || ""}`,
      ``,
      `${payload.message || ""}`,
    ].join("\n");
  }

  function getSessionId() {
    const key = "techCommunitySessionId";
    let value = window.localStorage.getItem(key);
    if (!value) {
      value = `sess_${Math.random().toString(36).slice(2)}_${Date.now().toString(36)}`;
      window.localStorage.setItem(key, value);
    }
    return value;
  }

  function track(eventType, extra) {
    const payload = {
      eventType,
      page: location.pathname,
      referrer: document.referrer || "",
      sessionId: getSessionId(),
      ...extra,
    };
    const body = JSON.stringify(payload);

    if (navigator.sendBeacon) {
      for (const base of apiBases) {
        try {
          const blob = new Blob([body], { type: "application/json" });
          navigator.sendBeacon(`${base}/activity-log`, blob);
          return;
        } catch (_) {}
      }
      return;
    }

    fetchFromApi("activity-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  function showToast(text) {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add("is-on");
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => toast.classList.remove("is-on"), 1800);
  }

  document.addEventListener("click", async (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    const modalBtn = target.closest("[data-modal-img]");
    if (modalBtn) {
      const src = modalBtn.getAttribute("data-modal-img");
      if (!src || !modal || !modalImg) return;
      modalImg.src = src;
      modalImg.alt = "Preview";
      if (typeof modal.showModal === "function") modal.showModal();
      return;
    }

    const copyBtn = target.closest("[data-copy]");
    if (copyBtn) {
      const text = copyBtn.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(text);
        showToast("Copied.");
      } catch (_) {
        showToast("Copy failed.");
      }
    }

    const trackTarget = target.closest("a, button");
    if (trackTarget) {
      const href =
        trackTarget instanceof HTMLAnchorElement ? trackTarget.href : trackTarget.getAttribute("href") || "";
      const label = (trackTarget.textContent || "").trim().slice(0, 160);
      track("cta_click", { href, label });
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && modal.open) modal.close();
  });

  function renderLink(href, label = "Open") {
    if (!href) return "";
    const external = /^https?:\/\//i.test(String(href || ""));
    const attrs = external ? ' target="_blank" rel="noreferrer"' : "";
    return `<div class="card__actions" style="margin-top:12px"><a class="miniBtn" href="${href}"${attrs}>${label}</a></div>`;
  }

  function renderFeedCard(item, variant) {
    if (variant === "roadmap") {
      return `
        <article class="roadmap__card">
          <div class="roadmap__k">${item.label || "Proof"}</div>
          <div class="roadmap__t">${item.title || "Untitled update"}</div>
          <p class="p">${item.description || ""}</p>
          <div class="step__d">${item.meta || ""}</div>
          ${renderLink(item.href, item.cta || "Open")}
        </article>
      `;
    }

    return `
      <div class="feed">
        <div class="feed__k">${item.label || "Proof"}</div>
        <div class="feed__t">${item.title || "Untitled update"}</div>
        <div class="feed__d">${item.description || ""}</div>
        <div class="feed__meta">${item.meta || ""}</div>
        ${renderLink(item.href, item.cta || "Open")}
      </div>
    `;
  }

  function renderInfoCard(item) {
    return `
      <article class="roadmap__card">
        <div class="roadmap__k">${item.label || "Update"}</div>
        <div class="roadmap__t">${item.title || "Untitled item"}</div>
        <p class="p">${item.description || ""}</p>
        <div class="step__d">${item.meta || ""}</div>
        ${renderLink(item.href, item.cta || "Open")}
      </article>
    `;
  }

  (async function loadLiveData() {
    const shouldLoad =
      Object.values(liveIds).some(Boolean) ||
      Boolean(proofFeed) ||
      Boolean(nextActivitiesFeed) ||
      Boolean(blogPostsFeed) ||
      Boolean(deployedProductsFeed);
    if (!shouldLoad) return;

    try {
      let data;
      try {
        const res = await fetchFromApi("live-data", { cache: "no-store" });
        data = await res.json();
      } catch (_) {
        const res = await fetch("./data.json", { cache: "no-store" });
        if (!res.ok) return;
        data = await res.json();
      }

      if (liveIds.activeProjects) liveIds.activeProjects.textContent = String(data.activeProjects ?? "—");
      if (liveIds.openRoles) liveIds.openRoles.textContent = String(data.openRoles ?? "—");
      if (liveIds.currentSprint) liveIds.currentSprint.textContent = String(data.currentSprint ?? "—");
      if (liveIds.ideasInVoting) liveIds.ideasInVoting.textContent = String(data.ideasInVoting ?? "—");

      if (proofFeed && Array.isArray(data.proofFeed) && data.proofFeed.length) {
        const variant = proofFeed.classList.contains("roadmap") ? "roadmap" : "feed";
        proofFeed.innerHTML = data.proofFeed.map((item) => renderFeedCard(item, variant)).join("");
      }

      if (nextActivitiesFeed && Array.isArray(data.nextActivities) && data.nextActivities.length) {
        nextActivitiesFeed.innerHTML = data.nextActivities.map((item) => renderInfoCard(item)).join("");
      }

      if (blogPostsFeed && Array.isArray(data.blogPosts) && data.blogPosts.length) {
        blogPostsFeed.innerHTML = data.blogPosts.map((item) => renderInfoCard(item)).join("");
      }

      if (deployedProductsFeed && Array.isArray(data.deployedProducts) && data.deployedProducts.length) {
        deployedProductsFeed.innerHTML = data.deployedProducts.map((item) => renderInfoCard(item)).join("");
      }
    } catch (_) {
      // Keep the static fallback content already in the HTML.
    }
  })();

  if (intentForm) {
    intentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = readForm(intentForm);
      payload.source = "join-page";
      if (intentFormStatus) intentFormStatus.textContent = "Submitting intent…";
      try {
        const res = await fetchFromApi("intent-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || data.ok === false) throw new Error(data.error || "Intent submission failed.");
        intentForm.reset();
        if (intentFormStatus) intentFormStatus.textContent = "Intent submitted. Join Discord too for the fastest follow-up.";
        showToast("Intent submitted.");
        track("intent_submit", { label: payload.intent, payload });
      } catch (err) {
        const fallback = buildIntentFallback(payload);
        try {
          await navigator.clipboard.writeText(fallback);
          if (intentFormStatus) {
            intentFormStatus.textContent =
              "Intent submission failed. Your formatted intent was copied to clipboard — paste it into Discord or Telegram.";
          }
          showToast("Copied intent fallback.");
        } catch (_) {
          if (intentFormStatus) {
            intentFormStatus.textContent =
              `Intent submission failed. ${err.message || ""} Use the format above and post it manually in Discord.`.trim();
          }
          showToast("Intent submission failed.");
        }
      }
    });
  }

  if (contactForm) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = readForm(contactForm);
      payload.source = "join-page";
      if (contactFormStatus) contactFormStatus.textContent = "Sending message…";
      try {
        const res = await fetchFromApi("contact-submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || data.ok === false) throw new Error(data.error || "Message failed.");
        contactForm.reset();
        const mailNote =
          data.mailConfigured === false
            ? " Message stored, but email delivery is not configured yet."
            : " Message stored and routed for email delivery.";
        if (contactFormStatus) contactFormStatus.textContent = `Message sent.${mailNote}`;
        showToast("Message sent.");
        track("contact_submit", { label: payload.subject, payload });
      } catch (err) {
        const fallback = buildContactFallback(payload);
        const mailto = `mailto:erudite-wbt@outlook.com?subject=${encodeURIComponent(payload.subject || "Community message")}&body=${encodeURIComponent(fallback)}`;
        try {
          await navigator.clipboard.writeText(fallback);
          if (contactFormStatus) {
            contactFormStatus.innerHTML =
              `Message failed. Your message was copied to clipboard. You can also <a class="inline" href="${mailto}">send it by email directly</a>.`;
          }
          showToast("Copied message fallback.");
        } catch (_) {
          if (contactFormStatus) {
            contactFormStatus.innerHTML =
              `Message failed. <a class="inline" href="${mailto}">Send it directly by email</a>.`;
          }
          showToast("Message failed.");
        }
      }
    });
  }

  track("page_view", { label: document.title });
})();

