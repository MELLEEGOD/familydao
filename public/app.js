const portalMode = location.pathname.startsWith("/parent")
  ? "parent"
  : location.pathname.startsWith("/child")
    ? "child"
    : "all";

const portalSettings = {
  all: {
    title: "Family Credits",
    eyebrow: "Family credits made simple",
    userRole: null,
    defaultUser: "u_alice",
    defaultTab: "chores",
    tabs: ["chores", "shop", "finance", "parent", "chore-create", "growth", "insights", "ledger"]
  },
  parent: {
    title: "Parent Dashboard",
    eyebrow: "Family credits at a glance",
    userRole: "ADMIN",
    defaultUser: "u_parent",
    defaultTab: "parent",
    tabs: ["parent", "chore-create", "finance", "insights", "ledger"]
  },
  child: {
    title: "My Family Credits",
    eyebrow: "Earn, save, and choose rewards",
    userRole: "USER",
    defaultUser: "u_alice",
    defaultTab: "chores",
    tabs: ["chores", "shop", "finance", "growth", "ledger"]
  }
};

const portal = portalSettings[portalMode];
const portalStorageKey = (key) => `family-credits-${portalMode}-${key}`;
const tabLabels = {
  all: {
    chores: "Chores",
    shop: "Shop",
    finance: "Money",
    parent: "Home",
    "chore-create": "Chores",
    growth: "Growth",
    insights: "Reports",
    ledger: "History"
  },
  parent: {
    parent: "Home",
    "chore-create": "Chores",
    finance: "Money",
    insights: "Reports",
    ledger: "History"
  },
  child: {
    chores: "Chores",
    shop: "Shop",
    finance: "Money",
    growth: "Reminders",
    ledger: "History"
  }
};

const app = {
  state: null,
  activeUserId: localStorage.getItem(portalStorageKey("user")) || portal.defaultUser,
  activeTab: localStorage.getItem(portalStorageKey("tab")) || portal.defaultTab,
  focusPersonId: localStorage.getItem("family-credits-focus-person") || null,
  statsPersonId: localStorage.getItem("family-credits-stats-person") || null,
  theme: localStorage.getItem("family-credits-theme") || "light",
  ui: {
    shopQuery: "",
    shopFilter: "all",
    ledgerQuery: "",
    ledgerUser: "all",
    ledgerType: "all",
    commandOpen: false
  },
  pending: false
};

const CARD = "rounded-lg border border-stone-200 bg-white p-5 shadow-sm";
const FIELD = "focus-ring rounded-md border border-stone-300 px-3 py-2 text-sm";
const SELECT = `${FIELD} bg-white font-bold`;
const PRIMARY_BUTTON = "focus-ring rounded-md bg-ink px-4 py-2 text-sm font-black text-white hover:bg-stone-700";
const MINT_BUTTON = "focus-ring rounded-md bg-mint px-4 py-2 text-sm font-black text-white hover:bg-emerald-700";
const CHORE_GROUPS = ["AVAILABLE", "PENDING_APPROVAL", "COMPLETED"];
const EARNED_TX_TYPES = new Set([
  "CHORE_COMPLETION",
  "MONTHLY_CREDIT",
  "EXTRA_CREDIT",
  "CREDIT_REQUEST_APPROVAL",
  "MEDICINE_CREDIT",
  "EXTRA_HELP",
  "INTEREST_PAYOUT",
  "PERSONAL_TASK_REWARD",
  "APPRECIATION_CHECKPOINT"
]);
const SPENT_TX_TYPES = new Set(["SHOP_PURCHASE", "BEHAVIOR_DEDUCTION", "BAD_BEHAVIOR", "GROUNDED", "LOAN_REPAYMENT"]);
const PEOPLE_SPENT_TX_TYPES = new Set([...SPENT_TX_TYPES, "SAVINGS_WITHDRAWAL"]);
const DEDUCTION_TX_TYPES = new Set(["BAD_BEHAVIOR", "GROUNDED", "BEHAVIOR_DEDUCTION", "SHOP_PURCHASE"]);

const choreStatusMeta = {
  AVAILABLE: {
    label: "Available",
    tone: "border-mint/20 bg-emerald-50 text-emerald-800"
  },
  PENDING_APPROVAL: {
    label: "Pending Approval",
    tone: "border-sun/30 bg-amber-50 text-amber-800"
  },
  COMPLETED: {
    label: "Completed",
    tone: "border-stone-200 bg-stone-100 text-stone-600"
  }
};

const txTone = {
  CHORE_COMPLETION: "text-emerald-700",
  SAVINGS_DEPOSIT: "text-emerald-700",
  INTEREST_PAYOUT: "text-emerald-700",
  MONTHLY_CREDIT: "text-emerald-700",
  EXTRA_CREDIT: "text-emerald-700",
  CREDIT_REQUEST_APPROVAL: "text-emerald-700",
  LOAN_DISBURSEMENT: "text-emerald-700",
  MEDICINE_CREDIT: "text-emerald-700",
  EXTRA_HELP: "text-emerald-700",
  PERSONAL_TASK_REWARD: "text-emerald-700",
  APPRECIATION_CHECKPOINT: "text-emerald-700",
  SHOP_PURCHASE: "text-rose-700",
  SAVINGS_WITHDRAWAL: "text-rose-700",
  BEHAVIOR_DEDUCTION: "text-rose-700",
  BAD_BEHAVIOR: "text-rose-700",
  GROUNDED: "text-rose-700",
  FAMILY_FUND_CONTRIBUTION: "text-rose-700",
  LOAN_REPAYMENT: "text-rose-700"
};

const money = (value) =>
  `${Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: Number(value) % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })} FC`;

const todayKey = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value) =>
  value
    ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "No deadline";
const byId = (id) => document.getElementById(id);
const setHtml = (id, html) => {
  byId(id).innerHTML = html;
};
const html = (items, mapper) => items.map(mapper).join("");
const capturePanel = (id, renderer) => {
  let panel = byId(id);
  const isScratchPanel = !panel;
  if (isScratchPanel) {
    panel = document.createElement("section");
    panel.id = id;
    panel.className = "hidden";
    document.body.appendChild(panel);
  }

  renderer();
  const content = panel.innerHTML;
  if (isScratchPanel) {
    panel.remove();
  } else {
    panel.innerHTML = "";
  }
  return content;
};
const userById = (id) => app.state.users.find((user) => user.id === id);
const childUsers = () => app.state.users.filter((user) => user.role === "USER");
const openChores = () => app.state.chores.filter((chore) => chore.status !== "COMPLETED");
const emptyState = (message, extraClass = "") =>
  `<p class="empty-state rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500 ${extraClass}">${message}</p>`;
const visibleUsers = () => {
  if (portalMode === "child") return app.state.users.filter((user) => user.id === app.activeUserId && user.role === "USER");
  if (portalMode === "parent") return app.state.users.filter((user) => user.id === app.activeUserId && user.role === "ADMIN");
  return portal.userRole ? app.state.users.filter((user) => user.role === portal.userRole) : app.state.users;
};
const activeUser = () =>
  visibleUsers().find((user) => user.id === app.activeUserId) || visibleUsers()[0] || app.state.users[0];
const isAdmin = () => activeUser().role === "ADMIN";
const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

async function api(path, options = {}) {
  const { body, skipState = false, ...fetchOptions } = options;
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...fetchOptions,
    body: body ? JSON.stringify(body) : undefined
  });

  const payload = await response.json();
  if (!response.ok) {
    if (response.status === 401 && portalMode !== "all") {
      window.location.href = "/login";
    }
    throw new Error(friendlyError(payload.error || "Request failed."));
  }

  if (!skipState) {
    app.state = payload;
    render();
  }
  return payload;
}

async function loadState() {
  if (portalMode !== "all" && !app.activeUserId) {
    window.location.href = "/login";
    return;
  }

  const response = await fetch("/api/state");
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  app.state = await response.json();
  const users = visibleUsers();
  if (!users.some((user) => user.id === app.activeUserId)) {
    window.location.href = "/login";
    return;
  }

  if (!portal.tabs.includes(app.activeTab)) {
    app.activeTab = portal.defaultTab;
  }
  render();
}

function showMessage(text, type = "success") {
  const message = byId("message");
  message.textContent = text;
  message.className =
    type === "error"
      ? "mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800"
      : "mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800";
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => message.classList.add("hidden"), 3200);
}

function friendlyError(message) {
  const errorMap = {
    "Admin permissions are required for this action.": "Parent permissions are needed for that action.",
    "Only child users can perform this action.": "Switch to a child account to do that.",
    "Insufficient liquid Family Credits.": "Not enough liquid Family Credits yet.",
    "Insufficient savings balance.": "That amount is higher than the savings balance.",
    "You cannot remove the active parent account.": "Switch to another parent account before removing this one.",
    "At least one parent account must remain.": "At least one parent account must stay in the household.",
    "This chore is assigned to another child.": "That chore is assigned to someone else today.",
    "This reminder belongs to another child.": "That reminder belongs to another child.",
    "Reminder is already completed.": "That reminder has already been completed."
  };

  return errorMap[message] || message;
}

function confirmDialog({ title, body, acceptText = "Confirm", cancelText = "Cancel" }) {
  const overlay = byId("confirmOverlay");
  const titleEl = byId("confirmTitle");
  const bodyEl = byId("confirmBody");
  const acceptButton = byId("confirmAccept");
  const cancelButton = byId("confirmCancel");

  titleEl.textContent = title;
  bodyEl.textContent = body;
  acceptButton.textContent = acceptText;
  cancelButton.textContent = cancelText;
  overlay.classList.remove("hidden");
  overlay.classList.add("flex");
  acceptButton.focus();

  return new Promise((resolve) => {
    const close = (result) => {
      overlay.classList.add("hidden");
      overlay.classList.remove("flex");
      acceptButton.removeEventListener("click", accept);
      cancelButton.removeEventListener("click", cancel);
      overlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    };
    const accept = () => close(true);
    const cancel = () => close(false);
    const onBackdrop = (event) => {
      if (event.target === overlay) close(false);
    };
    const onKeydown = (event) => {
      if (event.key === "Escape") close(false);
    };

    acceptButton.addEventListener("click", accept);
    cancelButton.addEventListener("click", cancel);
    overlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKeydown);
  });
}

async function runAction(button, action, successMessage) {
  if (app.pending) return;
  app.pending = true;
  const original = button ? button.textContent : "";
  if (button) {
    button.disabled = true;
    button.textContent = "Working...";
  }

  try {
    await action();
    if (successMessage) showMessage(successMessage);
  } catch (error) {
    showMessage(error.message, "error");
    render();
  } finally {
    app.pending = false;
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
  }
}

function render() {
  if (!app.state) return;
  renderPortalChrome();
  applyTheme();
  renderProfileBadge();
  renderThemeButton();
  renderStats();
  renderCommandCenter();
  renderTabs();
  renderActiveTab();
  renderCommandPalette();
  FamilyCreditsSelects.enhance();
  prepareForms();
  applyLiveFilters();
}

function prepareForms(root = document) {
  root.querySelectorAll("form").forEach((form) => {
    form.noValidate = true;
  });
  root.querySelectorAll("[required], input[min], input[max]").forEach((field) => {
    field.addEventListener("input", () => clearFieldError(field), { once: true });
    field.addEventListener("change", () => clearFieldError(field), { once: true });
  });
}

function fieldLabel(field) {
  const explicit = field.id ? document.querySelector(`label[for="${CSS.escape(field.id)}"]`)?.textContent : "";
  const name = field.getAttribute("aria-label") || field.placeholder || explicit || field.name || "This field";
  return name.replace(/\s+/g, " ").trim();
}

function validationMessageFor(field) {
  const label = fieldLabel(field);
  const value = String(field.value || "").trim();
  if (field.hasAttribute("required") && !value) return `${label} is needed.`;

  if (field.type === "number" && value) {
    const number = Number(value);
    const min = field.min === "" ? null : Number(field.min);
    const max = field.max === "" ? null : Number(field.max);
    if (Number.isNaN(number)) return `${label} needs to be a number.`;
    if (min !== null && number < min) return `${label} needs to be at least ${field.min}.`;
    if (max !== null && number > max) return `${label} can be at most ${field.max}.`;
  }

  if (field.type === "date" && value && Number.isNaN(new Date(`${value}T12:00:00`).getTime())) {
    return `${label} needs a valid date.`;
  }

  return "";
}

