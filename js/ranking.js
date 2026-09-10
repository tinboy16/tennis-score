const state = {
    categories: [],
    players: [],
    rankings: [],
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

        console.log("PLAYERS:", state.players);
        console.log("PLAYER COUNT:", state.players.length);

        renderTabs();

        await renderAll();

        const categorySelect =
            document.getElementById("categorySelect");

        if (categorySelect) {

            categorySelect.addEventListener(
                "change",
                async e => {

                    state.currentCategory = e.target.value;

                    renderTabs();

                    await renderAll();
                }
            );
        }

        const search =
            document.getElementById("search");

        if (search) {

            search.addEventListener("input", e => {

                state.search =
                    e.target.value
                        .trim()
                        .toLowerCase();

                renderTableFromState();
            });
        }

        document
            .querySelectorAll(".filter")
            .forEach(button => {

                button.addEventListener("click", () => {

                    document
                        .querySelectorAll(".filter")
                        .forEach(b =>
                            b.classList.remove("active")
                        );

                    button.classList.add("active");

                    state.filter =
                        button.dataset.filter;

                    renderTableFromState();
                });

            });

        const updatedAt =
            document.getElementById("updatedAt");

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

    const tabs =
        document.getElementById("tabs");

    const select =
        document.getElementById("categorySelect");

    if (tabs) {
        tabs.innerHTML = "";

        const options = [
            { id: "all", name: "Tất cả" },
            ...state.categories
        ];

        options.forEach((item, index) => {

            const button =
                document.createElement("button");

            button.textContent =
                item.id === "all"
                    ? "Tất cả"
                    : `${index}. ${item.name}`;

            button.className =
                state.currentCategory === item.id
                    ? "active"
                    : "";

            button.onclick = async () => {

                state.currentCategory =
                    item.id;

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

        select.innerHTML = options
            .map(item => {

                const label =
                    item.id === "all"
                        ? "Tất cả các bảng"
                        : item.name;

                return `
                    <option value="${escapeHTML(item.id)}">
                        ${escapeHTML(label)}
                    </option>
                `;
            })
            .join("");

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

            const data =
                normalizeRanking(
                    await loadJSON(
                        `data/rankings/${category.id}.json`
                    )
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

    const data =
        normalizeRanking(
            await loadJSON(
                `data/rankings/${state.currentCategory}.json`
            )
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

        const id =
            normalizeId(
                item.playerId ??
                item.id
            );

        if (!id) return;

        if (!map.has(id)) {

            map.set(id, {
                ...item,
                playerId: id,
                categories: [
                    item.categoryId
                ]
            });

        } else {

            const old = map.get(id);

            old.points =
                Math.max(
                    Number(old.points || 0),
                    Number(item.points || 0)
                );

            old.highestPoints =
                Math.max(
                    Number(old.highestPoints || 0),
                    Number(item.highestPoints || 0)
                );

            old.lowestPoints =
                Math.min(
                    Number(
                        old.lowestPoints ??
                        old.points ??
                        0
                    ),
                    Number(
                        item.lowestPoints ??
                        item.points ??
                        0
                    )
                );

            old.wins =
                Number(old.wins || 0) +
                Number(item.wins || 0);

            old.losses =
                Number(old.losses || 0) +
                Number(item.losses || 0);

            old.matches =
                Number(old.matches || 0) +
                Number(item.matches || 0);

            if (
                !old.categories.includes(
                    item.categoryId
                )
            ) {
                old.categories.push(
                    item.categoryId
                );
            }

            if (
                !old.playerName &&
                item.playerName
            ) {
                old.playerName =
                    item.playerName;
            }
        }
    });

    return [...map.values()]
        .sort(
            (a, b) =>
                Number(b.points || 0) -
                Number(a.points || 0)
        );
}

/* =========================
   RENDER ALL
========================= */

async function renderAll() {

    try {

        state.rankings =
            await loadRankings();

        console.log(
            "CURRENT CATEGORY:",
            state.currentCategory
        );

        console.log(
            "RANKINGS:",
            state.rankings
        );

        console.table(
            state.rankings.map(r => ({
                playerId: r.playerId,
                playerName: r.playerName,
                points: r.points
            }))
        );

        renderPodium(
            state.rankings.slice(0, 3)
        );

        renderTableFromState();

        const tableMeta =
            document.getElementById("tableMeta");

        if (tableMeta) {
            tableMeta.textContent =
                `${state.rankings.length} vận động viên`;
        }

        const tableTitle =
            document.getElementById("tableTitle");

        if (tableTitle) {
            tableTitle.textContent =
                getCategoryName();
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

    const id =
        normalizeId(playerId);

    if (!id) return null;

    return state.players.find(p => {

        const pid =
            normalizeId(
                p.id ??
                p.playerId
            );

        return pid === id;
    });
}

/* =========================
   RESOLVE PLAYER
========================= */

function resolvePlayer(ranking) {

    const player =
        findPlayer(
            ranking.playerId
        );

    if (player) {
        return player;
    }

    /*
     * Nếu ID không tìm thấy,
     * dùng playerName trực tiếp
     * trong ranking JSON.
     */
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

    let rows =
        state.rankings.map(
            (ranking, index) => ({

                ranking,

                player:
                    resolvePlayer(ranking),

                index

            })
        );

    if (state.search) {

        rows =
            rows.filter(
                ({
                    player = {},
                    ranking = {}
                }) => {

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

                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();

                    return text.includes(
                        state.search
                    );
                }
            );
    }

    if (state.filter === "up") {

        rows =
            rows.filter(
                ({ ranking }) =>
                    Number(
                        ranking.movement || 0
                    ) > 0
            );
    }

    if (state.filter === "down") {

        rows =
            rows.filter(
                ({ ranking }) =>
                    Number(
                        ranking.movement || 0
                    ) < 0
            );
    }

    return rows;
}

/* =========================
   TABLE
========================= */

function renderTableFromState() {

    const rows =
        getFilteredRows();

    renderTable(rows);

    const tableMeta =
        document.getElementById("tableMeta");

    if (tableMeta) {

        tableMeta.textContent =
            `${rows.length} vận động viên`;
    }
}

function renderTable(rows) {

    const body =
        document.getElementById(
            "rankingBody"
        );

    if (!body) return;

    if (!rows.length) {

        body.innerHTML = `
            <tr>
                <td colspan="8"
                    style="
                        text-align:center;
                        padding:40px;
                        color:#64748b
                    ">
                    Không tìm thấy vận động viên.
                </td>
            </tr>
        `;

        return;
    }

    body.innerHTML =
        rows.map(
            (item, index) => {

                const r =
                    item.ranking || {};

                const p =
                    item.player || {};

                const movement =
                    Number(
                        r.movement || 0
                    );

                let movementHTML = "—";

                if (movement > 0) {
                    movementHTML =
                        `↑ ${movement}`;
                }

                if (movement < 0) {
                    movementHTML =
                        `↓ ${Math.abs(movement)}`;
                }

                const avatar =
                    p.avatar ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        p.name || "VĐV"
                    )}`;

                const minPoints =
                    r.minPoints ??
                    r.lowestPoints ??
                    r.startPoints ??
                    r.points ??
                    0;

                const note =
                    p.note ||
                    movementHTML;

                return `
                    <tr>

                        <td class="stt">
                            ${index + 1}
                        </td>

                        <td>

                            <div class="player-cell">

                                <img
                                    class="player-avatar"
                                    src="${escapeHTML(avatar)}"
                                    alt=""
                                >

                                <div>

                                    <div
                                        class="player-name"
                                    >
                                        ${escapeHTML(
                                            p.name ||
                                            r.playerName ||
                                            "Chưa có tên"
                                        )}
                                    </div>

                                    <div
                                        class="player-club"
                                    >
                                        ${escapeHTML(
                                            p.club ||
                                            p.city ||
                                            ""
                                        )}
                                    </div>

                                </div>

                            </div>

                        </td>

                        <td>
                            <span class="points">
                                ${Number(
                                    r.points || 0
                                )}
                            </span>
                        </td>

                        <td>
                            <span class="min-points">
                                ${Number(
                                    minPoints
                                )}
                            </span>
                        </td>

                        <td>
                            <span class="phone">
                                ${escapeHTML(
                                    p.phone || "—"
                                )}
                            </span>
                        </td>

                        <td>
                            ${escapeHTML(
                                p.court ||
                                p.club ||
                                "—"
                            )}
                        </td>

                        <td>
                            ${escapeHTML(
                                p.company ||
                                "—"
                            )}
                        </td>

                        <td>
                            <span class="note">
                                ${escapeHTML(note)}
                            </span>
                        </td>

                    </tr>
                `;
            }
        ).join("");
}

/* =========================
   PODIUM
========================= */

function renderPodium(topPlayers) {

    const podium =
        document.getElementById(
            "podium"
        );

    if (!podium) return;

    if (!topPlayers.length) {

        podium.innerHTML = "";

        return;
    }

    const medals = [
        "🥇",
        "🥈",
        "🥉"
    ];

    podium.innerHTML =
        topPlayers.map(
            (ranking, index) => {

                const player =
                    resolvePlayer(
                        ranking
                    );

                const avatar =
                    player.avatar ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                        player.name || "VĐV"
                    )}`;

                return `
                    <div
                        class="podium-player ${
                            index === 0
                                ? "first"
                                : ""
                        }"
                    >

                        <div class="podium-rank">
                            ${medals[index]}
                        </div>

                        <img
                            class="podium-avatar"
                            src="${escapeHTML(avatar)}"
                            alt=""
                        >

                        <div class="podium-info">

                            <div
                                class="podium-name"
                            >
                                ${escapeHTML(
                                    player.name ||
                                    ranking.playerName ||
                                    "Chưa có tên"
                                )}
                            </div>

                            <div
                                class="podium-points"
                            >
                                <strong>
                                    ${Number(
                                        ranking.points || 0
                                    )}
                                </strong>
                                điểm
                            </div>

                        </div>

                    </div>
                `;
            }
        ).join("");
}

/* =========================
   CATEGORY NAME
========================= */

function getCategoryName() {

    if (
        state.currentCategory === "all"
    ) {
        return "Tất cả các bảng";
    }

    const category =
        state.categories.find(
            c =>
                c.id ===
                state.currentCategory
        );

    return category
        ? category.name
        : "Bảng điểm";
}

/* =========================
   ERROR
========================= */

function showError(error) {

    const body =
        document.getElementById(
            "rankingBody"
        );

    if (!body) return;

    body.innerHTML = `
        <tr>
            <td
                colspan="8"
                style="
                    text-align:center;
                    padding:40px;
                    color:#dc2626
                "
            >
                Không thể tải dữ liệu ranking.
                <br>
                <small>
                    ${escapeHTML(
                        error.message ||
                        "Lỗi không xác định"
                    )}
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
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );
}

/* =========================
   START
========================= */

init();