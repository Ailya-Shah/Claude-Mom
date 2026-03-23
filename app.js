const STORAGE_KEY = "momTabletTracker.v1";
const DAYS_PER_BATCH = 180;
const DAILY_DOSE_TARGET = 2;
const DEFAULT_TIMELINE_START_KEY = "2026-03-21";
const DOSE_PLAN = [
  { short: "Full", label: "Full dose" },
  { short: "Half", label: "Half dose" }
];

const state = {
  daysLoaded: 0,
  data: {
    settings: {
      endpoint: "",
      timelineStartDate: ""
    },
    records: {}
  }
};

const calendarRoot = document.getElementById("calendarRoot");
const todayProgress = document.getElementById("todayProgress");
const syncStatus = document.getElementById("syncStatus");
const settingsBtn = document.getElementById("settingsBtn");
const settingsDialog = document.getElementById("settingsDialog");
const settingsForm = document.getElementById("settingsForm");
const endpointInput = document.getElementById("endpointInput");
const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
const jumpTodayBtn = document.getElementById("jumpTodayBtn");
const loadMoreBtn = document.getElementById("loadMoreBtn");
const syncNowBtn = document.getElementById("syncNowBtn");
const deleteOldestBtn = document.getElementById("deleteOldestBtn");

init();

function init() {
  loadLocalData();
  ensureTimelineStartDate();
  endpointInput.value = state.data.settings.endpoint || "";
  renderNextBatch();
  updateTodaySummary();
  setSyncStatus(state.data.settings.endpoint ? "Sync configured" : "Saved locally", state.data.settings.endpoint ? "ok" : "");
  wireEvents();
  registerServiceWorker();

  if (state.data.settings.endpoint) {
    pullRemoteData();
  }
}

function wireEvents() {
  settingsBtn.addEventListener("click", () => settingsDialog.showModal());

  cancelSettingsBtn.addEventListener("click", () => settingsDialog.close());

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const endpoint = (endpointInput.value || "").trim();
    state.data.settings.endpoint = endpoint;
    persistLocalData();
    settingsDialog.close();

    if (!endpoint) {
      setSyncStatus("Saved locally", "");
      return;
    }

    setSyncStatus("Checking endpoint...", "warn");
    const ok = await pingEndpoint(endpoint);
    if (ok) {
      setSyncStatus("Sync configured", "ok");
      await pushAllLocalToRemote();
      await pullRemoteData();
    } else {
      setSyncStatus("Could not connect to sync endpoint", "warn");
    }
  });

  jumpTodayBtn.addEventListener("click", () => {
    const todayKey = toDateKey(new Date());
    const todayCard = document.querySelector(`[data-date='${todayKey}']`);
    if (todayCard) {
      todayCard.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  loadMoreBtn.addEventListener("click", () => {
    renderNextBatch();
  });

  deleteOldestBtn.addEventListener("click", async () => {
    const removedKeys = deleteOldestInventories(10);
    if (!removedKeys.length) {
      setSyncStatus("No old inventory found to delete.", "warn");
      return;
    }

    setSyncStatus(`Deleted ${removedKeys.length} oldest inventory records.`, "ok");

    if (state.data.settings.endpoint) {
      await deleteRemoteRecords(removedKeys);
    }
  });

  syncNowBtn.addEventListener("click", async () => {
    if (!state.data.settings.endpoint) {
      setSyncStatus("No endpoint set. Using local save only.", "warn");
      return;
    }

    setSyncStatus("Syncing...", "warn");
    await pushAllLocalToRemote();
    await pullRemoteData();
  });
}

function renderNextBatch() {
  const timelineStart = parseDateKey(state.data.settings.timelineStartDate) || new Date();
  const endOffset = state.daysLoaded + DAYS_PER_BATCH;
  const fragment = document.createDocumentFragment();
  let currentMonthNode = null;
  let currentMonthKey = "";

  for (let offset = state.daysLoaded; offset < endOffset; offset += 1) {
    const date = addDays(timelineStart, offset);
    const dateKey = toDateKey(date);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    if (monthKey !== currentMonthKey) {
      currentMonthNode = buildMonthBlock(date);
      fragment.appendChild(currentMonthNode);
      currentMonthKey = monthKey;
    }

    currentMonthNode.querySelector(".month-days").appendChild(buildDayCard(date, dateKey));
  }

  calendarRoot.appendChild(fragment);
  state.daysLoaded = endOffset;
}

function buildMonthBlock(date) {
  const month = document.createElement("section");
  month.className = "month-block";

  const title = document.createElement("h2");
  title.className = "month-title";
  title.textContent = date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });

  const days = document.createElement("div");
  days.className = "month-days";

  month.appendChild(title);
  month.appendChild(days);
  return month;
}

