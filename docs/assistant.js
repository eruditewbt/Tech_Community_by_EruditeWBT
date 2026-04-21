(function () {
  const FLOW = [
    {
      key: "domain",
      label: "What field or domain are you coming from?",
      prompt: "Tell us the field you are coming from so we can route you well.",
      input: "text",
      placeholder: "software, design, health, education, business, law...",
    },
    {
      key: "email",
      label: "What email should we use to follow up with you?",
      prompt: "Share the best email for repo access, project matching, and follow-up.",
      input: "email",
      placeholder: "you@example.com",
    },
    {
      key: "name",
      label: "What should we call you?",
      prompt: "A first name or working name is enough.",
      input: "text",
      placeholder: "Your name",
    },
    {
      key: "goal",
      label: "What do you want right now?",
      prompt: "Choose the clearest current goal so we can guide you faster.",
      input: "choice",
      choices: ["Learn foundations", "Join a project", "Build an idea", "Collaborate across fields", "Get repo access"],
    },
    {
      key: "skill_level",
      label: "How would you describe your current level?",
      prompt: "This helps us avoid routing you too high or too low.",
      input: "choice",
      choices: ["Absolute beginner", "Early beginner", "Intermediate", "Advanced"],
    },
    {
      key: "repo_interest",
      label: "Which repo or path feels closest to what you need?",
      prompt: "Pick the path that feels most relevant. We can still suggest something else if needed.",
      input: "choice",
      choices: [
        "Intro to Computing and Programming",
        "Tech Community by EruditeWBT",
        "HACKCLUB",
        "JAVASCRIPT",
        "TYPESCRIPT",
        "DARTANDFLUTTER",
        "VISUALSANDHCI",
        "Not sure yet",
      ],
    },
    {
      key: "question",
      label: "What are you trying to achieve, or what do you need help with first?",
      prompt: "Ask your real question here. We will answer, suggest a path, and record it for admin follow-up.",
      input: "textarea",
      placeholder: "I want to start coding... I need help choosing a repo... I want to join a project...",
    },
  ];

  const STORAGE_KEY = "techCommunityOnboardingState";
  const completedState = new Set(["completed", "assistant"]);
  const CANONICAL_API_BASE = "https://eruditewbt.netlify.app/api";
  const configuredApiBase =
    sessionStorage.getItem("tech-community-api-base") || window.TECH_COMMUNITY_API_BASE || "";
  const apiBases = resolveApiBases();

  function resolveApiBases() {
    const host = String(location.hostname || "").toLowerCase();
    const origin = String(location.origin || "").replace(/\/$/, "");
    const isNetlifyHost = host.endsWith(".netlify.app");
    const localCandidates = isNetlifyHost ? [`${origin}/api`, `${origin}/.netlify/functions`] : [];
    return [configuredApiBase, CANONICAL_API_BASE, ...localCandidates]
      .map((item) => String(item || "").trim())
      .filter(Boolean)
      .map((item) => item.replace(/\/$/, ""))
      .filter((item, index, arr) => arr.indexOf(item) === index);
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

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error("missing");
      const parsed = JSON.parse(raw);
      return {
        sessionId: parsed.sessionId || getSessionId(),
        answers: parsed.answers || {},
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        currentStepKey: parsed.currentStepKey || FLOW[0].key,
        mode: parsed.mode || "onboarding",
        open: Boolean(parsed.open),
        dismissed: Boolean(parsed.dismissed),
      };
    } catch (_) {
      return {
        sessionId: getSessionId(),
        answers: {},
        messages: [
          {
            role: "assistant",
            text: "Welcome. I’ll help you get into the community quickly. We’ll start with your domain, then your email, then I’ll route you into the right repo, people, and next steps.",
          },
        ],
        currentStepKey: FLOW[0].key,
        mode: "onboarding",
        open: false,
        dismissed: false,
      };
    }
  }

  let state = loadState();

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getStep(key) {
    return FLOW.find((step) => step.key === key) || FLOW[FLOW.length - 1];
  }

  function nextUnansweredKey() {
    const answered = new Set(Object.keys(state.answers || {}));
    const next = FLOW.find((step) => !answered.has(step.key));
    return next ? next.key : "question";
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

  function createUi() {
    const launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "assistantLauncher";
    launcher.setAttribute("aria-label", "Open community assistant");
    launcher.textContent = "Start Here";

    const sheet = document.createElement("aside");
    sheet.className = "assistantSheet";
    sheet.innerHTML = `
      <div class="assistantSheet__head">
        <div>
          <div class="assistantSheet__eyebrow">Community onboarding</div>
          <div class="assistantSheet__title">EruditeWBT Assistant</div>
        </div>
        <div class="assistantSheet__actions">
          <button type="button" class="assistantSheet__icon" data-assistant-action="minimize">Close</button>
        </div>
      </div>
      <div class="assistantSheet__meta">
        <div class="assistantProgress" id="assistantProgress"></div>
        <div class="assistantMini" id="assistantMini"></div>
      </div>
      <div class="assistantLog" id="assistantLog"></div>
      <form class="assistantForm" id="assistantForm">
        <label class="assistantPrompt" id="assistantPrompt" for="assistantInput"></label>
        <div id="assistantChoiceWrap" class="assistantChoices"></div>
        <input id="assistantInput" class="assistantInput" />
        <textarea id="assistantTextarea" class="assistantTextarea" rows="4"></textarea>
        <div class="assistantForm__actions">
          <button type="submit" class="btn btn--primary" id="assistantSubmit">Submit</button>
          <button type="button" class="btn btn--quiet" data-assistant-action="later">Later</button>
        </div>
      </form>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(sheet);
    return { launcher, sheet };
  }

  const ui = createUi();
  const launcher = ui.launcher;
  const sheet = ui.sheet;
  const logEl = sheet.querySelector("#assistantLog");
  const promptEl = sheet.querySelector("#assistantPrompt");
  const progressEl = sheet.querySelector("#assistantProgress");
  const miniEl = sheet.querySelector("#assistantMini");
  const formEl = sheet.querySelector("#assistantForm");
  const inputEl = sheet.querySelector("#assistantInput");
  const textEl = sheet.querySelector("#assistantTextarea");
  const choiceWrap = sheet.querySelector("#assistantChoiceWrap");
  const submitBtn = sheet.querySelector("#assistantSubmit");

  function openSheet() {
    state.open = true;
    state.dismissed = false;
    sheet.classList.add("is-open");
    launcher.classList.add("is-hidden");
    saveState();
    render();
  }

  function closeSheet() {
    state.open = false;
    sheet.classList.remove("is-open");
    launcher.classList.remove("is-hidden");
    saveState();
  }

  function currentStep() {
    if (completedState.has(state.mode)) {
      return getStep("question");
    }
    return getStep(state.currentStepKey || nextUnansweredKey());
  }

  function renderMessages() {
    logEl.innerHTML = state.messages
      .map((item) => {
        if (item.type === "suggestions" && Array.isArray(item.items)) {
          return `
            <div class="assistantBubble assistantBubble--assistant">
              <div class="assistantBubble__label">Suggestions</div>
              <div class="assistantSuggestionList">
                ${item.items
                  .map(
                    (s) => `
                    <a class="assistantSuggestion" href="${escapeHtml(s.href || "#")}" target="_blank" rel="noreferrer">
                      <span class="assistantSuggestion__title">${escapeHtml(s.title || "Suggestion")}</span>
                      <span class="assistantSuggestion__body">${escapeHtml(s.description || "")}</span>
                    </a>`
                  )
                  .join("")}
              </div>
            </div>
          `;
        }
        return `
          <div class="assistantBubble assistantBubble--${item.role === "user" ? "user" : "assistant"}">
            <div class="assistantBubble__label">${item.role === "user" ? "You" : "Assistant"}</div>
            <div>${escapeHtml(item.text || "")}</div>
          </div>
        `;
      })
      .join("");
    logEl.scrollTop = logEl.scrollHeight;
  }

  function renderForm() {
    const step = currentStep();
    const answeredCount = Object.keys(state.answers || {}).length;
    const total = FLOW.length;
    const stepIndex = Math.min(FLOW.findIndex((item) => item.key === step.key) + 1, total);
    progressEl.textContent = completedState.has(state.mode)
      ? `Onboarding complete • Ask anything`
      : `Step ${stepIndex} of ${total}`;
    miniEl.textContent = completedState.has(state.mode)
      ? "We can keep answering questions, suggest repos, and note what support you need next."
      : step.label;
    promptEl.textContent = step.prompt;

    inputEl.style.display = "none";
    textEl.style.display = "none";
    choiceWrap.innerHTML = "";
    submitBtn.style.display = step.input === "choice" ? "none" : "inline-flex";

    if (step.input === "choice") {
      choiceWrap.innerHTML = (step.choices || [])
        .map(
          (choice) =>
            `<button type="button" class="assistantChoice" data-choice="${escapeHtml(choice)}">${escapeHtml(choice)}</button>`
        )
        .join("");
    } else if (step.input === "textarea") {
      textEl.style.display = "block";
      textEl.placeholder = step.placeholder || "Type here";
      textEl.value = "";
      textEl.focus();
    } else {
      inputEl.type = step.input || "text";
      inputEl.style.display = "block";
      inputEl.placeholder = step.placeholder || "Type here";
      inputEl.value = "";
      inputEl.focus();
    }
  }

  function render() {
    renderMessages();
    renderForm();
  }

  function addMessage(role, text) {
    state.messages.push({ role, text });
    saveState();
    renderMessages();
  }

  function addSuggestions(items) {
    if (!Array.isArray(items) || !items.length) return;
    state.messages.push({ type: "suggestions", role: "assistant", items });
    saveState();
    renderMessages();
  }

  async function submitAnswer(answer) {
    const step = currentStep();
    const cleanAnswer = String(answer || "").trim();
    if (!cleanAnswer) return;

    state.answers[step.key] = cleanAnswer;
    addMessage("user", cleanAnswer);
    promptEl.textContent = "Saving your answer and preparing the next step…";
    saveState();

    try {
      const res = await fetchFromApi("onboarding-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: state.sessionId,
          stepKey: step.key,
          answer: cleanAnswer,
          page: location.pathname,
          source: "bottom-sheet-assistant",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.ok === false) throw new Error(data.error || "Onboarding submit failed.");

      if (data.user) {
        state.user = data.user;
      }
      if (data.reply) addMessage("assistant", data.reply);
      if (Array.isArray(data.suggestions)) addSuggestions(data.suggestions);
      if (data.nextStep && data.nextStep.key) {
        state.currentStepKey = data.nextStep.key;
        state.mode = data.mode || "onboarding";
      } else {
        state.mode = data.mode || "assistant";
        state.currentStepKey = "question";
        if (!completedState.has(state.mode)) state.mode = "assistant";
        addMessage(
          "assistant",
          "You are in. From here, you can keep asking questions, request repo access, or tell us what project or role you want next."
        );
      }
      saveState();
      render();
    } catch (err) {
      addMessage(
        "assistant",
        "The live assistant could not save that right now. Please join Discord and send your domain, email, current goal, and question there so the team can still route you quickly."
      );
      state.currentStepKey = nextUnansweredKey();
      saveState();
      render();
    }
  }

  launcher.addEventListener("click", openSheet);
  sheet.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const choice = target.closest("[data-choice]");
    if (choice) {
      submitAnswer(choice.getAttribute("data-choice") || "");
      return;
    }
    const action = target.closest("[data-assistant-action]");
    if (!action) return;
    const kind = action.getAttribute("data-assistant-action");
    if (kind === "minimize") {
      closeSheet();
    }
    if (kind === "later") {
      state.dismissed = true;
      closeSheet();
    }
  });

  formEl.addEventListener("submit", (event) => {
    event.preventDefault();
    const step = currentStep();
    const value = step.input === "textarea" ? textEl.value : inputEl.value;
    submitAnswer(value);
  });

  if (state.open) {
    openSheet();
  } else if (!state.dismissed) {
    window.setTimeout(() => {
      if (!state.dismissed && !state.open) openSheet();
    }, 1200);
  } else {
    render();
  }
})();