function clearFieldError(field) {
  field.removeAttribute("aria-invalid");
  field.closest(".field-error-wrap")?.querySelector(".field-error")?.remove();
}

function showFieldError(field, message) {
  clearFieldError(field);
  field.setAttribute("aria-invalid", "true");
  const wrapper = field.closest(".custom-select") || field;
  const parent = wrapper.parentElement;
  if (!parent) return;
  parent.classList.add("field-error-wrap");
  wrapper.insertAdjacentHTML("afterend", `<p class="field-error mt-1 text-xs font-black text-rose-700">${escapeHtml(message)}</p>`);
}

function validateForm(form) {
  const invalid = [...form.querySelectorAll("input, select, textarea")].find((field) => validationMessageFor(field));
  if (!invalid) return true;
  const message = validationMessageFor(invalid);
  showFieldError(invalid, message);
  showMessage(message, "error");
  invalid.focus({ preventScroll: false });
  invalid.scrollIntoView({ block: "center", behavior: "smooth" });
  return false;
}

const tabRenderers = {
  chores: renderChores,
  shop: renderShop,
  finance: renderFinance,
  parent: renderParentPortal,
  "chore-create": renderChoreCreation,
  growth: renderGrowth,
  insights: renderInsights,
  ledger: renderLedger
};

function renderActiveTab() {
  tabRenderers[app.activeTab]?.();
}

function renderPortalChrome() {
  document.title = portal.title;
  document.querySelector(".app-title").textContent = portal.title;
  document.querySelector(".app-header p").textContent = portal.eyebrow;
}

function applyTheme() {
  document.documentElement.classList.toggle("theme-dark", app.theme === "dark");
  localStorage.setItem("family-credits-theme", app.theme);
}

function renderThemeButton() {
  const button = byId("themeToggle");
  button.textContent = app.theme === "dark" ? "Light theme" : "Dark theme";
  button.setAttribute("aria-pressed", app.theme === "dark" ? "true" : "false");
}

function profileInitials(name) {
  return String(name || "?")
    .replaceAll("&", " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function renderProfileBadge() {
  const badge = byId("profileBadge");
  if (!badge) return;
  const user = activeUser();
  badge.innerHTML = `
    <span class="profile-badge-icon" aria-hidden="true">${escapeHtml(profileInitials(user.name))}</span>
    <span class="profile-badge-text">
      <span class="profile-badge-name">${escapeHtml(user.name)}</span>
    </span>
  `;
  badge.setAttribute("aria-label", `Current profile: ${user.name}`);
}

function renderStats() {
  const user = activeUser();
  const cards =
    user.role === "ADMIN"
      ? [
          {
            label: "Children",
            value: childUsers().length,
            note: "Active child accounts",
            accent: "bg-mint"
          },
          {
            label: "Pending chores",
            value: app.state.chores.filter((chore) => chore.status === "PENDING_APPROVAL").length,
            note: "Waiting for approval",
            accent: "bg-sun"
          },
          {
            label: "Family fund",
            value: money(app.state.familyFund?.balance || 0),
            note: "Shared family goal",
            accent: "bg-berry"
          }
        ]
      : [
          {
            label: "Spendable FC",
            value: money(user.balance),
            note: "Ready to use",
            accent: "bg-mint"
          },
          {
            label: "Saved FC",
            value: money(user.savings_balance),
            note: "In your vault",
            accent: "bg-sun"
          },
          {
            label: "Loan",
            value: money(user.loan_balance || 0),
            note: (user.loan_balance || 0) > 0 ? "Still to repay" : "None active",
            accent: "bg-berry"
          }
        ];

  byId("stats").innerHTML = cards
    .map(
      (card) => `
        <article class="stat-card rounded-lg border border-stone-200 bg-white p-5 shadow-soft">
          <div class="flex items-center justify-between gap-4">
            <p class="stat-label text-sm font-bold text-stone-500">${card.label}</p>
            <span class="h-3 w-3 rounded-full ${card.accent}"></span>
          </div>
          <p class="stat-value mt-3 text-3xl font-black tracking-tight">${card.value}</p>
          <p class="stat-note mt-2 text-sm font-medium text-stone-500">${card.note}</p>
        </article>
      `
    )
    .join("");
}

function actionCenterItems() {
  const user = activeUser();
  const pendingChores = app.state.chores.filter((chore) => chore.status === "PENDING_APPROVAL");
  const availableChores = app.state.chores.filter(
    (chore) => chore.status === "AVAILABLE" && (!chore.assigned_to || chore.assigned_to === user.id)
  );
  const openReminders = app.state.reminders.filter(
    (reminder) => reminder.status !== "COMPLETED" && (isAdmin() || reminder.userId === user.id)
  );
  const pendingRequests = (app.state.creditRequests || []).filter(
    (request) => request.status === "PENDING" && request.request_type === "EXTRA_CREDIT"
  );
  const fund = app.state.familyFund || { balance: 0, target: 1 };
  const fundProgress = Math.min(100, Math.round((fund.balance / Math.max(fund.target, 1)) * 100));

  if (isAdmin()) {
    return [
      { label: "Approve chores", value: pendingChores.length, note: "Awaiting payout", tab: "parent", tone: "sun" },
      { label: "Review requests", value: pendingRequests.length, note: "Extra FC asks", tab: "parent", tone: "berry" },
      { label: "Daily chores", value: app.state.dailyChorePresets.length, note: "Preset routines", tab: "chore-create", tone: "mint" },
      { label: "Family fund", value: `${fundProgress}%`, note: money(fund.balance), tab: "finance", tone: "ink" }
    ];
  }

  return [
    { label: "Open bounties", value: availableChores.length, note: "Ready to finish", tab: "chores", tone: "mint" },
    { label: "Reminders", value: openReminders.length, note: "Personal tasks", tab: "growth", tone: "sun" },
    { label: "Affordable rewards", value: affordableShopItems().length, note: "In the shop", tab: "shop", tone: "berry" },
    { label: "Family fund", value: `${fundProgress}%`, note: money(fund.balance), tab: "finance", tone: "ink" }
  ];
}

function renderCommandCenter() {
  const target = byId("commandCenter");
  if (!target) return;
  const user = activeUser();
  const actions = actionCenterItems().filter((item) => portal.tabs.includes(item.tab));
  const activeLabel = tabLabels[portalMode]?.[app.activeTab] || tabLabels.all[app.activeTab] || app.activeTab;
  target.innerHTML = `
    <section class="action-center rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p class="text-xs font-black uppercase tracking-wide text-stone-500">Now viewing ${escapeHtml(activeLabel)}</p>
          <h2 class="mt-1 text-xl font-black">${escapeHtml(user.name)} command center</h2>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <button data-action="open-command-palette" class="${PRIMARY_BUTTON}" type="button">Search all</button>
          <button data-action="open-ledger" class="focus-ring rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-black text-stone-700" type="button">History</button>
        </div>
      </div>
      <div class="dashboard-metric-grid mt-4 grid gap-3">
        ${actions
          .map(
            (item) => `
              <button class="quick-tile focus-ring rounded-md border border-stone-200 bg-stone-50 p-3 text-left" data-action="go-tab" data-tab-target="${item.tab}" type="button">
                <span class="quick-tile-kicker text-xs font-black uppercase tracking-wide text-stone-500">${escapeHtml(item.label)}</span>
                <span class="mt-2 block text-2xl font-black quick-tone-${item.tone}">${escapeHtml(item.value)}</span>
                <span class="mt-1 block text-xs font-bold text-stone-500">${escapeHtml(item.note)}</span>
              </button>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTabs() {
  if (!portal.tabs.includes(app.activeTab)) {
    app.activeTab = portal.defaultTab;
  }

  const tabs = document.querySelector(".dashboard-tabs");
  tabs.innerHTML = portal.tabs
    .map((tab) => {
      const label = tabLabels[portalMode]?.[tab] || tabLabels.all[tab] || tab;
      const activeClass = tab === app.activeTab ? " tab-active" : "";
      return `<button class="tab-button focus-ring shrink-0 rounded-md px-4 py-2 text-sm font-bold${activeClass}" data-tab="${tab}" type="button">${label}</button>`;
    })
    .join("");

  const activePanelId = `tab-${app.activeTab}`;
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.add("hidden");
    if (panel.id !== activePanelId) panel.innerHTML = "";
  });
  byId(activePanelId).classList.remove("hidden");
}

function adminChoreForm() {
  if (!isAdmin()) return "";
  return `
    <details class="mb-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <summary class="cursor-pointer text-sm font-black text-ink">Create chore bounty</summary>
      <form id="choreForm" class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_120px_160px_auto]">
        <input name="title" class="${FIELD}" placeholder="Title" required />
        <input name="description" class="${FIELD}" placeholder="Description" required />
        <input name="bounty" type="number" min="1" step="1" class="${FIELD}" placeholder="Bounty" required />
        <input name="due_date" type="date" class="${FIELD}" aria-label="Deadline" />
        <button class="${PRIMARY_BUTTON}">Create</button>
      </form>
    </details>
  `;
}

function renderChores() {
  setHtml("tab-chores", `
    ${deadlineOverviewWidget()}
    <div class="grid gap-4 xl:grid-cols-3">
      ${html(CHORE_GROUPS, choreColumn)}
    </div>
  `);
}