function buildDayCard(date, dateKey) {
  const card = document.createElement("article");
  card.className = "day-card";
  card.dataset.date = dateKey;

  if (isSameDate(date, new Date())) {
    card.classList.add("today");
  }

  const record = ensureRecord(dateKey);

  const left = document.createElement("div");
  left.className = "day-text";

  const title = document.createElement("h3");
  title.textContent = date.toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short"
  });

  const subtitle = document.createElement("p");
  subtitle.textContent = getCompletionText(record.tablets);
  subtitle.id = `summary-${dateKey}`;

  left.appendChild(title);
  left.appendChild(subtitle);

  const right = document.createElement("div");
  right.className = "tablet-row";

  for (let i = 0; i < DAILY_DOSE_TARGET; i += 1) {
    const label = document.createElement("label");
    label.className = "pill-check";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = Boolean(record.tablets[i]);
    checkbox.setAttribute("aria-label", `${DOSE_PLAN[i].label} for ${dateKey}`);

    checkbox.addEventListener("change", async () => {
      updateTablet(dateKey, i, checkbox.checked);
      if (state.data.settings.endpoint) {
        await pushOneRecord(dateKey);
      }
    });

    const box = document.createElement("span");
    box.textContent = DOSE_PLAN[i].short;

    label.appendChild(checkbox);
    label.appendChild(box);
    right.appendChild(label);
  }

  card.appendChild(left);
  card.appendChild(right);
  return card;
}

function updateTablet(dateKey, tabletIndex, value) {
  const record = ensureRecord(dateKey);
  record.tablets[tabletIndex] = value;
  record.updatedAt = Date.now();
  persistLocalData();

  const subtitle = document.getElementById(`summary-${dateKey}`);
  if (subtitle) {
    subtitle.textContent = getCompletionText(record.tablets);
  }

  checkAndUpdateTimelineStart(dateKey);
  updateTodaySummary();
  setSyncStatus(state.data.settings.endpoint ? "Saved. Waiting for sync." : "Saved locally", state.data.settings.endpoint ? "warn" : "");
}

function updateTodaySummary() {
  const todayKey = toDateKey(new Date());
  const todayRecord = ensureRecord(todayKey);
  const done = todayRecord.tablets.filter(Boolean).length;
  todayProgress.textContent = `Today: ${done} of ${DAILY_DOSE_TARGET} doses done`;
}

function ensureRecord(dateKey) {
  if (!state.data.records[dateKey]) {
    state.data.records[dateKey] = {
      tablets: Array.from({ length: DAILY_DOSE_TARGET }, () => false),
      updatedAt: 0
    };
  } else {
    state.data.records[dateKey].tablets = normalizeTablets(state.data.records[dateKey].tablets);
  }

  return state.data.records[dateKey];
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw);
    if (parsed && parsed.records && parsed.settings) {
      state.data = parsed;
    }
  } catch {
    setSyncStatus("Could not read local data", "warn");
  }
}

function ensureTimelineStartDate() {
  if (state.data.settings.timelineStartDate !== DEFAULT_TIMELINE_START_KEY) {
    state.data.settings.timelineStartDate = DEFAULT_TIMELINE_START_KEY;
    persistLocalData();
  }
}

function persistLocalData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function getCompletionText(tablets) {
  const count = tablets.filter(Boolean).length;
  return `${count} of ${DAILY_DOSE_TARGET} done`;
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateKey(dateKey) {
  if (typeof dateKey !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function addDays(date, days) {
  const clone = new Date(date);
  clone.setDate(clone.getDate() + days);
  return clone;
}

function isSameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function setSyncStatus(message, level = "") {
  syncStatus.textContent = message;
  syncStatus.classList.remove("ok", "warn");
  if (level) {
    syncStatus.classList.add(level);
  }
}

async function pingEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    url.searchParams.set("action", "health");
    const response = await fetch(url.toString());
    return response.ok;
  } catch {
    return false;
  }
}

async function pullRemoteData() {
  const endpoint = state.data.settings.endpoint;
  if (!endpoint) {
    return;
  }

  try {
    setSyncStatus("Loading cloud data...", "warn");
    const url = new URL(endpoint);
    url.searchParams.set("action", "list");
    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error("Sync fetch failed");
    }

    const payload = await response.json();
    if (!payload || !payload.records) {
      throw new Error("Invalid sync payload");
    }

    mergeRecords(payload.records);
    refreshVisibleCards();
    persistLocalData();
    updateTodaySummary();
    setSyncStatus("Synced", "ok");
  } catch {
    setSyncStatus("Sync read failed. Local save still works.", "warn");
  }
}

