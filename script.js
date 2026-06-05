const places = [
  ...["101", "104", "105", "106", "110", "121", "151", "152"].map((room) => place6(room, "1F")),
  ...["201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212", "213"].map((room) => place6(room, "2F")),
  ...["301", "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312", "313"].map((room) => place6(room, "3F")),
  ...["401", "402", "403", "404"].map((room) => place6(room, "4F")),
  place8("8-1-library", "1F 図書館側スペース", "1F", []),
  place8("8-1-lounge", "1F 交流スペース", "1F", []),
  place8("8-3-library", "3F 図書館側スペース", "3F", []),
  place8("8-3-nine", "3F 9号館側スペース", "3F", []),
  place8("8-4-library", "4F 図書館側スペース", "4F", ["扇風機あり"]),
  place8("8-4-nine", "4F 9号館側スペース", "4F", []),
  place8("8-5-library", "5F 図書館側スペース", "5F", []),
  place8("8-5-nine", "5F 9号館側スペース", "5F", []),
  place8("8-6-library", "6F 図書館側スペース", "6F", ["扇風機あり"]),
  place8("8-6-nine", "6F 9号館側スペース", "6F", []),
];

const quickTags = ["人が少ない", "自習者あり", "授業準備っぽい", "静か", "空調ON", "暑い", "寒い", "混んできた"];
const clientId = localStorage.getItem("tmu-client-id") || crypto.randomUUID();
localStorage.setItem("tmu-client-id", clientId);

const buildingFilter = document.querySelector("#buildingFilter");
const floorFilter = document.querySelector("#floorFilter");
const searchInput = document.querySelector("#searchInput");
const availableOnly = document.querySelector("#availableOnly");
const fanOnly = document.querySelector("#fanOnly");
const roomList = document.querySelector("#roomList");
const resultCount = document.querySelector("#resultCount");
const summaryTitle = document.querySelector("#summaryTitle");
const unknownCount = document.querySelector("#unknownCount");
const freeCount = document.querySelector("#freeCount");
const stayingCount = document.querySelector("#stayingCount");
const busyCount = document.querySelector("#busyCount");
const onlineCount = document.querySelector("#onlineCount");
const nightNotice = document.querySelector("#nightNotice");
const buildingCards = document.querySelectorAll("[data-building-card]");

let selectedTagsByPlace = {};
let shared = { reports: {}, onlineUsers: 1, closed: false };

function place6(room, floor) {
  return { id: `6-${room}`, building: "6号館", floor, name: `6号館 ${room}講義室`, fixed: ["講義室"] };
}

function place8(id, name, floor, fixed) {
  return { id, building: "8号館", floor, name: `8号館 ${name}`, fixed: ["交流・自習スペース", ...fixed] };
}

function reportFor(placeId) {
  return shared.reports[placeId] || {
    status: "unknown",
    freeReports: 0,
    sharedReports: 0,
    busyReports: 0,
    staying: 0,
    myStay: false,
    memos: [],
    updatedAt: null,
  };
}

function statusInfo(report) {
  if (report.staying > 0) return { label: "サイト利用者が滞在中", className: "staying" };
  if (report.status === "free") return { label: "空いてる", className: "free" };
  if (report.status === "shared") return { label: "人はいるが使える", className: "shared" };
  if (report.status === "busy") return { label: "使えない", className: "busy" };
  return { label: "不明", className: "unknown" };
}

