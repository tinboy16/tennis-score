const state = {
    categories: [],
    players: [],
    rankings: [],
    filteredRows: [],
    currentCategory: "all",
    filter: "all",
    search: ""
};

async function loadJSON(url) {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
        throw new Error(`Không thể tải ${url} (${response.status})`);
    }

    return await response.json();
}

/* =========================
   NORMALIZE
========================= */

function normalizeId(value) {
    return String(value ?? "")
        .trim()
        .replace(/^["']|["']$/g, "");
}

function normalizePlayer(p) {
    if (!p || typeof p !== "object") return p;

    return {
        ...p,
        id: normalizeId(p.id ?? p.playerId),
        playerId: normalizeId(p.playerId ?? p.id),
        name: String(p.name ?? p.playerName ?? "").trim()
    };
}

function normalizeRanking(data) {
    const arr = Array.isArray(data)
        ? data
        : (data && Array.isArray(data.players) ? data.players : null);

    if (!arr) {
        throw new Error("Cấu trúc file ranking không hợp lệ");
    }

    return arr.map(r => ({
        ...r,

        playerId: normalizeId(
            r.playerId ??
            r.player_id ??
            r.id ??
            r.player?.id
        ),

        playerName: String(
            r.playerName ??
            r.player_name ??
            r.name ??
            r.player?.name ??
            ""
        ).trim()
    }));
}

/* =========================
   NUMBER HELPERS
========================= */

function toNumber(value, fallback = 0) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }

    if (typeof value === "number") {
        return Number.isFinite(value) ? value : fallback;
    }

    let str = String(value).trim();

    if (/^-?\d{1,3}(\.\d{3})+$/.test(str)) {
        str = str.replace(/\./g, "");
    }

    str = str.replace(",", ".");

    const n = Number(str);
    return Number.isFinite(n) ? n : fallback;
}

function formatNumber(value) {
    return toNumber(value).toLocaleString("vi-VN");
}

/* =========================
   INIT
========================= */

async function init() {
    try {

        const [categories, players] = await Promise.all([
            loadJSON("data/categories.json"),
            loadJSON("data/players.json")
        ]);

        state.categories = categories.filter(
            c => c.active !== false
        );

        state.players = players.map(normalizePlayer);

        renderTabs();

        await renderAll();

        const categorySelect =
            document.getElementById("categorySelect");

        if (categorySelect) {
            categorySelect.addEventListener("change", async e => {
                state.currentCategory = e.target.value;
                renderTabs();
                await renderAll();
            });
        }

        const search = document.getElementById("search");

        if (search) {
            search.addEventListener("input", e => {
                state.search = e.target.value.trim().toLowerCase();
                renderTableFromState();
            });
        }

        document.querySelectorAll(".filter").forEach(button => {
            button.addEventListener("click", () => {
                document.querySelectorAll(".filter")
                    .forEach(b => b.classList.remove("active"));

                button.classList.add("active");

                state.filter = button.dataset.filter;

                renderTableFromState();
            });
        });

        bindPlayerModalEvents();

        const updatedAt = document.getElementById("updatedAt");

        if (updatedAt) {
            updatedAt.textContent =
                new Date().toLocaleDateString("vi-VN");
        }

    } catch (error) {
        console.error(error);
        showError(error);
    }
}

/* =========================
   TABS
========================= */

function renderTabs() {

    const tabs = document.getElementById("tabs");
    const select = document.getElementById("categorySelect");

    if (tabs) {
        tabs.innerHTML = "";

        const options = [
            { id: "all", name: "Tất cả" },
            ...state.categories
        ];

        options.forEach((item, index) => {
            const button = document.createElement("button");

            button.textContent =
                item.id === "all"
                    ? "Tất cả"
                    : `${index}. ${item.name}`;

            button.className =
                state.currentCategory === item.id ? "active" : "";

            button.onclick = async () => {
                state.currentCategory = item.id;
                renderTabs();
                await renderAll();
            };

            tabs.appendChild(button);
        });
    }

    if (select) {
        const options = [
            { id: "all", name: "Tất cả các bảng" },
            ...state.categories
        ];

        select.innerHTML = options.map(item => {
            const label =
                item.id === "all" ? "Tất cả các bảng" : item.name;

            return `<option value="${escapeHTML(item.id)}">
                        ${escapeHTML(label)}
                    </option>`;
        }).join("");

        select.value = state.currentCategory;
    }
}