async function pushOneRecord(dateKey) {
  const endpoint = state.data.settings.endpoint;
  if (!endpoint) {
    return;
  }

  try {
    const record = ensureRecord(dateKey);
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "upsert",
        date: dateKey,
        tablets: record.tablets,
        updatedAt: record.updatedAt
      })
    });

    setSyncStatus("Synced", "ok");
  } catch {
    setSyncStatus("Cloud sync failed. Data saved locally.", "warn");
  }
}

async function pushAllLocalToRemote() {
  const endpoint = state.data.settings.endpoint;
  if (!endpoint) {
    return;
  }

  const entries = Object.entries(state.data.records);
  if (!entries.length) {
    return;
  }

  try {
    setSyncStatus("Pushing local data...", "warn");
    const payload = entries.map(([date, record]) => ({
      date,
      tablets: record.tablets,
      updatedAt: record.updatedAt
    }));

    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "bulkUpsert",
        records: payload
      })
    });

    setSyncStatus("Synced", "ok");
  } catch {
    setSyncStatus("Bulk sync failed. Local data is safe.", "warn");
  }
}

async function deleteRemoteRecords(dateKeys) {
  const endpoint = state.data.settings.endpoint;
  if (!endpoint || !Array.isArray(dateKeys) || !dateKeys.length) {
    return;
  }

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify({
        action: "deleteMany",
        dates: dateKeys
      })
    });
  } catch {
    setSyncStatus("Deleted locally. Cloud delete failed.", "warn");
  }
}

function mergeRecords(remoteRecords) {
  for (const [dateKey, incoming] of Object.entries(remoteRecords)) {
    const current = ensureRecord(dateKey);
    const incomingTime = Number(incoming.updatedAt || 0);
    const currentTime = Number(current.updatedAt || 0);

    if (incomingTime >= currentTime) {
      current.tablets = normalizeTablets(incoming.tablets);
      current.updatedAt = incomingTime;
    }
  }
  checkAndUpdateTimelineStart();
}

function checkAndUpdateTimelineStart(newDateKey) {
  if (state.data.settings.timelineStartDate !== DEFAULT_TIMELINE_START_KEY) {
    state.data.settings.timelineStartDate = DEFAULT_TIMELINE_START_KEY;
    persistLocalData();
    rerenderCalendar();
  }
}

function deleteOldestInventories(limit) {
  const todayKey = toDateKey(new Date());
  const sortedOldKeys = Object.keys(state.data.records)
    .filter((key) => parseDateKey(key) && key < todayKey)
    .sort();

  const keysToDelete = sortedOldKeys.slice(0, Math.max(0, Number(limit) || 0));
  if (!keysToDelete.length) {
    return [];
  }

  keysToDelete.forEach((key) => {
    delete state.data.records[key];
  });

  recalculateTimelineStart();
  persistLocalData();
  rerenderCalendar();
  updateTodaySummary();
  return keysToDelete;
}

function recalculateTimelineStart() {
  state.data.settings.timelineStartDate = DEFAULT_TIMELINE_START_KEY;
}

function rerenderCalendar() {
  calendarRoot.innerHTML = "";
  state.daysLoaded = 0;
  renderNextBatch();
}

function normalizeTablets(input) {
  if (!Array.isArray(input)) {
    return Array.from({ length: DAILY_DOSE_TARGET }, () => false);
  }

  // Old data may have three boxes (Full, Half, Half). Keep Full as-is and merge any Half into one flag.
  return [Boolean(input[0]), Boolean(input[1] || input[2])];
}

function refreshVisibleCards() {
  const cards = calendarRoot.querySelectorAll(".day-card");
  cards.forEach((card) => {
    const dateKey = card.dataset.date;
    if (!dateKey) {
      return;
    }

    const record = ensureRecord(dateKey);
    const checkboxes = card.querySelectorAll("input[type='checkbox']");
    checkboxes.forEach((checkbox, index) => {
      checkbox.checked = Boolean(record.tablets[index]);
    });

    const subtitle = card.querySelector(".day-text p");
    if (subtitle) {
      subtitle.textContent = getCompletionText(record.tablets);
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      setSyncStatus("Offline mode unavailable", "warn");
    });
  });
}
