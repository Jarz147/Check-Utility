const appConfig = {
    rename: {
        /** Double-click nama di sidebar untuk mengubah label (mengupdate checkpointNames). */
        enabled: true,
    },
    add: {
        /** Tombol "Tambah checkpoint" di sidebar; menambah entry ke checkpointPlacements + checkpointNames. */
        enabled: true,
        defaultStatus: "unchecked",
        /** Posisi awal titik baru (px, relatif ke map-container). */
        defaultX: 200,
        defaultY: 200,
    },
};

/** Config nama checkpoint: ubah label di sini (key = id, harus cocok dengan checkpointPlacements). */
const checkpointNames = {
    1: "Assy 1",
    2: "Assy 2",
    3: "Warehouse",
};

const checkpointPlacements = [
    { id: 1, status: "checked", x: 150, y: 120 },
    { id: 2, status: "unchecked", x: 300, y: 250 },
    { id: 3, status: "unchecked", x: 500, y: 180 },
];

const mapContainer = document.getElementById('map-container');
const statusList = document.getElementById('status-list');
const checkpointActionsEl = document.getElementById('checkpoint-actions');

function labelFor(id) {
    return checkpointNames[id] ?? `Checkpoint ${id}`;
}

function nextCheckpointId() {
    const ids = checkpointPlacements.map((p) => p.id);
    return ids.length ? Math.max(...ids) + 1 : 1;
}

function setupCheckpointActions() {
    if (!checkpointActionsEl) return;

    if (!appConfig.add?.enabled) {
        checkpointActionsEl.hidden = true;
        checkpointActionsEl.innerHTML = '';
        return;
    }

    checkpointActionsEl.hidden = false;
    checkpointActionsEl.innerHTML = '';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-add-checkpoint';
    btn.textContent = 'Tambah checkpoint';
    btn.addEventListener('click', () => {
        const name = prompt('Nama checkpoint baru:', '');
        if (name === null) return;
        const trimmed = String(name).trim();
        if (!trimmed) return;

        const id = nextCheckpointId();
        const addCfg = appConfig.add;
        checkpointNames[id] = trimmed;
        checkpointPlacements.push({
            id,
            status: addCfg.defaultStatus === 'checked' ? 'checked' : 'unchecked',
            x: Number(addCfg.defaultX) || 200,
            y: Number(addCfg.defaultY) || 200,
        });
        render();
    });

    checkpointActionsEl.appendChild(btn);
}

function init() {
    setupCheckpointActions();
    render();
}

function render() {
    mapContainer.querySelectorAll('.dot').forEach(d => d.remove());
    statusList.innerHTML = '';

    checkpointPlacements.forEach((placement) => {
        const cp = { ...placement, name: labelFor(placement.id) };

        const dot = document.createElement('div');
        dot.className = `dot ${placement.status}`;
        dot.style.left = `${placement.x}px`;
        dot.style.top = `${placement.y}px`;
        dot.setAttribute('data-name', cp.name);

        dot.addEventListener('dblclick', () => {
            placement.status = placement.status === 'checked' ? 'unchecked' : 'checked';
            render();
        });

        makeDraggable(dot, placement);

        mapContainer.appendChild(dot);

        const item = document.createElement('div');
        item.className = 'status-item';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = cp.name;
        if (appConfig.rename.enabled) {
            nameSpan.className = 'checkpoint-name-editable';
            nameSpan.title = 'Double-click untuk ubah nama';
            nameSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                const current = checkpointNames[placement.id] ?? '';
                const next = prompt('Nama checkpoint:', current);
                if (next !== null && String(next).trim() !== '') {
                    checkpointNames[placement.id] = String(next).trim();
                    render();
                }
            });
        }

        const small = document.createElement('small');
        small.style.color = placement.status === 'checked' ? '#22c55e' : '#ef4444';
        small.textContent = placement.status.toUpperCase();

        item.appendChild(nameSpan);
        item.appendChild(small);
        statusList.appendChild(item);
    });
}

function makeDraggable(elmnt, dataObj) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

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

        let newY = elmnt.offsetTop - pos2;
        let newX = elmnt.offsetLeft - pos1;

        dataObj.x = newX;
        dataObj.y = newY;

        elmnt.style.top = newY + "px";
        elmnt.style.left = newX + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        console.log(`Posisi Baru ${labelFor(dataObj.id)}: X=${dataObj.x}, Y=${dataObj.y}`);
    }
}

init();