/* =========================
   LOAD RANKING
========================= */

async function loadRankings() {

    if (state.currentCategory === "all") {

        const merged = [];

        for (const category of state.categories) {
            const data = normalizeRanking(
                await loadJSON(`data/rankings/${category.id}.json`)
            );

            data.forEach(item => {
                merged.push({
                    ...item,
                    categoryId: category.id
                });
            });
        }

        return mergeAllRankings(merged);
    }

    const data = normalizeRanking(
        await loadJSON(`data/rankings/${state.currentCategory}.json`)
    );

    return data.map(item => ({
        ...item,
        categoryId: state.currentCategory
    }));
}

/* =========================
   MERGE ALL
========================= */

function mergeAllRankings(data) {

    const map = new Map();

    data.forEach(item => {
        const id = normalizeId(item.playerId ?? item.id);

        if (!id) return;

        if (!map.has(id)) {
            map.set(id, {
                ...item,
                playerId: id,
                categories: [item.categoryId]
            });
        } else {
            const old = map.get(id);

            const oldPoints = toNumber(old.points);
            const newPoints = toNumber(item.points);

            const oldLow =
                old.lowestPoints !== undefined
                    ? toNumber(old.lowestPoints)
                    : oldPoints;

            const newLow =
                item.lowestPoints !== undefined
                    ? toNumber(item.lowestPoints)
                    : newPoints;

            old.points = Math.max(oldPoints, newPoints);

            old.highestPoints = Math.max(
                toNumber(old.highestPoints),
                toNumber(item.highestPoints)
            );

            old.lowestPoints = Math.min(oldLow, newLow);

            old.wins    = toNumber(old.wins)    + toNumber(item.wins);
            old.losses  = toNumber(old.losses)  + toNumber(item.losses);
            old.matches = toNumber(old.matches) + toNumber(item.matches);

            if (!old.categories.includes(item.categoryId)) {
                old.categories.push(item.categoryId);
            }

            if (!old.playerName && item.playerName) {
                old.playerName = item.playerName;
            }
        }
    });

    return [...map.values()].sort(
        (a, b) => toNumber(b.points) - toNumber(a.points)
    );
}

/* =========================
   RENDER ALL
========================= */

async function renderAll() {
    try {
        state.rankings = await loadRankings();

        renderPodium(state.rankings.slice(0, 3));
        renderTableFromState();

        const tableMeta = document.getElementById("tableMeta");
        if (tableMeta) {
            tableMeta.textContent =
                `${state.rankings.length} vận động viên`;
        }

        const tableTitle = document.getElementById("tableTitle");
        if (tableTitle) {
            tableTitle.textContent = getCategoryName();
        }

    } catch (error) {
        console.error(error);
        showError(error);
    }
}

/* =========================
   FIND PLAYER
========================= */

function findPlayer(playerId) {
    const id = normalizeId(playerId);
    if (!id) return null;

    return state.players.find(p => {
        const pid = normalizeId(p.id ?? p.playerId);
        return pid === id;
    });
}

/* =========================
   RESOLVE PLAYER
========================= */

function resolvePlayer(ranking) {

    const player = findPlayer(ranking.playerId);

    if (player) return player;

    if (ranking.playerName) {
        return {
            id: ranking.playerId,
            name: ranking.playerName,
            club: ranking.club || "",
            city: ranking.city || "",
            phone: ranking.phone || "",
            avatar: ranking.avatar || ""
        };
    }

    return {
        id: ranking.playerId,
        name: "Chưa có tên"
    };
}

/* =========================
   FILTER
========================= */