function visibleDeadlineItems() {
  const user = activeUser();
  const canSeeAll = user.role === "ADMIN";
  const childOwns = (userId) => canSeeAll || userId === user.id;
  const childCanTake = (chore) => !chore.assigned_to && user.role === "USER";

  const choreItems = app.state.chores
    .filter((chore) => chore.due_date && chore.status !== "COMPLETED" && (childOwns(chore.assigned_to) || childCanTake(chore)))
    .map((chore) => ({
      id: chore.id,
      type: "Chore",
      title: chore.title,
      description: chore.description,
      date: chore.due_date,
      status: chore.status.replaceAll("_", " "),
      userName: userById(chore.assigned_to)?.name || "Open bounty",
      tone: "border-mint/20 bg-emerald-50 text-emerald-800"
    }));

  const reminderItems = app.state.reminders
    .filter((reminder) => reminder.due_date && reminder.status !== "COMPLETED" && childOwns(reminder.userId))
    .map((reminder) => ({
      id: reminder.id,
      type: "Reminder",
      title: reminder.title,
      description: reminder.description,
      date: reminder.due_date,
      status: reminder.status,
      userName: reminder.userName,
      tone: "border-sun/30 bg-amber-50 text-amber-800"
    }));

  return [...choreItems, ...reminderItems].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

function deadlineOverviewWidget() {
  const upcoming = visibleDeadlineItems().filter((item) => item.date >= todayKey()).slice(0, 3);
  return `
    <section class="overview-strip mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-sm font-black uppercase tracking-[0.18em] text-mint">Next up</p>
          <h2 class="mt-1 text-xl font-black">Deadlines</h2>
        </div>
        <button data-action="open-chores" class="focus-ring rounded-md bg-ink px-4 py-2 text-sm font-black text-white hover:bg-stone-700" type="button">${isAdmin() ? "Manage chores" : "View chores"}</button>
      </div>
      <div class="mt-4 grid gap-3 md:grid-cols-3">
        ${
          upcoming.length
            ? upcoming.map((item) => deadlineMiniCard(item)).join("")
            : `<p class="rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500 md:col-span-3">No upcoming chore deadlines or reminders.</p>`
        }
      </div>
    </section>
  `;
}

function deadlineMiniCard(item) {
  return `
    <article class="mini-card rounded-md border border-stone-200 bg-stone-50 p-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-black uppercase tracking-wide text-stone-500">${escapeHtml(item.type)} - ${escapeHtml(item.userName)}</p>
          <h3 class="mt-1 font-black">${escapeHtml(item.title)}</h3>
        </div>
        <span class="shrink-0 rounded-md border px-2 py-1 text-xs font-black ${item.tone}">${dateLabel(item.date)}</span>
      </div>
    </article>
  `;
}

function renderChoreCreation() {
  const presets = app.state.dailyChorePresets || [];
  const todaysChores = app.state.chores.filter((chore) => chore.source === "DAILY_SYSTEM" && chore.due_date === todayKey());
  const activeChores = openChores();
  byId("tab-chore-create").innerHTML = isAdmin()
    ? `
      <div class="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        ${parentChoreApprovalsPanel()}
        ${aiSuggestionPanel()}
        <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <p class="text-sm font-black uppercase tracking-[0.18em] text-mint">Parent setup</p>
          <h2 class="mt-2 text-xl font-black">Create chore bounty</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">Add one-off chores with a Family Credit bounty. Children can complete them from the Bounty Board.</p>
          ${adminChoreForm()}
        </section>
        <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 class="text-xl font-black">Daily system chores</h2>
              <p class="mt-2 text-sm leading-6 text-stone-600">Manage preset routines, add specific chores to today's list, or run the automatic child-by-child assignment.</p>
            </div>
            <button data-action="generate-daily" class="focus-ring shrink-0 rounded-md bg-ink px-4 py-2 text-sm font-black text-white hover:bg-stone-700">Auto assign today</button>
          </div>

          <details class="mt-5 rounded-md border border-stone-200 bg-stone-50 p-3">
            <summary class="cursor-pointer text-sm font-black text-ink">Add daily preset</summary>
            <form id="dailyPresetForm" class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_130px_150px_auto]">
              <input name="title" class="${FIELD}" placeholder="Preset title" required />
              <input name="description" class="${FIELD}" placeholder="Description" required />
              <input name="bounty" type="number" min="1" step="1" class="${FIELD}" placeholder="Bounty" required />
              <input name="category" class="${FIELD}" placeholder="Category" value="DAILY_ROUTINE" required />
              <button class="${MINT_BUTTON}">Add preset</button>
            </form>
          </details>

          <div class="mt-5 grid gap-4 xl:grid-cols-2">
            <div>
              <div class="mb-3 flex items-center justify-between gap-3">
                <h3 class="font-black">Preset library</h3>
                <span class="rounded-full border border-mint/20 bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-800">${presets.length}</span>
              </div>
              <div class="grid gap-3">
                ${
                  presets.length
                    ? presets.map((preset) => dailyPresetCard(preset)).join("")
                    : emptyState("No daily presets yet.")
                }
              </div>
            </div>

            <div>
              <div class="mb-3 flex items-center justify-between gap-3">
                <h3 class="font-black">Today's chores</h3>
                <span class="rounded-full border border-sun/30 bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">${todaysChores.length}</span>
              </div>
              <div class="grid gap-3">
                ${
                  todaysChores.length
                    ? todaysChores.map((chore) => todayDailyChoreCard(chore)).join("")
                    : emptyState("Nothing assigned for today yet.")
                }
              </div>
            </div>
          </div>
          <div class="mt-5">
            <div class="mb-3 flex items-center justify-between gap-3">
              <h3 class="font-black">Deadline manager</h3>
              <span class="rounded-full border border-stone-200 bg-stone-100 px-3 py-1 text-xs font-black text-stone-600">${activeChores.length}</span>
            </div>
            <div class="grid gap-3">
              ${
                activeChores.length
                  ? html(activeChores, deadlineManagerCard)
                  : emptyState("No open chores need deadlines.")
              }
            </div>
          </div>
        </section>
      </div>
    `
    : "";
}

function dailyPresetCard(preset) {
  return `
    <article class="rounded-md border border-stone-200 bg-stone-50 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h4 class="font-black">${escapeHtml(preset.title)}</h4>
          <p class="mt-1 text-sm leading-6 text-stone-600">${escapeHtml(preset.description)}</p>
          <p class="mt-2 text-xs font-black uppercase tracking-wide text-stone-500">${escapeHtml(preset.category || "DAILY_ROUTINE")}</p>
        </div>
        <span class="shrink-0 rounded-md bg-white px-2.5 py-1 text-sm font-black text-mint shadow-sm">${money(preset.bounty)}</span>
      </div>
      <div class="daily-card-controls mt-4 grid gap-2 sm:grid-cols-[minmax(12rem,1fr)_auto_auto]">
        <select data-daily-target class="focus-ring rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-bold">${childOptions("", true)}</select>
        <button data-action="add-daily-today" data-id="${preset.id}" class="focus-ring rounded-md bg-ink px-3 py-2 text-xs font-black text-white hover:bg-stone-700">Add today</button>
        <button data-action="remove-preset" data-id="${preset.id}" data-title="${escapeHtml(preset.title)}" class="focus-ring rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100">Remove</button>
      </div>
    </article>
  `;
}

function todayDailyChoreCard(chore) {
  const assignee = userById(chore.assigned_to);
  const canRemove = chore.status !== "COMPLETED";
  return `
    <article class="rounded-md border border-stone-200 bg-stone-50 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h4 class="font-black">${escapeHtml(chore.title)}</h4>
          <p class="mt-1 text-sm leading-6 text-stone-600">${escapeHtml(chore.description)}</p>
          <p class="mt-2 text-xs font-black uppercase tracking-wide text-stone-500">${assignee ? escapeHtml(assignee.name) : "Unassigned"} - ${escapeHtml(chore.status.replaceAll("_", " "))} - ${escapeHtml(dateLabel(chore.due_date))}</p>
        </div>
        <span class="shrink-0 rounded-md bg-white px-2.5 py-1 text-sm font-black text-mint shadow-sm">${money(chore.bounty)}</span>
      </div>
      ${deadlineForm(chore)}
      ${
        canRemove
          ? `<button data-action="remove-today-chore" data-id="${chore.id}" data-title="${escapeHtml(chore.title)}" class="focus-ring mt-4 w-full rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100">Remove from today</button>`
          : `<p class="mt-4 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-black text-stone-500">Completed chores stay in history.</p>`
      }
    </article>
  `;
}

function deadlineForm(chore) {
  if (!isAdmin() || chore.status === "COMPLETED") return "";
  return `
    <form class="choreDeadlineForm mt-4 grid gap-2 sm:grid-cols-[1fr_auto]" data-id="${chore.id}">
      <input name="due_date" type="date" value="${escapeHtml(chore.due_date || "")}" class="${FIELD}" aria-label="Chore deadline" />
      <button class="${PRIMARY_BUTTON}">Save deadline</button>
    </form>
  `;
}

function deadlineManagerCard(chore) {
  const assignee = userById(chore.assigned_to);
  return `
    <article class="rounded-md border border-stone-200 bg-stone-50 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h4 class="font-black">${escapeHtml(chore.title)}</h4>
          <p class="mt-1 text-sm leading-6 text-stone-600">${escapeHtml(chore.description)}</p>
          <p class="mt-2 text-xs font-black uppercase tracking-wide text-stone-500">${assignee ? escapeHtml(assignee.name) : "Open bounty"} - ${escapeHtml(chore.status.replaceAll("_", " "))}</p>
        </div>
        <span class="shrink-0 rounded-md bg-white px-2.5 py-1 text-sm font-black text-mint shadow-sm">${money(chore.bounty)}</span>
      </div>
      ${deadlineForm(chore)}
    </article>
  `;
}

function choreColumn(status) {
  const chores = app.state.chores.filter((chore) => chore.status === status);
  const meta = choreStatusMeta[status];
  const body = `
    <div class="grid gap-3">
      ${
        chores.length
          ? chores.map((chore) => choreCard(chore)).join("")
          : `<p class="empty-state rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500">Nothing here right now.</p>`
      }
    </div>
  `;
  if (status === "COMPLETED") {
    return `
      <details class="chore-column rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <summary class="flex cursor-pointer items-center justify-between gap-3 text-lg font-black text-ink">
          <span>${meta.label}</span>
          <span class="rounded-full border px-3 py-1 text-xs font-black ${meta.tone}">${chores.length}</span>
        </summary>
        <div class="mt-4">${body}</div>
      </details>
    `;
  }
  return `
    <section class="chore-column min-h-80 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div class="mb-4 flex items-center justify-between gap-3">
        <h2 class="text-lg font-black">${meta.label}</h2>
        <span class="rounded-full border px-3 py-1 text-xs font-black ${meta.tone}">${chores.length}</span>
      </div>
      ${body}
    </section>
  `;
}

function aiSuggestionPanel() {
  return `
    <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-sm font-black uppercase tracking-[0.18em] text-mint">AI helper</p>
          <h2 class="mt-2 text-xl font-black">Suggest fair FC</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">Uses your API key for one suggestion. The key is not saved.</p>
        </div>
        <span class="rounded-md bg-stone-100 px-2 py-1 text-xs font-black text-stone-700">API key</span>
      </div>
      <form id="aiSuggestForm" class="mt-4 grid gap-3">
        <select name="provider" class="${SELECT}">
          <option value="openai">OpenAI</option>
          <option value="openrouter">OpenRouter</option>
          <option value="google">Google Gemini</option>
        </select>
        <input name="apiKey" type="password" autocomplete="off" class="${FIELD}" placeholder="API key, or leave blank if server env is set" />
        <input name="model" class="${FIELD}" placeholder="Model optional, example gpt-4.1-mini" />
        <select name="useCase" class="${SELECT}">
          <option value="CHORE">Chore bounty</option>
          <option value="DAILY_PRESET">Daily preset</option>
          <option value="GOOD_MARKS">Good marks / achievement</option>
          <option value="MEDICINE">Medicine</option>
          <option value="EXTRA_HELP">Extra help</option>
          <option value="PENALTY">Penalty / bad behavior</option>
        </select>
        <textarea name="description" class="${FIELD}" rows="4" placeholder="Example: science test 92%, helped clean kitchen, or folded laundry for 25 minutes" required></textarea>
        <button class="${MINT_BUTTON}" type="submit">Ask AI</button>
      </form>
      <div id="aiSuggestionResult" class="mt-4"></div>
    </section>
  `;
}

function renderAiSuggestionResult(suggestion) {
  const target = byId("aiSuggestionResult");
  if (!target) return;
  const amount = Number(suggestion.suggested_amount || 0);
  target.innerHTML = `
    <article class="rounded-md border border-mint/20 bg-emerald-50 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <p class="text-xs font-black uppercase tracking-wide text-stone-500">${escapeHtml(suggestion.category)} - ${escapeHtml(suggestion.confidence)} confidence</p>
          <h3 class="mt-1 text-xl font-black">${money(suggestion.suggested_amount)}</h3>
        </div>
        <span class="rounded-md bg-white px-2 py-1 text-xs font-black text-stone-700">${escapeHtml(suggestion.provider || "AI")} - ${escapeHtml(suggestion.model || "model")}</span>
      </div>
      <p class="mt-3 text-sm leading-6 text-stone-700">${escapeHtml(suggestion.reasoning)}</p>
      <p class="mt-2 text-sm font-bold text-stone-600">${escapeHtml(suggestion.parent_note)}</p>
      <div class="mt-3 flex gap-2">
        <button data-action="use-ai-amount" data-target="choreForm" data-amount="${amount}" class="focus-ring rounded-md bg-ink px-3 py-2 text-xs font-black text-white" type="button">Use for chore</button>
        <button data-action="use-ai-amount" data-target="dailyPresetForm" data-amount="${amount}" class="focus-ring rounded-md bg-mint px-3 py-2 text-xs font-black text-white" type="button">Use for preset</button>
      </div>
    </article>
  `;
}

function renderAiSuggestionMessage(message, type = "info") {
  const target = byId("aiSuggestionResult");
  if (!target) return;
  const tone =
    type === "error"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : "border-stone-200 bg-stone-50 text-stone-600";
  target.innerHTML = `<p class="rounded-md border ${tone} p-3 text-sm font-bold">${escapeHtml(message)}</p>`;
}

function choreCard(chore) {
  const assignee = userById(chore.assigned_to);
  const childCanComplete =
    activeUser().role === "USER" &&
    chore.status === "AVAILABLE" &&
    (!chore.assigned_to || chore.assigned_to === activeUser().id);
  const parentCanApprove = isAdmin() && chore.status === "PENDING_APPROVAL";
  return `
    <article class="rounded-md border border-stone-200 bg-stone-50 p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <h3 class="font-black">${escapeHtml(chore.title)}</h3>
          <p class="mt-1 text-sm leading-6 text-stone-600">${escapeHtml(chore.description)}</p>
          ${chore.due_date ? `<p class="mt-2 text-xs font-black uppercase tracking-wide text-stone-500">Due ${escapeHtml(dateLabel(chore.due_date))}</p>` : ""}
        </div>
        <span class="shrink-0 rounded-md bg-white px-2.5 py-1 text-sm font-black text-mint shadow-sm">${money(chore.bounty)}</span>
      </div>
      ${
        assignee
          ? `<p class="mt-3 text-xs font-bold uppercase tracking-wide text-stone-500">Assigned to ${escapeHtml(assignee.name)}</p>`
          : ""
      }
      <div class="mt-4">
        ${
          childCanComplete
            ? `<button data-action="complete-chore" data-id="${chore.id}" class="focus-ring w-full rounded-md bg-mint px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">Finish chore</button>`
            : ""
        }
        ${
          parentCanApprove
            ? `<button data-action="approve-chore" data-id="${chore.id}" class="focus-ring w-full rounded-md bg-ink px-4 py-2 text-sm font-black text-white hover:bg-stone-700">Approve payout</button>`
            : ""
        }
      </div>
    </article>
  `;
}

function adminShopForm() {
  if (!isAdmin()) return "";
  return `
    <details class="mb-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <summary class="cursor-pointer text-sm font-black text-ink">Add reward item</summary>
      <form id="shopForm" class="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_110px_110px_auto]">
        <input name="title" class="${FIELD}" placeholder="Title" required />
        <input name="description" class="${FIELD}" placeholder="Description" required />
        <input name="cost" type="number" min="1" step="1" class="${FIELD}" placeholder="Cost" required />
        <input name="stock" type="number" min="0" step="1" class="${FIELD}" placeholder="Stock" required />
        <button class="${PRIMARY_BUTTON}">Add</button>
      </form>
    </details>
  `;
}

function affordableShopItems() {
  const user = activeUser();
  return app.state.shopItems.filter((item) => user.role === "USER" && user.balance >= item.cost && item.stock > 0);
}

function renderShop() {
  byId("tab-shop").innerHTML = `
    ${adminShopForm()}
    <section class="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div class="grid gap-3 lg:grid-cols-[1fr_220px]">
        <input id="shopSearch" class="${FIELD}" type="search" placeholder="Search rewards" value="${escapeHtml(app.ui.shopQuery)}" />
        <select id="shopFilter" class="${SELECT}">
          <option value="all" ${app.ui.shopFilter === "all" ? "selected" : ""}>All rewards</option>
          <option value="affordable" ${app.ui.shopFilter === "affordable" ? "selected" : ""}>Affordable now</option>
          <option value="available" ${app.ui.shopFilter === "available" ? "selected" : ""}>In stock</option>
          <option value="limited" ${app.ui.shopFilter === "limited" ? "selected" : ""}>Limited stock</option>
        </select>
      </div>
      <p id="shopFilterSummary" class="mt-3 text-xs font-bold uppercase tracking-wide text-stone-500"></p>
    </section>
    <div id="shopGrid" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      ${app.state.shopItems.map((item) => shopCard(item)).join("")}
    </div>
    <p id="shopEmpty" class="empty-state mt-4 hidden rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500">No rewards match those filters.</p>
  `;
}

function shopCard(item) {
  const user = activeUser();
  const outOfStock = item.stock <= 0;
  const affordable = user.balance >= item.cost;
  const canPurchase = user.role === "USER" && affordable && !outOfStock;
  const reason = user.role !== "USER" ? "Parent preview" : outOfStock ? "Out of stock" : affordable ? "Purchase" : "Need more FC";
  const parentControls = isAdmin()
    ? `<button data-action="remove-item" data-id="${item.id}" data-title="${escapeHtml(item.title)}" class="focus-ring mt-2 w-full rounded-md border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700 hover:bg-rose-100">Remove reward</button>`
    : "";

  return `
    <article class="shop-card flex min-h-64 flex-col rounded-lg border border-stone-200 bg-white p-5 shadow-sm" data-search="${escapeHtml(`${item.title} ${item.description}`.toLowerCase())}" data-cost="${Number(item.cost || 0)}" data-stock="${Number(item.stock || 0)}">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-lg font-black">${escapeHtml(item.title)}</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">${escapeHtml(item.description)}</p>
        </div>
        <span class="rounded-md bg-amber-50 px-3 py-1 text-sm font-black text-amber-800">${money(item.cost)}</span>
      </div>
      <div class="mt-auto pt-5">
        <p class="mb-3 text-xs font-bold uppercase tracking-wide text-stone-500">
          Stock: ${item.stock === 999 ? "Infinite" : item.stock}
        </p>
        <button
          data-action="purchase-item"
          data-id="${item.id}"
          ${canPurchase ? "" : "disabled"}
          class="focus-ring w-full rounded-md px-4 py-2 text-sm font-black ${
            canPurchase
              ? "bg-berry text-white hover:bg-pink-900"
              : "cursor-not-allowed bg-stone-200 text-stone-500"
          }"
        >${reason}</button>
        ${parentControls}
      </div>
    </article>
  `;
}

function renderBank() {
  const user = activeUser();
  if (isAdmin()) {
    byId("tab-bank").innerHTML = `
      <div class="grid gap-4">
        <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <h2 class="text-xl font-black">Weekly interest payout</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">Distribute yield to every child with an active savings balance.</p>
          <form id="interestForm" class="mt-5 flex flex-col gap-3 sm:flex-row">
            <input name="interestRate" type="number" min="0.1" step="0.1" value="10" class="focus-ring w-full rounded-md border border-stone-300 px-3 py-2 text-sm sm:max-w-40" />
            <button class="focus-ring rounded-md bg-ink px-4 py-2 text-sm font-black text-white hover:bg-stone-700">Pay interest</button>
          </form>
        </section>

        ${householdUsersSection({
          formId: "userForm",
          description: "Add a child account or another parent profile to the private ledger.",
          includeMonthly: false
        })}
      </div>
    `;
    return;
  }

  const childRequests = (app.state.creditRequests || [])
    .filter((request) => request.userId === user.id)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  const openLoan = Number(user.loan_balance || 0);
  const repayMax = Math.min(user.balance, openLoan);

  byId("tab-bank").innerHTML = `
    <div class="grid gap-4 lg:grid-cols-2">
      <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h2 class="text-xl font-black">Save FC</h2>
        <p class="mt-2 text-sm leading-6 text-stone-600">Move spendable credits into your savings vault.</p>
        <form id="depositForm" class="mt-5 flex flex-col gap-3 sm:flex-row">
          <input name="amount" type="number" min="1" step="1" max="${user.balance}" class="focus-ring w-full rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="Amount" required />
          <button class="focus-ring rounded-md bg-mint px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">Deposit</button>
        </form>
      </section>
      <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h2 class="text-xl font-black">Use savings</h2>
        <p class="mt-2 text-sm leading-6 text-stone-600">Move saved credits back to your spendable balance.</p>
        <form id="withdrawForm" class="mt-5 flex flex-col gap-3 sm:flex-row">
          <input name="amount" type="number" min="1" step="1" max="${user.savings_balance}" class="focus-ring w-full rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="Amount" required />
          <button class="focus-ring rounded-md bg-berry px-4 py-2 text-sm font-black text-white hover:bg-pink-900">Withdraw</button>
        </form>
      </section>
      <details class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
        <summary class="cursor-pointer text-xl font-black text-ink">More money options</summary>
        <div class="mt-5 grid gap-4 lg:grid-cols-2">
          <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 class="text-xl font-black">Ask for extra FC</h2>
            <p class="mt-2 text-sm leading-6 text-stone-600">Use this for things like good marks, extra effort, or a special reason.</p>
            <form id="creditRequestForm" class="mt-5 grid gap-3">
              <input name="amount" type="number" min="1" step="1" class="focus-ring rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="FC amount" required />
              <input name="reason" class="focus-ring rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="Reason" required />
              <button class="focus-ring rounded-md bg-mint px-4 py-2 text-sm font-black text-white hover:bg-emerald-700">Send request</button>
            </form>
          </section>
          <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 class="text-xl font-black">Loan</h2>
            <p class="mt-2 text-sm leading-6 text-stone-600">Borrow now, then repay from spendable FC later.</p>
            <form id="loanRequestForm" class="mt-5 grid gap-3">
              <input name="amount" type="number" min="1" step="1" class="focus-ring rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="Loan amount" required />
              <input name="reason" class="focus-ring rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="Why you need it" required />
              <button class="focus-ring rounded-md bg-ink px-4 py-2 text-sm font-black text-white hover:bg-stone-700">Borrow now</button>
            </form>
            <div class="mt-5 rounded-md border border-stone-200 bg-stone-50 p-4">
              <div class="flex items-center justify-between gap-3">
                <p class="font-black">Current loan</p>
                <span class="font-black text-berry">${money(openLoan)}</span>
              </div>
              <form id="loanRepayForm" class="mt-4 flex flex-col gap-3 sm:flex-row">
                <input name="amount" type="number" min="1" step="1" max="${repayMax}" ${openLoan > 0 ? "" : "disabled"} class="focus-ring w-full rounded-md border border-stone-300 px-3 py-2 text-sm" placeholder="Repay amount" required />
                <button ${openLoan > 0 && repayMax > 0 ? "" : "disabled"} class="focus-ring rounded-md bg-berry px-4 py-2 text-sm font-black text-white hover:bg-pink-900 disabled:cursor-not-allowed disabled:opacity-50">Repay</button>
              </form>
            </div>
          </section>
          <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm lg:col-span-2">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-xl font-black">Requests</h2>
              <span class="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">${childRequests.length} total</span>
            </div>
            <div class="mt-5 grid gap-3">
              ${
                childRequests.length
                  ? childRequests.slice(0, 8).map(requestCard).join("")
                  : `<p class="rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500">No credit or loan requests yet.</p>`
              }
            </div>
          </section>
        </div>
      </details>
    </div>
  `;
}

function renderFinance() {
  const bankContent = capturePanel("tab-bank", renderBank);
  const fundContent = capturePanel("tab-fund", renderFamilyFund);

  byId("tab-finance").innerHTML = `
    <div class="grid gap-4">
      ${bankContent}
      ${fundContent}
    </div>
  `;
}

function requestBadge(status) {
  const tones = {
    PENDING: "border-amber-200 bg-amber-50 text-amber-800",
    APPROVED: "border-emerald-200 bg-emerald-50 text-emerald-800",
    REJECTED: "border-rose-200 bg-rose-50 text-rose-800"
  };
  return `<span class="rounded-full border px-3 py-1 text-xs font-black ${tones[status] || tones.PENDING}">${escapeHtml(status)}</span>`;
}

function requestCard(request, includeActions = false) {
  const typeLabel = request.request_type === "LOAN" ? "Self-service loan" : "Extra credit request";
  return `
    <article class="rounded-md border border-stone-200 bg-stone-50 p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-xs font-black uppercase tracking-wide text-stone-500">${typeLabel}</p>
          <h3 class="mt-1 text-lg font-black">${escapeHtml(request.userName || "Child")} - ${money(request.amount)}</h3>
          <p class="mt-2 text-sm leading-6 text-stone-600">${escapeHtml(request.reason)}</p>
          <p class="mt-2 text-xs font-bold uppercase tracking-wide text-stone-500">${new Date(request.date).toLocaleString()}</p>
        </div>
        <div class="flex shrink-0 flex-col gap-2 sm:items-end">
          ${requestBadge(request.status)}
          ${
            includeActions && request.status === "PENDING"
              ? `<div class="flex gap-2">
                  <button data-action="approve-request" data-id="${request.id}" class="focus-ring rounded-md bg-mint px-3 py-2 text-xs font-black text-white hover:bg-emerald-700">Approve</button>
                  <button data-action="reject-request" data-id="${request.id}" class="focus-ring rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100">Reject</button>
                </div>`
              : ""
          }
        </div>
      </div>
    </article>
  `;
}

function userCreateForm({ formId, includeMonthly = true }) {
  return `
    <form id="${formId}" class="admin-form-grid mt-5 grid gap-3 md:grid-cols-2 ${includeMonthly ? "admin-form-grid-monthly" : "admin-form-grid-compact"}">
      <input name="name" class="${FIELD}" placeholder="Name" required />
      <select name="role" class="${SELECT}">
        <option value="USER">Child</option>
        <option value="ADMIN">Parent</option>
      </select>
      <input name="balance" type="number" min="0" step="1" value="0" class="${FIELD}" placeholder="Liquid" />
      <input name="savings_balance" type="number" min="0" step="1" value="0" class="${FIELD}" placeholder="Savings" />
      ${includeMonthly ? `<input name="monthly_allowance" type="number" min="0" step="1" value="100" class="${FIELD}" placeholder="Monthly" />` : ""}
      <input name="password" type="password" class="${FIELD}" placeholder="Password" required />
      <button class="${MINT_BUTTON}">Add</button>
    </form>
  `;
}

function householdUsersSection({ formId, description, includeMonthly = true, wide = false }) {
  return `
    <section class="${CARD} ${wide ? "xl:col-span-2" : ""}">
      <h2 class="text-xl font-black">Household users</h2>
      <p class="mt-2 text-sm leading-6 text-stone-600">${description}</p>
      ${userCreateForm({ formId, includeMonthly })}
      <div class="mt-5 grid gap-2">${html(app.state.users, userRow)}</div>
    </section>
  `;
}

function userRow(user) {
  const canRemove = user.id !== activeUser().id;
  return `
    <div class="rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
      <form class="userEditForm user-edit-grid grid gap-3" data-id="${user.id}">
        <div>
          <label class="sr-only" for="name-${user.id}">User name</label>
          <input
            id="name-${user.id}"
            name="name"
            value="${escapeHtml(user.name)}"
            class="focus-ring w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm font-black"
            required
          />
          <p class="mt-1 text-xs font-bold uppercase tracking-wide text-stone-500">${user.role === "ADMIN" ? "Parent" : "Child"}</p>
        </div>
        <p class="font-bold text-stone-600">Liquid ${money(user.balance)}</p>
        <p class="font-bold text-stone-600">Savings ${money(user.savings_balance)}</p>
        ${
          user.role === "USER"
            ? `<label class="flex items-center gap-2 text-xs font-black uppercase tracking-wide text-stone-500">Monthly <input name="monthly_allowance" type="number" min="0" step="1" value="${Number(user.monthly_allowance || 0)}" class="focus-ring w-24 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm font-black normal-case tracking-normal text-ink" /></label>`
            : `<span class="text-xs font-bold text-stone-500">Parent account</span>`
        }
        <p class="font-black ${user.role === "ADMIN" ? "text-berry" : "text-mint"}">${user.role}</p>
        <button class="focus-ring rounded-md bg-ink px-3 py-2 text-xs font-black text-white hover:bg-stone-700" type="submit">Save name</button>
        <button
          class="focus-ring rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          data-action="remove-user"
          data-id="${user.id}"
          data-title="${escapeHtml(user.name)}"
          ${canRemove ? "" : "disabled"}
        >Remove</button>
      </form>
    </div>
  `;
}

function childOptions(selectedId = "", includeAll = false) {
  const options = childUsers()
    .map((user) => `<option value="${user.id}" ${user.id === selectedId ? "selected" : ""}>${escapeHtml(user.name)}</option>`)
    .join("");
  return `${includeAll ? `<option value="__all" ${selectedId === "__all" ? "selected" : ""}>For all children</option>` : ""}${options}`;
}

function parentRequestLists() {
  const pendingRequests = (app.state.creditRequests || [])
    .filter((request) => request.status === "PENDING" && request.request_type === "EXTRA_CREDIT")
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const reviewedRequests = (app.state.creditRequests || [])
    .filter((request) => request.status !== "PENDING" && request.request_type === "EXTRA_CREDIT")
    .sort((a, b) => new Date(b.reviewed_at || b.date) - new Date(a.reviewed_at || a.date))
    .slice(0, 4);
  return { pendingRequests, reviewedRequests };
}

function parentAllowancePanel() {
  return `
    <section class="${CARD}">
      <h2 class="text-xl font-black">Monthly credits</h2>
      <p class="mt-2 text-sm leading-6 text-stone-600">Run allowance and assign today's chore routine.</p>
      <div class="mt-5 flex flex-col gap-3 sm:flex-row">
        <button data-action="run-allowance" class="${MINT_BUTTON}">Run this month</button>
        <button data-action="generate-daily" class="${PRIMARY_BUTTON}">Assign today's chores</button>
      </div>
    </section>
  `;
}

function parentRequestsPanel() {
  const { pendingRequests, reviewedRequests } = parentRequestLists();
  return `
    <section class="${CARD}">
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="text-xl font-black">Extra credit requests</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">Approve good-reason requests. Loans stay self-service.</p>
        </div>
        <span class="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">${pendingRequests.length} pending</span>
      </div>
      <div class="mt-5 grid gap-3">
        ${
          pendingRequests.length
            ? html(pendingRequests, (request) => requestCard(request, true))
            : emptyState("No pending extra credit requests.")
        }
      </div>
      ${
        reviewedRequests.length
          ? `<details class="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
              <summary class="cursor-pointer text-sm font-black text-ink">Recent decisions</summary>
              <div class="mt-3 grid gap-3">${html(reviewedRequests, requestCard)}</div>
            </details>`
          : ""
      }
    </section>
  `;
}

function pendingChoreApprovals() {
  return app.state.chores
    .filter((chore) => chore.status === "PENDING_APPROVAL")
    .sort((a, b) => (a.due_date || "").localeCompare(b.due_date || "") || a.title.localeCompare(b.title));
}

function parentChoreApprovalCard(chore) {
  const assignee = userById(chore.assigned_to);
  return `
    <article class="rounded-md border border-stone-200 bg-stone-50 p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p class="text-xs font-black uppercase tracking-wide text-stone-500">${assignee ? escapeHtml(assignee.name) : "Unassigned"}${chore.due_date ? ` &middot; Due ${escapeHtml(dateLabel(chore.due_date))}` : ""}</p>
          <h3 class="mt-1 font-black">${escapeHtml(chore.title)}</h3>
          <p class="mt-1 text-sm leading-6 text-stone-600">${escapeHtml(chore.description)}</p>
        </div>
        <span class="shrink-0 rounded-md bg-emerald-50 px-3 py-1 text-sm font-black text-emerald-800">${money(chore.bounty)}</span>
      </div>
      <button data-action="approve-chore" data-id="${chore.id}" class="${PRIMARY_BUTTON} mt-4 w-full">Approve payout</button>
    </article>
  `;
}

function parentChoreApprovalsPanel() {
  const pending = pendingChoreApprovals();
  return `
    <section class="${CARD} xl:col-span-2">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-xl font-black">Chore approvals</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">Completed chores waiting for parent approval and FC payout.</p>
        </div>
        <span class="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">${pending.length} pending</span>
      </div>
      <div class="mt-5 grid gap-3 md:grid-cols-2">
        ${pending.length ? html(pending, parentChoreApprovalCard) : emptyState("No chores are waiting for approval.", "md:col-span-2")}
      </div>
    </section>
  `;
}

function creditAdjustmentPanel() {
  const balanceRows = childUsers()
    .map(
      (user) => `
        <p class="flex items-center justify-between gap-3 rounded-md bg-stone-50 px-3 py-2 text-sm font-bold text-stone-600">
          <span>${escapeHtml(user.name)}</span>
          <span class="font-black text-ink">${money(user.balance)}</span>
        </p>
      `
    )
    .join("");

  return `
    <section class="${CARD}">
      <h2 class="text-xl font-black">Credit adjustment</h2>
      <p class="mt-2 text-sm leading-6 text-stone-600">Penalty types automatically remove FC. Deductions can only remove credits the child currently has.</p>
      <div class="mt-4 grid gap-2">${balanceRows}</div>
      <form id="adjustmentForm" class="mt-5 grid gap-3 md:grid-cols-2">
        <select name="targetUserId" class="${SELECT}">${childOptions()}</select>
        <select name="direction" class="${SELECT}">
          <option value="add">Add credits</option>
          <option value="remove">Remove credits</option>
        </select>
        <select name="tx_type" class="${SELECT}">
          <option value="EXTRA_CREDIT">Extra credit</option>
          <option value="MEDICINE_CREDIT">Medicine</option>
          <option value="EXTRA_HELP">Extra help</option>
          <option value="BAD_BEHAVIOR">Bad behavior</option>
          <option value="GROUNDED">Grounded</option>
          <option value="BEHAVIOR_DEDUCTION">Other deduction</option>
        </select>
        <input name="amount" type="number" min="1" step="1" class="${FIELD}" placeholder="FC amount" required />
        <input name="reason" class="${FIELD} md:col-span-2" placeholder="Reason shown in ledger" required />
        <button class="focus-ring rounded-md bg-berry px-4 py-2 text-sm font-black text-white hover:bg-pink-900 md:col-span-2">Apply adjustment</button>
      </form>
    </section>
  `;
}

function checkpointPanel() {
  return `
    <section class="${CARD}">
      <h2 class="text-xl font-black">Appreciation checkpoint</h2>
      <p class="mt-2 text-sm leading-6 text-stone-600">Celebrate consistency milestones with explicit recognition and FC.</p>
      <form id="checkpointForm" class="mt-5 grid gap-3 md:grid-cols-[1fr_120px_auto]">
        <select name="targetUserId" class="${SELECT}">${childOptions()}</select>
        <input name="amount" type="number" min="1" step="1" value="25" class="${FIELD}" />
        <input name="title" class="${FIELD} md:col-span-2" placeholder="Checkpoint title" required />
        <button class="focus-ring rounded-md bg-sun px-4 py-2 text-sm font-black text-ink">Award</button>
      </form>
    </section>
  `;
}

function parentToolsPanel() {
  return `
    <details class="${CARD} xl:col-span-2">
      <summary class="cursor-pointer text-xl font-black text-ink">More parent tools</summary>
      <div class="mt-5 grid gap-4 xl:grid-cols-2">
        ${creditAdjustmentPanel()}
        ${checkpointPanel()}
      </div>
    </details>
  `;
}

function renderParentPortal() {
  if (!isAdmin()) {
    setHtml("tab-parent", `
      <section class="${CARD}">
        <h2 class="text-xl font-black">Parent Portal</h2>
        <p class="mt-2 text-sm leading-6 text-stone-600">Switch to Mom & Dad to manage allowance, adjustments, checkpoints, and household members.</p>
      </section>
    `);
    return;
  }

  setHtml("tab-parent", `
    <div class="grid gap-4 xl:grid-cols-2">
      ${parentAllowancePanel()}
      ${parentRequestsPanel()}
      ${parentChoreApprovalsPanel()}
      ${parentToolsPanel()}
    </div>
  `);
}

function renderPlanner() {
  const user = activeUser();
  const visibleReminders = isAdmin()
    ? app.state.reminders
    : app.state.reminders.filter((reminder) => reminder.userId === user.id);
  const openReminders = visibleReminders.filter((reminder) => reminder.status !== "COMPLETED");
  const completedReminders = visibleReminders.filter((reminder) => reminder.status === "COMPLETED");

  byId("tab-planner").innerHTML = `
    <div class="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h2 class="text-xl font-black">Personal rewards and reminders</h2>
        <form id="reminderForm" class="mt-5 grid gap-3">
          ${
            isAdmin()
              ? `<select name="targetUserId" class="${SELECT}">${childOptions()}</select>`
              : ""
          }
          <input name="title" class="${FIELD}" placeholder="Task or reminder" required />
          <input name="description" class="${FIELD}" placeholder="Reminder details" />
          <input name="due_date" type="date" class="${FIELD}" />
          <button class="${PRIMARY_BUTTON}">Create reminder</button>
        </form>
      </section>

      <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div class="flex items-center justify-between gap-3">
          <h2 class="text-xl font-black">Open tasks</h2>
          <span class="rounded-full bg-stone-100 px-3 py-1 text-xs font-black text-stone-700">${openReminders.length} active</span>
        </div>
        <div class="mt-5 grid gap-3">
          ${
            openReminders.length
              ? openReminders.map((reminder) => reminderCard(reminder)).join("")
              : `<p class="rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500">No open personal reminders.</p>`
          }
        </div>
        <h3 class="mt-6 text-sm font-black uppercase tracking-wide text-stone-500">Completed</h3>
        <div class="mt-3 grid gap-2">
          ${
            completedReminders.length
              ? completedReminders.slice(-5).reverse().map((reminder) => `<p class="rounded-md bg-stone-50 p-3 text-sm font-bold text-stone-600">${escapeHtml(reminder.title)} - no FC reward</p>`).join("")
              : `<p class="text-sm font-semibold text-stone-500">No completed personal tasks yet.</p>`
          }
        </div>
      </section>
    </div>
  `;
}

function reminderCard(reminder) {
  const canComplete = activeUser().role === "USER" && reminder.userId === activeUser().id;
  return `
    <article class="rounded-md border border-stone-200 bg-stone-50 p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 class="font-black">${escapeHtml(reminder.title)}</h3>
          <p class="mt-1 text-sm leading-6 text-stone-600">${escapeHtml(reminder.description)}</p>
          <p class="mt-2 text-xs font-bold uppercase tracking-wide text-stone-500">${escapeHtml(reminder.userName)}${reminder.due_date ? ` - Due ${escapeHtml(reminder.due_date)}` : ""}</p>
        </div>
        <span class="rounded-md bg-stone-100 px-3 py-1 text-sm font-black text-stone-700">No FC reward</span>
      </div>
      ${
        canComplete
          ? `<button data-action="complete-reminder" data-id="${reminder.id}" class="${MINT_BUTTON} mt-4 w-full">Mark complete</button>`
          : ""
      }
    </article>
  `;
}

function renderFamilyFund() {
  const fund = app.state.familyFund || { title: "Family Vacation Fund", balance: 0, target: 5000 };
  const progress = Math.min(100, Math.round((fund.balance / Math.max(fund.target, 1)) * 100));
  const user = activeUser();
  const childBalanceNote =
    user.role === "USER"
      ? `<div class="mb-3 grid gap-2 text-sm font-bold text-stone-600 sm:grid-cols-2">
          <p class="rounded-md bg-stone-50 px-3 py-2">Spendable ${money(user.balance)}</p>
          <p class="rounded-md bg-stone-50 px-3 py-2">Saved ${money(user.savings_balance)}</p>
        </div>`
      : "";

  byId("tab-fund").innerHTML = `
    <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div class="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
        <div>
          <p class="text-sm font-black uppercase tracking-[0.18em] text-mint">Common family area</p>
          <h2 class="mt-2 text-2xl font-black">${escapeHtml(fund.title)}</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">Savings contributions move into a shared family pool for vacations and family goals.</p>
          <div class="mt-5 h-4 overflow-hidden rounded-full bg-stone-100">
            <div class="h-full rounded-full bg-mint" style="width: ${progress}%"></div>
          </div>
          <p class="mt-3 text-sm font-black">${money(fund.balance)} of ${money(fund.target)} - ${progress}%</p>
        </div>
        <div>
          ${
            user.role === "USER"
              ? `${childBalanceNote}
                <form id="fundForm" class="grid gap-3">
                  <select name="source" class="${SELECT}">
                    <option value="savings">Use saved FC</option>
                    <option value="liquid">Use spendable FC</option>
                  </select>
                  <input name="amount" type="number" min="1" step="1" class="${FIELD}" placeholder="Contribution amount" required />
                  <button class="focus-ring rounded-md bg-berry px-4 py-2 text-sm font-black text-white hover:bg-pink-900">Contribute</button>
                </form>`
              : `<p class="rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500">Children can contribute savings or liquid FC. Parents can monitor progress here.</p>`
          }
        </div>
      </div>
    </section>
  `;
}

function yearlyMetrics(userId) {
  const year = new Date().getFullYear();
  const transactions = app.state.transactions.filter((tx) => tx.userId === userId && new Date(tx.date).getFullYear() === year);
  const earned = transactions.filter((tx) => EARNED_TX_TYPES.has(tx.tx_type)).reduce((sum, tx) => sum + Math.max(0, tx.amount), 0);
  const spent = transactions.filter((tx) => SPENT_TX_TYPES.has(tx.tx_type)).reduce((sum, tx) => sum + Math.abs(Math.min(0, tx.amount)), 0);
  const saved = transactions.filter((tx) => tx.tx_type === "SAVINGS_DEPOSIT").reduce((sum, tx) => sum + Math.max(0, tx.amount), 0);
  const contributed = transactions.filter((tx) => tx.tx_type === "FAMILY_FUND_CONTRIBUTION").reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const efficiency = earned > 0 ? Math.round(((saved + contributed) / earned) * 100) : 0;

  return { transactions, earned, spent, saved, contributed, efficiency };
}

function renderAwareness() {
  const people = app.state.users;
  if (!app.focusPersonId || !people.some((user) => user.id === app.focusPersonId)) {
    app.focusPersonId = activeUser().id;
  }
  const focused = people.find((user) => user.id === app.focusPersonId) || activeUser();
  const metrics = yearlyMetrics(focused.id);

  byId("tab-awareness").innerHTML = `
    <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 class="text-xl font-black">Yearly financial awareness</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">Monitor how efficiently each person earns, saves, contributes, and spends FC through the year.</p>
        </div>
        <div class="flex gap-2 overflow-x-auto">
          ${people.map((user) => `<button data-action="focus-person" data-id="${user.id}" class="focus-ring shrink-0 rounded-md px-3 py-2 text-sm font-black ${user.id === focused.id ? "bg-ink text-white" : "bg-stone-100 text-stone-700"}">${escapeHtml(user.name)}</button>`).join("")}
        </div>
      </div>
      <div class="mt-5 grid gap-4 md:grid-cols-5">
        ${metricCard("Earned", money(metrics.earned), "Credits created")}
        ${metricCard("Spent", money(metrics.spent), "Purchases and deductions")}
        ${metricCard("Saved", money(metrics.saved), "Vault deposits")}
        ${metricCard("Family fund", money(metrics.contributed), "Common-goal giving")}
        ${metricCard("Efficiency", `${metrics.efficiency}%`, "Saved + contributed / earned")}
      </div>
      <div class="mt-5 rounded-md border border-stone-200 bg-stone-50 p-4">
        <h3 class="font-black">${escapeHtml(focused.name)} signal</h3>
        <p class="mt-2 text-sm leading-6 text-stone-600">${awarenessSignal(metrics)}</p>
      </div>
    </section>
  `;
}

function metricCard(label, value, note) {
  return `
    <article class="rounded-md border border-stone-200 bg-stone-50 p-4">
      <p class="text-xs font-black uppercase tracking-wide text-stone-500">${label}</p>
      <p class="mt-2 text-2xl font-black">${value}</p>
      <p class="mt-1 text-xs font-semibold text-stone-500">${note}</p>
    </article>
  `;
}

function awarenessSignal(metrics) {
  if (metrics.earned === 0) return "No yearly credit activity yet. Start with monthly credits, chores, or a personal task.";
  if (metrics.efficiency >= 50) return "Strong delayed-gratification pattern: a large share of earned FC is going into savings or the family fund.";
  if (metrics.spent > metrics.saved + metrics.contributed) return "Spending is currently ahead of saving. A parent checkpoint or savings goal could help rebalance the pattern.";
  return "Healthy credit use is forming. Keep mixing earning opportunities with visible savings goals.";
}

function personStats(user) {
  const year = new Date().getFullYear();
  const metrics = yearlyMetrics(user.id);
  const transactions = metrics.transactions;
  const months = Array.from({ length: 12 }, (_entry, index) => ({
    label: new Date(year, index, 1).toLocaleString(undefined, { month: "short" }),
    earned: 0,
    spent: 0,
    saved: 0,
    fund: 0
  }));

  transactions.forEach((tx) => {
    const month = new Date(tx.date).getMonth();
    if (EARNED_TX_TYPES.has(tx.tx_type)) months[month].earned += Math.max(0, tx.amount);
    if (PEOPLE_SPENT_TX_TYPES.has(tx.tx_type)) months[month].spent += Math.abs(Math.min(0, tx.amount));
    if (tx.tx_type === "SAVINGS_DEPOSIT") months[month].saved += Math.max(0, tx.amount);
    if (tx.tx_type === "FAMILY_FUND_CONTRIBUTION") months[month].fund += Math.abs(tx.amount);
  });

  const completedChores = app.state.chores.filter((chore) => chore.assigned_to === user.id && chore.status === "COMPLETED").length;
  const pendingChores = app.state.chores.filter((chore) => chore.assigned_to === user.id && chore.status === "PENDING_APPROVAL").length;
  const completedReminders = app.state.reminders.filter((reminder) => reminder.userId === user.id && reminder.status === "COMPLETED").length;
  const openReminders = app.state.reminders.filter((reminder) => reminder.userId === user.id && reminder.status !== "COMPLETED").length;
  const checkpoints = app.state.appreciationCheckpoints.filter((checkpoint) => checkpoint.userId === user.id).length;
  const deductions = transactions
    .filter((tx) => ["BEHAVIOR_DEDUCTION", "BAD_BEHAVIOR", "GROUNDED"].includes(tx.tx_type))
    .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);

  return {
    ...metrics,
    months,
    completedChores,
    pendingChores,
    completedReminders,
    openReminders,
    checkpoints,
    deductions
  };
}

