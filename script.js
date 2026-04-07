const checkpoints = [
    { id: 1, name: "Assy 1", status: "checked", x: 150, y: 120 },
    { id: 2, name: "Assy 2", status: "unchecked", x: 300, y: 250 },
    { id: 3, name: "Warehouse", status: "unchecked", x: 500, y: 180 }
];

const mapContainer = document.getElementById('map-container');
const statusList = document.getElementById('status-list');

function init() {
    render();
}

function render() {
    // Bersihkan tampilan
    mapContainer.querySelectorAll('.dot').forEach(d => d.remove());
    statusList.innerHTML = '';

    checkpoints.forEach(cp => {
        // 1. Buat Titik di Map
        const dot = document.createElement('div');
        dot.className = `dot ${cp.status}`;
        dot.style.left = `${cp.x}px`;
        dot.style.top = `${cp.y}px`;
        dot.setAttribute('data-name', cp.name);
        
        // Klik untuk ganti status
        dot.addEventListener('dblclick', () => {
            cp.status = cp.status === 'checked' ? 'unchecked' : 'checked';
            render();
        });

        // Logika Drag
        makeDraggable(dot, cp);
        
        mapContainer.appendChild(dot);

        // 2. Buat Item di Sidebar
        const item = document.createElement('div');
        item.className = 'status-item';
        item.innerHTML = `
            <span>${cp.name}</span>
            <small style="color: ${cp.status === 'checked' ? '#22c55e' : '#ef4444'}">
                ${cp.status.toUpperCase()}
            </small>
        `;
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
        
        // Hitung posisi baru
        let newY = elmnt.offsetTop - pos2;
        let newX = elmnt.offsetLeft - pos1;

        // Update objek data
        dataObj.x = newX;
        dataObj.y = newY;

        // Update tampilan secara realtime
        elmnt.style.top = newY + "px";
        elmnt.style.left = newX + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
        console.log(`Posisi Baru ${dataObj.name}: X=${dataObj.x}, Y=${dataObj.y}`);
    }
}

init();