function getFilteredRows() {

    let rows = state.rankings.map((ranking, index) => ({
        ranking,
        player: resolvePlayer(ranking),
        index
    }));

    if (state.search) {
        rows = rows.filter(({ player = {}, ranking = {} }) => {
            const text = [
                player.name,
                player.phone,
                player.court,
                player.company,
                player.note,
                player.club,
                player.city,
                ranking.playerName,
                ranking.points,
                ranking.rank
            ].filter(Boolean).join(" ").toLowerCase();

            return text.includes(state.search);
        });
    }

    if (state.filter === "up") {
        rows = rows.filter(({ ranking }) =>
            toNumber(ranking.movement) > 0);
    }

    if (state.filter === "down") {
        rows = rows.filter(({ ranking }) =>
            toNumber(ranking.movement) < 0);
    }

    return rows;
}

/* =========================
   TABLE
========================= */

function renderTableFromState() {

    const rows = getFilteredRows();

    state.filteredRows = rows;

    renderTable(rows);

    const tableMeta = document.getElementById("tableMeta");
    if (tableMeta) {
        tableMeta.textContent = `${rows.length} vận động viên`;
    }
}

function renderTable(rows) {

    const body = document.getElementById("rankingBody");
    if (!body) return;

    if (!rows.length) {
        body.innerHTML = `
            <tr>
                <td colspan="8"
                    style="text-align:center;padding:40px;color:#64748b">
                    Không tìm thấy vận động viên.
                </td>
            </tr>
        `;
        return;
    }

    body.innerHTML = rows.map((item, index) => {

        const r = item.ranking || {};
        const p = item.player  || {};

        const movement = toNumber(r.movement);

        let movementHTML = "—";
        if (movement > 0) movementHTML = `↑ ${movement}`;
        if (movement < 0) movementHTML = `↓ ${Math.abs(movement)}`;

        const avatar =
            p.avatar ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
                p.name || "VĐV"
            )}`;

        const minPoints = toNumber(
            r.minPoints ??
            r.lowestPoints ??
            r.startPoints ??
            r.points
        );

        const note = p.note || movementHTML;

        return `
            <tr class="ranking-row" data-row="${index}">

                <td class="col-stt stt">
                    ${index + 1}
                </td>

                <td class="col-name">
                    <div class="player-cell">
                        <img
                            class="player-avatar"
                            src="${escapeHTML(avatar)}"
                            alt=""
                        >
                        <div>
                            <div class="player-name">
                                ${escapeHTML(
                                    p.name ||
                                    r.playerName ||
                                    "Chưa có tên"
                                )}
                            </div>
                            <div class="player-club">
                                ${escapeHTML(p.club || p.city || "")}
                            </div>
                        </div>
                    </div>
                </td>

                <td class="col-points">
                    <span class="points">
                        ${formatNumber(r.points)}
                    </span>
                </td>

                <td class="col-min">
                    <span class="min-points">
                        ${formatNumber(minPoints)}
                    </span>
                </td>

                <td class="col-phone">
                    <span class="phone">
                        ${escapeHTML(p.phone || "—")}
                    </span>
                </td>

                <td class="col-court">
                    ${escapeHTML(p.court || p.club || "—")}
                </td>

                <td class="col-company">
                    ${escapeHTML(p.company || "—")}
                </td>

                <td class="col-note">
                    <span class="note">
                        ${escapeHTML(note)}
                    </span>
                </td>

            </tr>
        `;
    }).join("");
}

/* =========================
   PODIUM
========================= */

function renderPodium(topPlayers) {

    const podium = document.getElementById("podium");
    if (!podium) return;

    if (!topPlayers.length) {
        podium.innerHTML = "";
        return;
    }

    const medals = ["🥇", "🥈", "🥉"];

    podium.innerHTML = topPlayers.map((ranking, index) => {

        const player = resolvePlayer(ranking);

        const avatar =
            player.avatar ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(
                player.name || "VĐV"
            )}`;

        return `
            <div class="podium-player ${index === 0 ? "first" : ""}">

                <div class="podium-rank">${medals[index]}</div>

                <img
                    class="podium-avatar"
                    src="${escapeHTML(avatar)}"
                    alt=""
                >

                <div class="podium-info">
                    <div class="podium-name">
                        ${escapeHTML(
                            player.name ||
                            ranking.playerName ||
                            "Chưa có tên"
                        )}
                    </div>
                    <div class="podium-points">
                        <strong>${formatNumber(ranking.points)}</strong>
                        điểm
                    </div>
                </div>

            </div>
        `;
    }).join("");
}

