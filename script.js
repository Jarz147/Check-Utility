const appConfig = {
    rename: {
        enabled: true,
    },
    add: {
        enabled: true,
        defaultStatus: "unchecked",
        defaultX: 200,
        defaultY: 200,
    },
    qr: {
        enabled: true,
        size: 88,
        baseUrl: "",
    },
    /**
     * Isi URL + anon key dari Supabase → Project Settings → API.
     * Kosongkan url/anonKey untuk mode lokal (localStorage saja).
     */
    supabase: {
        url: "https://synhvvaolrjxdcbyozld.supabase.co",
        anonKey:
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5bmh2dmFvbHJqeGRjYnlvemxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk5Njg4NzEsImV4cCI6MjA4NTU0NDg3MX0.GSEfz8HVd49uEWXd70taR6FUv243VrFJKn6KlsZW-aQ",
        table: "checkpoints",
    },
};

const STORAGE_KEY = "checkUtilityCheckpointStatus";

const DEFAULT_CHECKPOINT_NAMES = {
    1: "Assy 1",
    2: "Assy 2",
    3: "Warehouse",
};

const DEFAULT_CHECKPOINT_PLACEMENTS = [
    { id: 1, status: "checked", x: 150, y: 120 },
    { id: 2, status: "unchecked", x: 300, y: 250 },
    { id: 3, status: "unchecked", x: 500, y: 180 },
];

let checkpointNames = { ...DEFAULT_CHECKPOINT_NAMES };
let checkpointPlacements = DEFAULT_CHECKPOINT_PLACEMENTS.map((p) => ({ ...p }));

let sbSync = null;

const mapSurface = document.getElementById("map-surface");
const statusList = document.getElementById("status-list");
const checkpointActionsEl = document.getElementById("checkpoint-actions");
const syncStatusEl = document.getElementById("sync-status");

function labelFor(id) {
    return checkpointNames[id] ?? `Checkpoint ${id}`;
}

function statusLabel(status) {
    return status === "checked" ? "Sudah di cek" : "Belum di cek";
}

function normalizeDbStatus(s) {
    return s === "checked" ? "checked" : "unchecked";
}

function setSyncStatus(text, isError) {
    if (!syncStatusEl) {
        return;
    }
    syncStatusEl.textContent = text || "";
    syncStatusEl.classList.toggle("sync-status--error", !!isError);
}

function loadStatusFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        const map = JSON.parse(raw);
        if (!map || typeof map !== "object") {
            return;
        }
        checkpointPlacements.forEach((p) => {
            const s = map[String(p.id)];
            if (s === "checked" || s === "unchecked") {
                p.status = s;
            }
        });
    } catch (_) {
        /* abaikan */
    }
}