function renderPeopleStats() {
  const people = childUsers();
  if (!people.length) {
    byId("tab-people").innerHTML = `
      <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h2 class="text-xl font-black">People Stats</h2>
        <p class="mt-2 text-sm leading-6 text-stone-600">Add a child profile to start tracking individual FC stats.</p>
      </section>
    `;
    return;
  }

  if (!app.statsPersonId || !people.some((user) => user.id === app.statsPersonId)) {
    const activeChild = people.find((user) => user.id === activeUser().id);
    app.statsPersonId = activeChild ? activeChild.id : people[0].id;
  }

  const selected = people.find((user) => user.id === app.statsPersonId) || people[0];
  const stats = personStats(selected);
  const savingsRate = stats.earned > 0 ? Math.round(((stats.saved + stats.contributed) / stats.earned) * 100) : 0;

  byId("tab-people").innerHTML = `
    <section class="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
      <div class="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p class="text-sm font-black uppercase tracking-[0.18em] text-mint">Individual dashboard</p>
          <h2 class="mt-2 text-2xl font-black">${escapeHtml(selected.name)}</h2>
          <p class="mt-2 text-sm leading-6 text-stone-600">A simplified snapshot of earning, spending, saving, and family-goal contribution.</p>
        </div>
        <div class="flex gap-2 overflow-x-auto rounded-lg border border-stone-200 bg-stone-50 p-2">
          ${people.map((user) => `<button data-action="stats-person" data-id="${user.id}" class="focus-ring shrink-0 rounded-md px-3 py-2 text-sm font-black ${user.id === selected.id ? "bg-ink text-white" : "bg-white text-stone-700"}">${escapeHtml(user.name)}</button>`).join("")}
        </div>
      </div>

      <div class="dashboard-metric-grid mt-5 grid gap-4">
        ${metricCard("Liquid", money(selected.balance), "Spendable FC")}
        ${metricCard("Savings", money(selected.savings_balance), "Personal vault")}
        ${metricCard("Loan", money(selected.loan_balance || 0), "Outstanding balance")}
        ${metricCard("Efficiency", `${savingsRate}%`, "Saved + contributed / earned")}
      </div>

      <div class="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <article class="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <h3 class="font-black">Credit allocation</h3>
          <p class="mt-1 text-sm font-semibold text-stone-500">Where this child's credits are sitting or going this year</p>
          <div class="mt-4">${allocationPieChart(selected, stats)}</div>
        </article>

        <article class="rounded-lg border border-stone-200 bg-stone-50 p-4">
          <h3 class="font-black">Major stats</h3>
          <div class="mt-4 grid gap-3 text-sm">
            <p class="flex justify-between gap-3 font-bold text-stone-600"><span>Earned this year</span><span class="font-black text-mint">${money(stats.earned)}</span></p>
            <p class="flex justify-between gap-3 font-bold text-stone-600"><span>Spent / deducted</span><span class="font-black text-rose-600">${money(stats.spent)}</span></p>
            <p class="flex justify-between gap-3 font-bold text-stone-600"><span>Saved to vault</span><span class="font-black text-sun">${money(stats.saved)}</span></p>
            <p class="flex justify-between gap-3 font-bold text-stone-600"><span>Family fund</span><span class="font-black text-berry">${money(stats.contributed)}</span></p>
            <p class="flex justify-between gap-3 font-bold text-stone-600"><span>Loan balance</span><span class="font-black text-berry">${money(selected.loan_balance || 0)}</span></p>
            <p class="flex justify-between gap-3 font-bold text-stone-600"><span>Monthly FC</span><span class="font-black text-ink">${money(selected.monthly_allowance || 0)}</span></p>
            <p class="flex justify-between gap-3 font-bold text-stone-600"><span>Chores completed</span><span class="font-black text-ink">${stats.completedChores}</span></p>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderGrowth() {
  const plannerContent = capturePanel("tab-planner", renderPlanner);

  byId("tab-growth").innerHTML = `
    <div class="grid gap-4">
      ${plannerContent}
    </div>
  `;
}

function renderInsights() {
  const awarenessContent = capturePanel("tab-awareness", renderAwareness);
  const peopleContent = capturePanel("tab-people", renderPeopleStats);

  byId("tab-insights").innerHTML = `
    <div class="grid gap-4">
      ${awarenessContent}
      ${peopleContent}
    </div>
  `;
}

function allocationPieChart(user, stats) {
  const slices = [
    { label: "Liquid", value: user.balance, color: "#1f9d74" },
    { label: "Savings", value: user.savings_balance, color: "#f6b94b" },
    { label: "Spent", value: stats.spent, color: "#e11d48" },
    { label: "Family fund", value: stats.contributed, color: "#8b3d68" }
  ].filter((slice) => slice.value > 0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0) || 1;
  let offset = 25;

  return `
    <div class="grid gap-4 md:grid-cols-[220px_1fr] md:items-center">
      <svg viewBox="0 0 42 42" role="img" aria-label="Credit allocation pie chart" class="mx-auto h-56 w-56">
        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#e7e5e4" stroke-width="8"></circle>
        ${slices
          .map((slice) => {
            const percent = (slice.value / total) * 100;
            const segment = `<circle cx="21" cy="21" r="15.915" fill="transparent" stroke="${slice.color}" stroke-width="8" stroke-dasharray="${percent} ${100 - percent}" stroke-dashoffset="${offset}" transform="rotate(-90 21 21)"><title>${slice.label}: ${money(slice.value)}</title></circle>`;
            offset -= percent;
            return segment;
          })
          .join("")}
      </svg>
      <div class="grid gap-2">
        ${slices
          .map(
            (slice) => `
              <div class="flex items-center justify-between gap-3 rounded-md bg-white p-3 text-sm font-bold">
                <span class="flex items-center gap-2"><span class="h-3 w-3 rounded-full" style="background:${slice.color}"></span>${slice.label}</span>
                <span>${Math.round((slice.value / total) * 100)}% - ${money(slice.value)}</span>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderLedger() {
  const sorted = [...app.state.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  const txTypes = [...new Set(sorted.map((tx) => tx.tx_type))].sort();
  byId("tab-ledger").innerHTML = `
    <section class="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
      <div class="ledger-filter-grid grid gap-3">
        <input id="ledgerSearch" class="${FIELD}" type="search" placeholder="Search ledger" value="${escapeHtml(app.ui.ledgerQuery)}" />
        <select id="ledgerUser" class="${SELECT}">
          <option value="all" ${app.ui.ledgerUser === "all" ? "selected" : ""}>All people</option>
          ${app.state.users.map((user) => `<option value="${user.id}" ${app.ui.ledgerUser === user.id ? "selected" : ""}>${escapeHtml(user.name)}</option>`).join("")}
        </select>
        <select id="ledgerType" class="${SELECT}">
          <option value="all" ${app.ui.ledgerType === "all" ? "selected" : ""}>All transaction types</option>
          ${txTypes.map((type) => `<option value="${escapeHtml(type)}" ${app.ui.ledgerType === type ? "selected" : ""}>${escapeHtml(type.replaceAll("_", " "))}</option>`).join("")}
        </select>
      </div>
      <p id="ledgerFilterSummary" class="mt-3 text-xs font-bold uppercase tracking-wide text-stone-500"></p>
    </section>
    <section class="overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm">
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-stone-200 text-left text-sm">
          <thead class="bg-stone-50 text-xs font-black uppercase tracking-wide text-stone-500">
            <tr>
              <th class="px-4 py-3">Date</th>
              <th class="px-4 py-3">User</th>
              <th class="px-4 py-3">Type</th>
              <th class="px-4 py-3">Description</th>
              <th class="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-stone-100">
            ${
              sorted.length
                ? sorted.map((tx) => ledgerRow(tx)).join("")
                : `<tr><td colspan="5" class="px-4 py-8 text-center font-semibold text-stone-500">No transactions yet.</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </section>
    <p id="ledgerEmpty" class="empty-state mt-4 hidden rounded-md border border-dashed border-stone-300 p-4 text-sm font-semibold text-stone-500">No ledger entries match those filters.</p>
  `;
}

function ledgerRow(tx) {
  const amountClass = txTone[tx.tx_type] || (tx.amount >= 0 ? "text-emerald-700" : "text-rose-700");
  const amountPrefix = tx.amount > 0 ? "+" : "";
  return `
    <tr class="ledger-row bg-white" data-search="${escapeHtml(`${tx.userName} ${tx.tx_type} ${tx.description}`.toLowerCase())}" data-user="${escapeHtml(tx.userId)}" data-type="${escapeHtml(tx.tx_type)}">
      <td class="whitespace-nowrap px-4 py-3 font-semibold text-stone-600">${new Date(tx.date).toLocaleString()}</td>
      <td class="whitespace-nowrap px-4 py-3 font-bold">${escapeHtml(tx.userName)}</td>
      <td class="whitespace-nowrap px-4 py-3">
        <span class="rounded-md bg-stone-100 px-2 py-1 text-xs font-black text-stone-700">${escapeHtml(tx.tx_type.replaceAll("_", " "))}</span>
      </td>
      <td class="min-w-64 px-4 py-3 text-stone-600">${escapeHtml(tx.description)}</td>
      <td class="whitespace-nowrap px-4 py-3 text-right font-black ${amountClass}">${amountPrefix}${money(tx.amount)}</td>
    </tr>
  `;
}

function commandItems() {
  const tabItems = portal.tabs.map((tab) => ({
    kind: "Tab",
    label: tabLabels[portalMode]?.[tab] || tabLabels.all[tab] || tab,
    description: "Open dashboard view",
    action: "go-tab",
    tab
  }));
  const actionItems = [
    { kind: "Action", label: "Search all", description: "Open the command palette", action: "open-command-palette" },
    { kind: "Action", label: "Toggle theme", description: app.theme === "dark" ? "Switch to light theme" : "Switch to dark theme", action: "toggle-theme" },
    { kind: "Action", label: "History", description: "Open ledger history", action: "go-tab", tab: "ledger" }
  ];
  const chores = app.state.chores.slice(0, 12).map((chore) => ({
    kind: "Chore",
    label: chore.title,
    description: `${chore.status.replaceAll("_", " ")} - ${money(chore.bounty)}`,
    action: "go-tab",
    tab: isAdmin() ? "chore-create" : "chores"
  }));
  const rewards = app.state.shopItems.slice(0, 12).map((item) => ({
    kind: "Reward",
    label: item.title,
    description: `${money(item.cost)} - ${item.stock === 999 ? "Unlimited" : `${item.stock} in stock`}`,
    action: "go-tab",
    tab: "shop"
  }));
  const ledger = app.state.transactions.slice(-12).reverse().map((tx) => ({
    kind: "Ledger",
    label: tx.description,
    description: `${tx.userName} - ${tx.tx_type.replaceAll("_", " ")} - ${money(tx.amount)}`,
    action: "go-tab",
    tab: "ledger"
  }));

  return [...tabItems, ...actionItems, ...chores, ...rewards, ...ledger].filter((item) => !item.tab || portal.tabs.includes(item.tab));
}

function renderCommandPalette() {
  const overlay = byId("commandOverlay");
  const results = byId("commandResults");
  const search = byId("commandSearch");
  if (!overlay || !results || !search) return;
  overlay.classList.toggle("hidden", !app.ui.commandOpen);
  overlay.classList.toggle("flex", app.ui.commandOpen);

  const query = search.value.trim().toLowerCase();
  const matches = commandItems()
    .filter((item) => `${item.kind} ${item.label} ${item.description}`.toLowerCase().includes(query))
    .slice(0, 12);
  results.innerHTML = matches.length
    ? matches
        .map(
          (item) => `
            <button class="command-result focus-ring rounded-md border border-stone-200 bg-stone-50 p-3 text-left" data-action="${item.action}" ${item.tab ? `data-tab-target="${item.tab}"` : ""} type="button">
              <span class="text-xs font-black uppercase tracking-wide text-stone-500">${escapeHtml(item.kind)}</span>
              <span class="mt-1 block font-black">${escapeHtml(item.label)}</span>
              <span class="mt-1 block text-xs font-bold text-stone-500">${escapeHtml(item.description)}</span>
            </button>
          `
        )
        .join("")
    : emptyState("No command results.");
}

function openCommandPalette() {
  app.ui.commandOpen = true;
  renderCommandPalette();
  requestAnimationFrame(() => byId("commandSearch")?.focus());
}

function closeCommandPalette() {
  app.ui.commandOpen = false;
  renderCommandPalette();
}

function setActiveTab(tab) {
  if (!portal.tabs.includes(tab)) return;
  app.activeTab = tab;
  localStorage.setItem(portalStorageKey("tab"), app.activeTab);
  closeCommandPalette();
  render();
}

function applyLiveFilters() {
  applyShopFilters();
  applyLedgerFilters();
}

function applyShopFilters() {
  const cards = [...document.querySelectorAll(".shop-card")];
  if (!cards.length) return;
  const query = app.ui.shopQuery.trim().toLowerCase();
  const filter = app.ui.shopFilter;
  const balance = Number(activeUser().balance || 0);
  let visibleCount = 0;

  cards.forEach((card) => {
    const cost = Number(card.dataset.cost || 0);
    const stock = Number(card.dataset.stock || 0);
    const matchesQuery = !query || card.dataset.search.includes(query);
    const matchesFilter =
      filter === "all" ||
      (filter === "affordable" && activeUser().role === "USER" && balance >= cost && stock > 0) ||
      (filter === "available" && stock > 0) ||
      (filter === "limited" && stock > 0 && stock !== 999);
    const visible = matchesQuery && matchesFilter;
    card.classList.toggle("hidden", !visible);
    if (visible) visibleCount += 1;
  });

  const summary = byId("shopFilterSummary");
  if (summary) summary.textContent = `${visibleCount} of ${cards.length} rewards shown`;
  byId("shopEmpty")?.classList.toggle("hidden", visibleCount > 0);
}

function applyLedgerFilters() {
  const rows = [...document.querySelectorAll(".ledger-row")];
  if (!rows.length) return;
  const query = app.ui.ledgerQuery.trim().toLowerCase();
  let visibleCount = 0;

  rows.forEach((row) => {
    const visible =
      (!query || row.dataset.search.includes(query)) &&
      (app.ui.ledgerUser === "all" || row.dataset.user === app.ui.ledgerUser) &&
      (app.ui.ledgerType === "all" || row.dataset.type === app.ui.ledgerType);
    row.classList.toggle("hidden", !visible);
    if (visible) visibleCount += 1;
  });

  const summary = byId("ledgerFilterSummary");
  if (summary) summary.textContent = `${visibleCount} of ${rows.length} ledger entries shown`;
  byId("ledgerEmpty")?.classList.toggle("hidden", visibleCount > 0);
}

const withUser = (body = {}) => ({ ...body, userId: activeUser().id });
const post = (path, body) => api(path, { method: "POST", body: withUser(body) });
const remove = (path) => api(path, { method: "DELETE", body: withUser() });

const simpleActions = {
  "complete-chore": (id) => [`/api/chores/${id}/complete`, "Chore sent for parent approval."],
  "approve-chore": (id) => [`/api/chores/${id}/approve`, "Chore approved and Family Credits minted."],
  "purchase-item": (id) => [`/api/shop/${id}/purchase`, "Reward purchased."],
  "complete-reminder": (id) => [`/api/reminders/${id}/complete`, "Personal reminder completed."],
  "generate-daily": () => ["/api/tasks/generate-daily", "Today's chores assigned in order."],
  "run-allowance": () => ["/api/allowance/run", "Monthly Family Credits distributed."],
  "approve-request": (id) => [`/api/credit-requests/${id}/approve`, "Request approved and ledger updated."],
  "reject-request": (id) => [`/api/credit-requests/${id}/reject`, "Request rejected."]
};

const formHandlers = {
  choreForm: {
    success: "Chore bounty created.",
    reset: true,
    request: (data) => post("/api/chores", { ...data, bounty: Number(data.bounty), due_date: data.due_date })
  },
  dailyPresetForm: {
    success: "Daily chore preset added.",
    reset: true,
    request: (data) =>
      post("/api/daily-chores/presets", {
        title: data.title,
        description: data.description,
        bounty: Number(data.bounty),
        category: data.category
      })
  },
  shopForm: {
    success: "Reward item added.",
    reset: true,
    request: (data) => post("/api/shop", { ...data, cost: Number(data.cost), stock: Number(data.stock) })
  },
  userForm: userCreateHandler(),
  userFormPortal: userCreateHandler(),
  adjustmentForm: {
    success: "Credit adjustment logged.",
    reset: true,
    request: (data) =>
      post("/api/credits/adjust", {
        targetUserId: data.targetUserId,
        direction: DEDUCTION_TX_TYPES.has(data.tx_type) ? "remove" : data.direction,
        tx_type: data.tx_type,
        amount: Number(data.amount),
        reason: data.reason
      })
  },
  checkpointForm: {
    success: "Appreciation checkpoint awarded.",
    reset: true,
    request: (data) =>
      post("/api/checkpoints", {
        targetUserId: data.targetUserId,
        amount: Number(data.amount),
        title: data.title
      })
  },
  reminderForm: {
    success: "Personal reminder created.",
    reset: true,
    request: (data) =>
      post("/api/reminders", {
        targetUserId: data.targetUserId,
        title: data.title,
        description: data.description,
        due_date: data.due_date
      })
  },
  fundForm: {
    success: "Family fund contribution logged.",
    reset: true,
    request: (data) => post("/api/family-fund/contribute", { source: data.source, amount: Number(data.amount) })
  },
  creditRequestForm: {
    success: "Extra credit request sent to parents.",
    reset: true,
    request: (data) =>
      post("/api/credit-requests", {
        request_type: "EXTRA_CREDIT",
        amount: Number(data.amount),
        reason: data.reason
      })
  },
  loanRequestForm: {
    success: "Loan added to your liquid FC and loan balance.",
    reset: true,
    request: (data) =>
      post("/api/credit-requests", {
        request_type: "LOAN",
        amount: Number(data.amount),
        reason: data.reason
      })
  },
  loanRepayForm: {
    success: "Loan repayment logged.",
    reset: true,
    request: (data) => post("/api/loans/repay", { amount: Number(data.amount) })
  },
  depositForm: {
    success: "Savings deposit complete.",
    request: (data) => post("/api/savings/deposit", { amount: Number(data.amount) })
  },
  withdrawForm: {
    success: "Savings withdrawal complete.",
    request: (data) => post("/api/savings/withdraw", { amount: Number(data.amount) })
  },
  interestForm: {
    success: "Interest paid to savings vaults.",
    request: (data) => post("/api/savings/pay-interest", { interestRate: Number(data.interestRate) })
  }
};

function userCreateHandler() {
  return {
    success: "Household user added.",
    reset: true,
    request: (data) =>
      post("/api/users", {
        name: data.name,
        role: data.role,
        password: data.password,
        balance: Number(data.balance || 0),
        savings_balance: Number(data.savings_balance || 0),
        monthly_allowance: Number(data.monthly_allowance || 0)
      })
  };
}

function userEditHandler(form) {
  return {
    success: "User name updated.",
    request: (data) =>
      api(`/api/users/${form.dataset.id}`, {
        method: "PATCH",
        body: withUser({
          name: data.name,
          monthly_allowance: data.monthly_allowance === undefined ? undefined : Number(data.monthly_allowance || 0)
        })
      })
  };
}

function choreDeadlineHandler(form) {
  return {
    success: "Chore deadline updated.",
    request: (data) =>
      api(`/api/chores/${form.dataset.id}`, {
        method: "PATCH",
        body: withUser({ due_date: data.due_date })
      })
  };
}

async function confirmRemoval({ button, id, title, body, acceptText, success, path }) {
  const confirmed = await confirmDialog({
    title,
    body: `"${button.dataset.title || "this item"}" ${body}`,
    acceptText,
    cancelText: title.includes("user") ? "Keep user" : "Keep reward"
  });

  if (confirmed) {
    runAction(button, () => remove(path(id)), success);
  }
}

document.addEventListener("change", (event) => {
  if (event.target.id === "shopFilter") {
    app.ui.shopFilter = event.target.value;
    applyShopFilters();
    return;
  }

  if (event.target.id === "ledgerUser") {
    app.ui.ledgerUser = event.target.value;
    applyLedgerFilters();
    return;
  }

  if (event.target.id === "ledgerType") {
    app.ui.ledgerType = event.target.value;
    applyLedgerFilters();
    return;
  }

  if (event.target.name === "tx_type" && event.target.closest("#adjustmentForm")) {
    const direction = event.target.form.elements.direction;
    if (direction && DEDUCTION_TX_TYPES.has(event.target.value)) {
      direction.value = "remove";
      direction.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  if (event.target.name === "provider" && event.target.closest("#aiSuggestForm")) {
    const model = event.target.form.elements.model;
    if (model) {
      model.placeholder =
        event.target.value === "openrouter"
          ? "Model optional, example openai/gpt-4o-mini"
          : event.target.value === "google"
            ? "Model optional, example gemini-2.0-flash"
          : "Model optional, example gpt-4.1-mini";
    }
  }
});

document.addEventListener(
  "invalid",
  (event) => {
    event.preventDefault();
    const field = event.target;
    const message = validationMessageFor(field) || "Please check this field.";
    showFieldError(field, message);
    showMessage(message, "error");
  },
  true
);

document.addEventListener("input", (event) => {
  if (event.target.id === "shopSearch") {
    app.ui.shopQuery = event.target.value;
    applyShopFilters();
    return;
  }

  if (event.target.id === "ledgerSearch") {
    app.ui.ledgerQuery = event.target.value;
    applyLedgerFilters();
    return;
  }

  if (event.target.id === "commandSearch") {
    renderCommandPalette();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openCommandPalette();
    return;
  }

  if (event.key === "Escape" && app.ui.commandOpen) {
    closeCommandPalette();
  }
});

document.addEventListener("click", async (event) => {
  if (event.target.closest("#themeToggle")) {
    app.theme = app.theme === "dark" ? "light" : "dark";
    applyTheme();
    renderThemeButton();
    return;
  }

  if (event.target.closest("#commandClose")) {
    closeCommandPalette();
    return;
  }

  if (event.target.id === "commandOverlay") {
    closeCommandPalette();
    return;
  }

  const tabButton = event.target.closest(".tab-button");
  if (tabButton) {
    setActiveTab(tabButton.dataset.tab);
    return;
  }

  const button = event.target.closest("[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  if (action === "open-command-palette") {
    openCommandPalette();
    return;
  }

  if (action === "go-tab") {
    setActiveTab(button.dataset.tabTarget);
    return;
  }

  if (action === "open-ledger") {
    setActiveTab("ledger");
    return;
  }

  if (action === "toggle-theme") {
    app.theme = app.theme === "dark" ? "light" : "dark";
    applyTheme();
    renderThemeButton();
    renderCommandPalette();
    return;
  }

  if (action === "use-ai-amount") {
    const form = byId(button.dataset.target);
    const field = form?.elements?.bounty || form?.elements?.amount;
    if (!field) {
      showMessage("Open the target form first.", "error");
      return;
    }
    form.closest("details")?.setAttribute("open", "");
    field.value = button.dataset.amount || "";
    field.focus();
    showMessage("Suggested FC amount filled in.");
    return;
  }

  if (simpleActions[action]) {
    const [path, success] = simpleActions[action](id);
    runAction(button, () => post(path), success);
    return;
  }

  if (action === "focus-person" || action === "stats-person") {
    const key = action === "focus-person" ? "focusPersonId" : "statsPersonId";
    const storageKey = action === "focus-person" ? "family-credits-focus-person" : "family-credits-stats-person";
    app[key] = id;
    localStorage.setItem(storageKey, id);
    if (app.activeTab === "insights") {
      renderInsights();
    } else if (app.activeTab === "growth") {
      renderGrowth();
    } else {
      action === "focus-person" ? renderAwareness() : renderPeopleStats();
    }
    return;
  }

  if (action === "open-chores") {
    setActiveTab(isAdmin() && portal.tabs.includes("chore-create") ? "chore-create" : "chores");
    return;
  }

  if (action === "add-daily-today") {
    const targetUserId = button.closest("article")?.querySelector("[data-daily-target]")?.value;
    runAction(
      button,
      () => post("/api/daily-chores/today", { presetId: id, targetUserId }),
      "Daily chore added to today's list."
    );
    return;
  }

  if (action === "remove-preset") {
    const confirmed = await confirmDialog({
      title: "Remove preset?",
      body: `"${button.dataset.title || "This preset"}" will be removed from the daily preset library. Today's already-created chores stay untouched.`,
      acceptText: "Remove preset",
      cancelText: "Keep preset"
    });
    if (confirmed) {
      runAction(button, () => remove(`/api/daily-chores/presets/${id}`), "Daily chore preset removed.");
    }
    return;
  }

  if (action === "remove-today-chore") {
    const confirmed = await confirmDialog({
      title: "Remove today's chore?",
      body: `"${button.dataset.title || "This chore"}" will be removed from today's chore list. Completed chores cannot be removed.`,
      acceptText: "Remove chore",
      cancelText: "Keep chore"
    });
    if (confirmed) {
      runAction(button, () => remove(`/api/chores/${id}`), "Chore removed from today's list.");
    }
    return;
  }

  if (action === "remove-item") {
    await confirmRemoval({
      button,
      id,
      title: "Remove reward?",
      body: "will disappear from the shop immediately. Existing ledger history stays untouched.",
      acceptText: "Remove reward",
      success: "Reward removed from the shop.",
      path: (itemId) => `/api/shop/${itemId}`
    });
  }

  if (action === "remove-user") {
    await confirmRemoval({
      button,
      id,
      title: "Remove user?",
      body: "will be removed from the household portal. Existing ledger history stays untouched.",
      acceptText: "Remove user",
      success: "Household user removed.",
      path: (userId) => `/api/users/${userId}`
    });
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  if (!validateForm(form)) return;

  if (form.id === "aiSuggestForm") {
    const data = Object.fromEntries(new FormData(form).entries());
    const submitButton = form.querySelector("button[type='submit']");
    if (app.pending) return;
    app.pending = true;
    const original = submitButton?.textContent || "";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Working...";
    }
    renderAiSuggestionMessage("Asking AI...");
    try {
      const payload = await api("/api/ai/suggest", {
        method: "POST",
        body: withUser({
            apiKey: data.apiKey,
            provider: data.provider,
            model: data.model,
            useCase: data.useCase,
            description: data.description
        }),
        skipState: true
      });
      renderAiSuggestionResult(payload.suggestion);
      showMessage("AI suggestion ready.");
    } catch (error) {
      renderAiSuggestionMessage(error.message, "error");
      showMessage(error.message, "error");
    } finally {
      app.pending = false;
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = original;
      }
    }
    return;
  }

  const handler = form.classList.contains("userEditForm")
    ? userEditHandler(form)
    : form.classList.contains("choreDeadlineForm")
      ? choreDeadlineHandler(form)
      : formHandlers[form.id];
  if (!handler) return;

  const data = Object.fromEntries(new FormData(form).entries());
  const submitButton = form.querySelector("button[type='submit'], button:not([type])");
  runAction(submitButton, () => handler.request(data), handler.success).then(() => {
    if (handler.reset) form.reset();
  });
});

loadState().catch((error) => showMessage(error.message, "error"));