/* =========================
   PLAYER MODAL
========================= */

function openPlayerModal(item) {

    if (!item) return;

    const r = item.ranking || {};
    const p = item.player  || {};

    const modal = document.getElementById("playerModal");
    if (!modal) return;

    const avatar =
        p.avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(
            p.name || r.playerName || "VĐV"
        )}`;

    const minPoints = toNumber(
        r.minPoints ??
        r.lowestPoints ??
        r.startPoints ??
        r.points
    );

    const rank = item.index + 1;

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (!el) return;
        const has =
            val !== undefined &&
            val !== null &&
            String(val).trim() !== "";
        el.textContent = has ? val : "—";
        el.classList.toggle("empty", !has);
    };

    const avatarEl = document.getElementById("pmAvatar");
    if (avatarEl) avatarEl.src = avatar;

    const nameEl = document.getElementById("pmName");
    if (nameEl) nameEl.textContent =
        p.name || r.playerName || "Chưa có tên";

    const clubEl = document.getElementById("pmClub");
    if (clubEl) clubEl.textContent = p.club || p.city || "";

    const rankEl = document.getElementById("pmRank");
    if (rankEl) rankEl.textContent = `#${rank}`;

    const pointsEl = document.getElementById("pmPoints");
    if (pointsEl) pointsEl.textContent = formatNumber(r.points);

    const minEl = document.getElementById("pmMin");
    if (minEl) minEl.textContent = formatNumber(minPoints);

    set("pmPhone",   p.phone);
    set("pmCourt",   p.court || p.club);
    set("pmClub2",   p.club);
    set("pmCity",    p.city);
    set("pmCompany", p.company);
    set("pmNote",    p.note);

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
}

function closePlayerModal() {

    const modal = document.getElementById("playerModal");
    if (!modal) return;

    modal.classList.remove("open");
    document.body.style.overflow = "";
}

function bindPlayerModalEvents() {

    const body = document.getElementById("rankingBody");
    const modal = document.getElementById("playerModal");
    const closeBtn = document.getElementById("playerModalClose");

    if (body) {
        body.addEventListener("click", e => {

            const tr = e.target.closest("tr.ranking-row");
            if (!tr) return;

            const idx = Number(tr.dataset.row);

            const item =
                state.filteredRows &&
                state.filteredRows[idx];

            if (item) openPlayerModal(item);
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", closePlayerModal);
    }

    if (modal) {
        modal.addEventListener("click", e => {
            if (e.target === modal) closePlayerModal();
        });
    }

    document.addEventListener("keydown", e => {
        if (e.key === "Escape") closePlayerModal();
    });
}

/* =========================
   CATEGORY NAME
========================= */

function getCategoryName() {
    if (state.currentCategory === "all") {
        return "Tất cả các bảng";
    }

    const category = state.categories.find(
        c => c.id === state.currentCategory
    );

    return category ? category.name : "Bảng điểm";
}

/* =========================
   ERROR
========================= */

function showError(error) {

    const body = document.getElementById("rankingBody");
    if (!body) return;

    body.innerHTML = `
        <tr>
            <td colspan="8"
                style="text-align:center;padding:40px;color:#dc2626">
                Không thể tải dữ liệu ranking.
                <br>
                <small>
                    ${escapeHTML(error.message || "Lỗi không xác định")}
                </small>
            </td>
        </tr>
    `;
}

/* =========================
   ESCAPE
========================= */

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/* =========================
   START
========================= */

init();