function saveStatusToStorage() {
    try {
        const map = {};
        checkpointPlacements.forEach((p) => {
            map[String(p.id)] = p.status;
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    } catch (_) {
        /* abaikan */
    }
}

function persistStatusLocalOnly() {
    if (sbSync) {
        return;
    }
    saveStatusToStorage();
}

function isSupabaseConfigured(cfg) {
    return !!(
        cfg &&
        String(cfg.url || "").trim() &&
        String(cfg.anonKey || "").trim()
    );
}

function createSupabaseSync(cfg) {
    const createClient = window.supabase && window.supabase.createClient;
    if (!createClient) {
        return null;
    }
    const client = createClient(String(cfg.url).trim(), String(cfg.anonKey).trim());
    const table = String(cfg.table || "checkpoints").trim() || "checkpoints";

    return {
        client,
        table,

        async fetchRows() {
            const { data, error } = await client
                .from(table)
                .select("*")
                .order("id", { ascending: true });
            if (error) {
                throw error;
            }
            return data || [];
        },

        async upsertRow(row) {
            const payload = {
                id: row.id,
                name: row.name,
                status: row.status,
                pos_x: row.x,
                pos_y: row.y,
                updated_at: new Date().toISOString(),
            };
            const { error } = await client.from(table).upsert(payload, { onConflict: "id" });
            if (error) {
                throw error;
            }
        },

        async updateRow(id, patch) {
            const dbPatch = { updated_at: new Date().toISOString() };
            if ("name" in patch) {
                dbPatch.name = patch.name;
            }
            if ("status" in patch) {
                dbPatch.status = patch.status;
            }
            if ("x" in patch) {
                dbPatch.pos_x = patch.x;
            }
            if ("y" in patch) {
                dbPatch.pos_y = patch.y;
            }
            const { error } = await client.from(table).update(dbPatch).eq("id", id);
            if (error) {
                throw error;
            }
        },

        subscribe(onPayload) {
            return client
                .channel("checkpoints-app-" + Math.random().toString(36).slice(2))
                .on(
                    "postgres_changes",
                    { event: "*", schema: "public", table },
                    (payload) => {
                        onPayload(payload);
                    }
                )
                .subscribe();
        },
    };
}

function applyRowsFromDb(rows) {
    checkpointPlacements.length = 0;
    Object.keys(checkpointNames).forEach((k) => {
        delete checkpointNames[k];
    });
    for (const row of rows) {
        checkpointPlacements.push({
            id: row.id,
            status: normalizeDbStatus(row.status),
            x: Number(row.pos_x),
            y: Number(row.pos_y),
        });
        checkpointNames[row.id] = row.name;
    }
    checkpointPlacements.sort((a, b) => a.id - b.id);
}

async function seedSupabaseFromDefaults(sync) {
    for (const p of DEFAULT_CHECKPOINT_PLACEMENTS) {
        await sync.upsertRow({
            id: p.id,
            name: DEFAULT_CHECKPOINT_NAMES[p.id] ?? `Checkpoint ${p.id}`,
            status: normalizeDbStatus(p.status),
            x: p.x,
            y: p.y,
        });
    }
}

function subscribeSupabaseRealtime() {
    if (!sbSync) {
        return;
    }
    sbSync.subscribe((payload) => {
        const ev = String(payload.eventType || "").toUpperCase();
        if (ev === "DELETE") {
            const oldRow = payload.old;
            if (!oldRow) {
                return;
            }
            const idx = checkpointPlacements.findIndex((p) => p.id === oldRow.id);
            if (idx !== -1) {
                checkpointPlacements.splice(idx, 1);
                delete checkpointNames[oldRow.id];
                render();
            }
            return;
        }
        const row = payload.new;
        if (!row) {
            return;
        }
        const p = checkpointPlacements.find((x) => x.id === row.id);
        if (p) {
            p.status = normalizeDbStatus(row.status);
            p.x = Number(row.pos_x);
            p.y = Number(row.pos_y);
            checkpointNames[row.id] = row.name;
        } else {
            checkpointPlacements.push({
                id: row.id,
                status: normalizeDbStatus(row.status),
                x: Number(row.pos_x),
                y: Number(row.pos_y),
            });
            checkpointNames[row.id] = row.name;
            checkpointPlacements.sort((a, b) => a.id - b.id);
        }
        render();
    });
}

function buildCheckpointScanUrl(id) {
    const cfg = appConfig.qr?.baseUrl && String(appConfig.qr.baseUrl).trim();
    if (cfg) {
        try {
            const u = new URL(cfg, window.location.href);
            u.searchParams.set("check", String(id));
            return u.toString();
        } catch {
            const hasQuery = cfg.includes("?");
            return `${cfg}${hasQuery ? "&" : "?"}check=${encodeURIComponent(String(id))}`;
        }
    }
    const u = new URL(window.location.href);
    u.searchParams.set("check", String(id));
    return u.toString();
}

async function applyCheckFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("check");
    if (raw === null || raw === "") {
        return false;
    }
    const id = Number(raw);
    if (!Number.isFinite(id)) {
        return false;
    }
    const placement = checkpointPlacements.find((p) => p.id === id);
    if (!placement) {
        return false;
    }

    placement.status = "checked";

    if (sbSync) {
        try {
            await sbSync.updateRow(id, { status: "checked" });
        } catch (e) {
            console.error(e);
            alert("Gagal menyimpan ke Supabase: " + (e.message || String(e)));
            placement.status = "unchecked";
            return false;
        }
    } else {
        saveStatusToStorage();
    }

    params.delete("check");
    const qs = params.toString();
    const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    window.history.replaceState(null, "", next);

    showScanFeedback(labelFor(id));
    return true;
}

function showScanFeedback(name) {
    let el = document.getElementById("scan-feedback");
    if (!el) {
        el = document.createElement("div");
        el.id = "scan-feedback";
        el.className = "scan-feedback";
        document.body.appendChild(el);
    }
    el.textContent = `${name}: tercatat Sudah di cek.`;
    el.classList.add("visible");
    clearTimeout(showScanFeedback._t);
    showScanFeedback._t = setTimeout(() => el.classList.remove("visible"), 4500);
}

function nextCheckpointId() {
    const ids = checkpointPlacements.map((p) => p.id);
    return ids.length ? Math.max(...ids) + 1 : 1;
}

function qrHintText() {
    return sbSync
        ? "Scan dengan HP: status ke Supabase; semua yang membuka halaman ini ikut update (Realtime)."
        : "Scan dengan HP: status tersimpan di browser perangkat itu saja (mode lokal).";
}

function setupCheckpointActions() {
    if (!checkpointActionsEl) {
        return;
    }

    if (!appConfig.add?.enabled) {
        checkpointActionsEl.hidden = true;
        checkpointActionsEl.innerHTML = "";
        return;
    }

    checkpointActionsEl.hidden = false;
    checkpointActionsEl.innerHTML = "";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-add-checkpoint";
    btn.textContent = "Tambah checkpoint";
    btn.addEventListener("click", async () => {
        const name = prompt("Nama checkpoint baru:", "");
        if (name === null) {
            return;
        }
        const trimmed = String(name).trim();
        if (!trimmed) {
            return;
        }

        const id = nextCheckpointId();
        const addCfg = appConfig.add;
        const status = addCfg.defaultStatus === "checked" ? "checked" : "unchecked";
        const x = Number(addCfg.defaultX) || 200;
        const y = Number(addCfg.defaultY) || 200;

        checkpointNames[id] = trimmed;
        checkpointPlacements.push({ id, status, x, y });

        if (sbSync) {
            try {
                await sbSync.upsertRow({ id, name: trimmed, status, x, y });
            } catch (e) {
                console.error(e);
                checkpointPlacements.pop();
                delete checkpointNames[id];
                alert("Gagal menambah ke Supabase: " + (e.message || String(e)));
                return;
            }
        } else {
            persistStatusLocalOnly();
        }
        render();
    });

    checkpointActionsEl.appendChild(btn);
}

async function init() {
    setupCheckpointActions();
    setSyncStatus("Memuat…");

    try {
        if (isSupabaseConfigured(appConfig.supabase)) {
            sbSync = createSupabaseSync(appConfig.supabase);
            if (!sbSync) {
                throw new Error("Library Supabase tidak termuat (createClient).");
            }
            let rows = await sbSync.fetchRows();
            if (rows.length === 0) {
                await seedSupabaseFromDefaults(sbSync);
                rows = await sbSync.fetchRows();
            }
            applyRowsFromDb(rows);
            subscribeSupabaseRealtime();
            setSyncStatus("Terhubung Supabase");
        } else {
            checkpointNames = { ...DEFAULT_CHECKPOINT_NAMES };
            checkpointPlacements = DEFAULT_CHECKPOINT_PLACEMENTS.map((p) => ({ ...p }));
            loadStatusFromStorage();
            setSyncStatus("Mode lokal (tanpa Supabase)");
        }
    } catch (e) {
        console.error(e);
        setSyncStatus("Supabase gagal — pakai lokal: " + (e.message || String(e)), true);
        sbSync = null;
        checkpointNames = { ...DEFAULT_CHECKPOINT_NAMES };
        checkpointPlacements = DEFAULT_CHECKPOINT_PLACEMENTS.map((p) => ({ ...p }));
        loadStatusFromStorage();
    }

    await applyCheckFromUrl();
    render();
}

function render() {
    if (mapSurface) {
        mapSurface.querySelectorAll(".dot").forEach((d) => d.remove());
    }
    statusList.innerHTML = "";

    checkpointPlacements.forEach((placement) => {
        const cp = { ...placement, name: labelFor(placement.id) };

        if (mapSurface) {
            const dot = document.createElement("div");
            dot.className = `dot ${placement.status}`;
            dot.style.left = `${placement.x}px`;
            dot.style.top = `${placement.y}px`;
            dot.setAttribute("data-name", cp.name);

            dot.addEventListener("dblclick", async () => {
                placement.status = placement.status === "checked" ? "unchecked" : "checked";
                if (sbSync) {
                    try {
                        await sbSync.updateRow(placement.id, { status: placement.status });
                    } catch (e) {
                        console.error(e);
                        placement.status = placement.status === "checked" ? "unchecked" : "checked";
                        alert("Gagal update Supabase: " + (e.message || String(e)));
                        return;
                    }
                } else {
                    persistStatusLocalOnly();
                }
                render();
            });

            makeDraggable(dot, placement, () => {
                if (sbSync) {
                    sbSync
                        .updateRow(placement.id, { x: placement.x, y: placement.y })
                        .catch((e) => console.error(e));
                }
            });

            mapSurface.appendChild(dot);
        }

        const item = document.createElement("div");
        item.className = "status-item";

        const head = document.createElement("div");
        head.className = "status-item-head";

        const nameSpan = document.createElement("span");
        nameSpan.textContent = cp.name;
        if (appConfig.rename.enabled) {
            nameSpan.className = "checkpoint-name-editable";
            nameSpan.title = "Double-click untuk ubah nama";
            nameSpan.addEventListener("dblclick", async (e) => {
                e.stopPropagation();
                const current = checkpointNames[placement.id] ?? "";
                const next = prompt("Nama checkpoint:", current);
                if (next !== null && String(next).trim() !== "") {
                    const name = String(next).trim();
                    checkpointNames[placement.id] = name;
                    if (sbSync) {
                        try {
                            await sbSync.updateRow(placement.id, { name });
                        } catch (err) {
                            console.error(err);
                            checkpointNames[placement.id] = current;
                            alert("Gagal simpan nama: " + (err.message || String(err)));
                            return;
                        }
                    }
                    render();
                }
            });
        }

        const small = document.createElement("small");
        small.style.color = placement.status === "checked" ? "#22c55e" : "#ef4444";
        small.textContent = statusLabel(placement.status);

        head.appendChild(nameSpan);
        head.appendChild(small);
        item.appendChild(head);

        if (appConfig.qr?.enabled !== false) {
            const scanUrl = buildCheckpointScanUrl(placement.id);
            const qrWrap = document.createElement("div");
            qrWrap.className = "status-item-qr";

            const qrSize = Number(appConfig.qr?.size) || 88;

            if (typeof QRCode !== "undefined") {
                const qrImg = document.createElement("img");
                qrImg.alt = `QR ${cp.name}`;
                qrImg.width = qrSize;
                qrImg.height = qrSize;
                QRCode.toDataURL(scanUrl, { width: qrSize, margin: 1 }, (err, dataUrl) => {
                    if (!err && dataUrl) {
                        qrImg.src = dataUrl;
                    }
                });
                qrWrap.appendChild(qrImg);
            } else {
                const fallback = document.createElement("a");
                fallback.href = scanUrl;
                fallback.target = "_blank";
                fallback.rel = "noopener noreferrer";
                fallback.className = "status-qr-fallback";
                fallback.textContent = "Buka link cek";
                qrWrap.appendChild(fallback);
            }

            const hint = document.createElement("div");
            hint.className = "status-qr-hint";
            hint.textContent = qrHintText();
            qrWrap.appendChild(hint);
            item.appendChild(qrWrap);
        }

        statusList.appendChild(item);
    });
}

function makeDraggable(elmnt, dataObj, onDragEnd) {
    let pos1 = 0;
    let pos2 = 0;
    let pos3 = 0;
    let pos4 = 0;

    elmnt.onmousedown = dragMouseDown;

    function dragMouseDown(e) {
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
    }

    function elementDrag(e) {
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;

        const newY = elmnt.offsetTop - pos2;
        const newX = elmnt.offsetLeft - pos1;

        dataObj.x = newX;
        dataObj.y = newY;

        elmnt.style.top = `${newY}px`;
        elmnt.style.left = `${newX}px`;
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        console.log(`Posisi Baru ${labelFor(dataObj.id)}: X=${dataObj.x}, Y=${dataObj.y}`);
        if (typeof onDragEnd === "function") {
            onDragEnd();
        }
    }
}

init().catch((e) => console.error(e));