function formatTime(value) {
  if (!value) return "まだ投稿なし";
  return new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

async function refresh() {
  try {
    const response = await fetch(`/api/state?clientId=${encodeURIComponent(clientId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("共有情報を取得できません");
    shared = await response.json();
    render();
  } catch {
    nightNotice.classList.add("closed");
    nightNotice.innerHTML = "<strong>共有サーバーに接続できません</strong><span>接続を確認して、ページを更新してください。</span>";
  }
}

async function sendAction(action, placeId = "", extra = {}) {
  try {
    const response = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, placeId, action, ...extra }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    shared = result;
    render();
  } catch (error) {
    alert(error.message || "投稿できませんでした");
  }
}

function populateFloors() {
  const building = buildingFilter.value;
  const floors = [...new Set(places.filter((place) => building === "all" || place.building === building).map((place) => place.floor))];
  const current = floorFilter.value;
  floorFilter.innerHTML = `<option value="all">すべて</option>${floors.map((floor) => `<option value="${floor}">${floor}</option>`).join("")}`;
  floorFilter.value = floors.includes(current) ? current : "all";
}

function matchesFilters(place) {
  const info = statusInfo(reportFor(place.id));
  const keyword = searchInput.value.trim().toLowerCase();
  const text = `${place.name} ${place.building} ${place.floor} ${place.fixed.join(" ")}`.toLowerCase();
  return (
    (buildingFilter.value === "all" || place.building === buildingFilter.value) &&
    (floorFilter.value === "all" || place.floor === floorFilter.value) &&
    (!keyword || text.includes(keyword)) &&
    (!availableOnly.checked || ["free", "shared", "staying"].includes(info.className)) &&
    (!fanOnly.checked || place.fixed.includes("扇風機あり"))
  );
}

function toggleQuickTag(placeId, tag) {
  selectedTagsByPlace[placeId] ||= new Set();
  selectedTagsByPlace[placeId].has(tag) ? selectedTagsByPlace[placeId].delete(tag) : selectedTagsByPlace[placeId].add(tag);
  render();
}

async function addMemo(placeId) {
  const textarea = document.querySelector(`[data-memo-input="${placeId}"]`);
  const text = textarea.value.trim();
  const tags = [...(selectedTagsByPlace[placeId] || [])];
  if (!text && tags.length === 0) return;
  selectedTagsByPlace[placeId] = new Set();
  await sendAction("memo", placeId, { text, tags });
}

function renderNotice() {
  if (shared.closed) {
    nightNotice.classList.add("closed");
    nightNotice.innerHTML = "<strong>夜間停止中</strong><span>0:00-5:00は投稿できません。今日の情報はリセット済みです。</span>";
  } else {
    nightNotice.classList.remove("closed");
    nightNotice.innerHTML = "<strong>今日の共有情報</strong><span>0:00に投稿をリセット。滞在人数は接続中の利用者から集計します。</span>";
  }
}

function renderStats(visiblePlaces) {
  const reports = visiblePlaces.map((place) => reportFor(place.id));
  const statuses = reports.map(statusInfo);
  const available = statuses.filter((info) => ["free", "shared"].includes(info.className)).length;
  const staying = reports.reduce((total, report) => total + report.staying, 0);
  unknownCount.textContent = statuses.filter((info) => info.className === "unknown").length;
  freeCount.textContent = available;
  stayingCount.textContent = staying;
  busyCount.textContent = statuses.filter((info) => info.className === "busy").length;
  onlineCount.textContent = shared.onlineUsers || 0;
  summaryTitle.textContent = `確認された使用可の場所 ${available + statuses.filter((info) => info.className === "staying").length}件`;
}

function render() {
  renderNotice();
  populateFloors();
  const rank = { staying: 0, free: 1, shared: 2, unknown: 3, busy: 4 };
  const visiblePlaces = places.filter(matchesFilters).sort((a, b) => rank[statusInfo(reportFor(a.id)).className] - rank[statusInfo(reportFor(b.id)).className] || a.name.localeCompare(b.name, "ja"));
  resultCount.textContent = `${visiblePlaces.length}件`;
  renderStats(visiblePlaces);
  buildingCards.forEach((card) => card.classList.toggle("dimmed", buildingFilter.value !== "all" && card.dataset.buildingCard !== buildingFilter.value));
  roomList.innerHTML = visiblePlaces.length ? visiblePlaces.map(renderPlace).join("") : `<div class="empty-state">条件に合う場所がありません。</div>`;
}

function renderPlace(place) {
  const report = reportFor(place.id);
  const info = statusInfo(report);
  const disabled = shared.closed ? "disabled" : "";
  const tags = selectedTagsByPlace[place.id] || new Set();
  const fixed = place.fixed.map((item) => `<span class="tag">${item}</span>`).join("");
  const quick = quickTags.map((tag) => `<button type="button" class="quick-tag ${tags.has(tag) ? "active" : ""}" data-tag="${tag}" data-place="${place.id}">${tag}</button>`).join("");
  const memos = report.memos?.length
    ? report.memos.map((memo) => `<div class="memo-text"><div class="memo-tags">${memo.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>${memo.text ? `<p>${escapeHtml(memo.text)}</p>` : ""}<small>${formatTime(memo.at)}</small></div>`).join("")
    : `<p class="memo-text">現地メモはまだありません。</p>`;

  return `<article class="room-card">
    <div class="room-top"><div><div class="room-name">${place.name}</div><div class="room-meta">${place.building}・${place.floor}</div></div><span class="badge ${info.className}">${info.label}</span></div>
    <div class="fixed-info">${fixed}</div>
    <div class="live-row"><div><strong>${report.freeReports || 0}</strong><small>空き報告</small></div><div><strong>${report.staying || 0}</strong><small>サイト利用者</small></div><div><strong>${(report.sharedReports || 0) + (report.busyReports || 0)}</strong><small>人がいる報告</small></div></div>
    <div class="actions">
      <button class="btn-free" data-action="free" data-place="${place.id}" ${disabled}>誰もいない・使える</button>
      <button class="btn-shared" data-action="shared" data-place="${place.id}" ${disabled}>人いる・使える</button>
      <button class="btn-busy" data-action="busy" data-place="${place.id}" ${disabled}>人いる・使えない</button>
      <button class="btn-stay" data-action="stay" data-place="${place.id}" ${disabled}>自分がここにいる</button>
      <button class="btn-leave" data-action="leave" data-place="${place.id}" ${disabled}>退出</button>
    </div>
    <div class="last-update">最終更新: ${formatTime(report.updatedAt)}${report.myStay ? "・あなたは滞在中" : ""}</div>
    <div class="memo-form"><div class="quick-tags">${quick}</div><textarea data-memo-input="${place.id}" placeholder="任意メモ: 知らない人が自習してる、空調ついてる、など" ${disabled}></textarea><button data-action="memo" data-place="${place.id}" ${disabled}>現地メモを追加</button></div>
    ${memos}
  </article>`;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
}

roomList.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  const placeId = target.dataset.place;
  if (target.dataset.tag) return toggleQuickTag(placeId, target.dataset.tag);
  if (target.dataset.action === "memo") return addMemo(placeId);
  sendAction(target.dataset.action, placeId);
});

[floorFilter, buildingFilter, availableOnly, fanOnly].forEach((control) => control.addEventListener("change", render));
searchInput.addEventListener("input", render);

refresh();
setInterval(refresh, 5000);
setInterval(() => sendAction("heartbeat"), 15000);
