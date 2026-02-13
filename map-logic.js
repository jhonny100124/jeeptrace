let map, userMarker, firebaseDb;
let jeeps = {}; 
let selectedJeepId = null; 
let myJeepId = null; 
let isDriverMode = false;
let isAdminMode = false;

// CONFIG
const ANIMATION_DURATION = 1000;
const JITTER_THRESHOLD = 0.00001; 
const SEND_THRESHOLD = 0.00015; 
let lastSentLat = 0, lastSentLng = 0;

const jeepIcon = L.icon({ iconUrl: 'jeep.png', iconSize: [70, 35], iconAnchor: [35, 17], className: 'jeep-icon' });
const userIcon = L.divIcon({ className: 'user-marker-container', html: '<div class="user-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });

function getSmartLocationName(lat) {
    const l = parseFloat(lat);
    if (l < 9.75) return "Mabinay (Poblacion)";
    if (l < 9.79) return "Paniabonan";
    if (l >= 9.79 && l < 9.86) return "Camingawan";
    if (l >= 9.86 && l < 9.89) return "Oringao";
    if (l >= 9.89 && l < 9.95) return "Tabugon";
    return "Kabankalan City";
}

function initMap() {
    map = L.map('map').setView([9.8518, 122.8859], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
    trackUser();
}

// === UPDATED FIREBASE CONNECTION ===
function connectFirebase() {
    if (firebase.apps.length === 0) firebase.initializeApp(window.firebaseConfig);
    firebaseDb = firebase.database();

    firebaseDb.ref('jeeps').on('value', (snapshot) => {
        const allJeepsData = snapshot.val() || {}; // Handle null if empty

        // 1. UPDATE or ADD markers for existing jeeps
        Object.keys(allJeepsData).forEach(jeepId => {
            updateJeepMarker(jeepId, allJeepsData[jeepId]);
        });

        // 2. REMOVE markers for deleted jeeps (THE FIX)
        Object.keys(jeeps).forEach(localJeepId => {
            if (!allJeepsData[localJeepId]) {
                // If it exists on map but NOT in database -> Kill it
                if(jeeps[localJeepId].marker) map.removeLayer(jeeps[localJeepId].marker);
                delete jeeps[localJeepId];
                console.log("Removed deleted jeep:", localJeepId);
            }
        });
        
        // 3. Update Lists
        if (!selectedJeepId && !isAdminMode) updateActiveUnitList(allJeepsData);
        else if (selectedJeepId) updateSidebarInfo(selectedJeepId);
        
        if (isDriverMode && myJeepId && allJeepsData[myJeepId]) {
            updateDriverUI(allJeepsData[myJeepId].meta.isActive);
        }
        
        if (isAdminMode) {
             loadJeepsTable(allJeepsData);
             populateAdminJeepSelect(allJeepsData);
        }
    });
}

function updateJeepMarker(jeepId, data) {
    if (!data.last) return;
    const lat = parseFloat(data.last.latitude || data.last.lat || 0);
    const lng = parseFloat(data.last.longitude || data.last.lng || 0);
    
    if (lat === 0 || lng === 0) return;

    const locName = getSmartLocationName(lat);
    const isActive = data.meta && data.meta.isActive;

    if (!jeeps[jeepId]) {
        const marker = L.marker([lat, lng], {icon: jeepIcon}).addTo(map);
        marker.on('click', () => selectJeep(jeepId));
        jeeps[jeepId] = { marker: marker, startPos: {lat,lng}, endPos: {lat,lng}, animStartTime: 0, data: data };
        marker.bindTooltip(locName, { permanent: true, direction: 'top', className: 'jeep-tooltip', offset: [0, -30] });
        return;
    }

    const jeepObj = jeeps[jeepId];
    jeepObj.data = data; 
    
    const dist = Math.abs(lat - jeepObj.endPos.lat) + Math.abs(lng - jeepObj.endPos.lng);
    if (dist > JITTER_THRESHOLD) {
        jeepObj.startPos = { lat: jeepObj.marker.getLatLng().lat, lng: jeepObj.marker.getLatLng().lng };
        jeepObj.endPos = { lat, lng };
        jeepObj.animStartTime = Date.now();
        animateJeep(jeepId); 
    }
    jeepObj.marker.setTooltipContent(locName);
    jeepObj.marker.setOpacity(isActive ? 1.0 : 0.4);
}

function animateJeep(jeepId) {
    const jeep = jeeps[jeepId];
    if (!jeep) return;
    const now = Date.now();
    let progress = (now - jeep.animStartTime) / ANIMATION_DURATION;
    if (progress > 1) progress = 1; 
    const currentLat = jeep.startPos.lat + (jeep.endPos.lat - jeep.startPos.lat) * progress;
    const currentLng = jeep.startPos.lng + (jeep.endPos.lng - jeep.startPos.lng) * progress;
    jeep.marker.setLatLng([currentLat, currentLng]);
    const iconEl = jeep.marker.getElement();
    if (iconEl) {
         if (jeep.endPos.lng < jeep.startPos.lng) iconEl.classList.add('jeep-face-left');
         else iconEl.classList.remove('jeep-face-left');
    }
    if (progress < 1) requestAnimationFrame(() => animateJeep(jeepId));
}

function selectJeep(jeepId) {
    selectedJeepId = jeepId;
    const jeep = jeeps[jeepId];
    if (!jeep) return;
    map.flyTo(jeep.marker.getLatLng(), 15, { animate: true, duration: 1.0 });
    updateSidebarInfo(jeepId);
}

function updateSidebarInfo(jeepId) {
    if(isAdminMode) return;
    const jeep = jeeps[jeepId];
    if (!jeep || !jeep.data.meta) return; // Removed jeep handling
    const meta = jeep.data.meta;
    const lat = jeep.data.last.latitude || jeep.data.last.lat;
    document.getElementById('selectedJeepName').textContent = `Unit: ${meta.plate || jeepId}`;
    document.getElementById('displayRouteName').textContent = meta.routeName || '---';
    document.getElementById('plateNumber').textContent = meta.plate || '---';
    document.getElementById('driverName').textContent = meta.driver || '---';
    document.getElementById('currentBarangay').textContent = "Near " + getSmartLocationName(lat);
}

function updateActiveUnitList(allData) {
    const list = document.getElementById('activeUnitList');
    list.innerHTML = '<li class="history-item"><strong>Available Units:</strong></li>';
    if(allData) {
        Object.keys(allData).forEach(id => {
            const meta = allData[id].meta;
            if (meta) {
                const li = document.createElement('li');
                li.className = 'history-item';
                li.innerHTML = `<span><i class="fas fa-bus"></i> ${meta.plate}</span> <span style="font-size:10px; color:${meta.isActive ? 'green' : 'gray'};">${meta.isActive ? 'LIVE' : 'OFFLINE'}</span>`;
                li.onclick = () => selectJeep(id); 
                list.appendChild(li);
            }
        });
    }
}

// === LOGIN SYSTEMS ===
function attemptAdminLogin() {
    const user = document.getElementById('adminUserInput').value.trim();
    const pass = document.getElementById('adminPassInput').value.trim();
    
    if (!user || !pass) { alert("Enter credentials"); return; }

    firebaseDb.ref('admin').once('value').then(snap => {
        const adminData = snap.val();
        if (adminData && user === adminData.username && pass === adminData.password) {
            isAdminMode = true;
            document.getElementById('adminLoginModal').style.display = 'none';
            document.getElementById('publicDashboard').style.display = 'none';
            document.getElementById('adminDashboard').style.display = 'flex';
            loadDriversTable();
            firebaseDb.ref('jeeps').once('value').then(snap => loadJeepsTable(snap.val()));
        } else {
            alert("Invalid Credentials");
        }
    });
}

function attemptLogin() {
    const u = document.getElementById('driverUser').value.trim();
    const p = document.getElementById('driverPinInput').value.trim();

    if (!u || !p) { alert("Enter credentials"); return; }

    firebaseDb.ref(`drivers/${u}`).once('value').then(snap => {
        const d = snap.val();
        if (!d) { alert("User not found"); return; }

        if (d.pin == p) {
            myJeepId = d.assignedJeep; 
            isDriverMode = true;
            
            document.getElementById('driverPanel').style.display = 'flex';
            document.getElementById('loginLinks').style.display = 'none';
            document.getElementById('driverTitle').textContent = d.name;
            closeModal('loginModal'); 
            trackDriverGPS(); 
            selectJeep(myJeepId);
            
            // Check jeep route immediately
            firebaseDb.ref(`jeeps/${myJeepId}/meta`).once('value').then(jsnap => {
                if(jsnap.val()) document.getElementById('routeInput').value = jsnap.val().routeName;
            });

        } else { alert("Incorrect PIN"); }
    });
}

// === DRIVER FEATURES ===
function logoutDriver() {
    isDriverMode = false; myJeepId = null;
    document.getElementById('driverPanel').style.display = 'none';
    document.getElementById('loginLinks').style.display = 'block';
}

function toggleJeepStatus() {
    if (isDriverMode && myJeepId) {
        firebaseDb.ref(`jeeps/${myJeepId}/meta/isActive`).once('value').then(snap => {
            const cur = snap.val();
            const newStatus = !cur;
            firebaseDb.ref(`jeeps/${myJeepId}/meta`).update({ isActive: newStatus });
            firebaseDb.ref(`jeeps/${myJeepId}/last`).update({ status: newStatus ? "active" : "inactive" });
        });
    }
}

function updateDriverUI(isActive) {
    const btn = document.getElementById('driverStatusBtn');
    if (btn) {
        btn.textContent = isActive ? "ACTIVE (Click to Stop)" : "OFFLINE (Click to Start)";
        btn.style.background = isActive ? "#22c55e" : "#ef4444";
        btn.style.color = "white";
    }
}

function saveRoute() {
    const newRoute = document.getElementById('routeInput').value.trim();
    if (isDriverMode && myJeepId && newRoute) {
        firebaseDb.ref(`jeeps/${myJeepId}/meta`).update({ routeName: newRoute })
        .then(() => alert("Route Updated!"));
    }
}

function trackDriverGPS() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(p => {
        if (isDriverMode && myJeepId) {
            firebaseDb.ref(`jeeps/${myJeepId}/meta/isActive`).once('value').then(snap => {
                if (snap.val() === true) {
                    const lat = p.coords.latitude;
                    const lng = p.coords.longitude;
                    const dist = Math.abs(lat - lastSentLat) + Math.abs(lng - lastSentLng);
                    
                    if (dist > SEND_THRESHOLD) {
                        const payload = { 
                            latitude: lat, longitude: lng, 
                            timestamp: Date.now(), 
                            status: "active", 
                            barangay: getSmartLocationName(lat) 
                        };
                        firebaseDb.ref(`jeeps/${myJeepId}/last`).update(payload);
                        firebaseDb.ref(`jeeps/${myJeepId}/history`).push(payload); 
                        lastSentLat = lat; lastSentLng = lng;
                    }
                }
            });
        }
    }, null, { enableHighAccuracy: true });
}

// === ADMIN MANAGEMENT ===
function loadDriversTable() {
    firebaseDb.ref('drivers').on('value', snap => {
        const drivers = snap.val();
        const tbody = document.getElementById('driverTableBody');
        tbody.innerHTML = '';
        if (drivers) {
            Object.keys(drivers).forEach(key => {
                const d = drivers[key];
                tbody.innerHTML += `<tr><td><b>${d.name}</b><br><small>${key}</small></td><td>${d.pin}</td><td>${d.assignedJeep}</td><td><button class="delete-btn" onclick="deleteDriver('${key}')">DEL</button></td></tr>`;
            });
        }
    });
}

function openEditDriverModal() {
    document.getElementById('editDriverModal').style.display = 'flex';
    const select = document.getElementById('editJeepSelect');
    select.innerHTML = '<option value="">-- Assign Jeep --</option>';
    firebaseDb.ref('jeeps').once('value').then(snap => {
        const jeeps = snap.val();
        if(jeeps) Object.keys(jeeps).forEach(id => select.innerHTML += `<option value="${id}">${jeeps[id].meta.plate} (${id})</option>`);
    });
    document.getElementById('editUser').value = "";
    document.getElementById('editName').value = "";
    document.getElementById('editPin').value = "";
}

function saveDriverData() {
    const u = document.getElementById('editUser').value.trim();
    const n = document.getElementById('editName').value.trim();
    const p = document.getElementById('editPin').value.trim();
    const j = document.getElementById('editJeepSelect').value;

    if(u && n && p && j) {
        firebaseDb.ref(`drivers/${u}`).set({ name: n, pin: p, assignedJeep: j }).then(() => {
            closeModal('editDriverModal');
        });
    } else { alert("All fields required"); }
}

function deleteDriver(u) { if(confirm("Delete " + u + "?")) firebaseDb.ref(`drivers/${u}`).remove(); }

function openAddJeepModal() { document.getElementById('addJeepModal').style.display = 'flex'; }
function saveNewJeep() {
    const id = document.getElementById('newJeepId').value.trim();
    const plate = document.getElementById('newJeepPlate').value.trim();
    const route = document.getElementById('newJeepRoute').value.trim();

    if(id && plate) {
        firebaseDb.ref(`jeeps/${id}`).set({
            meta: { plate: plate, routeName: route || "Default", isActive: false, driver: "Unassigned" },
            last: { latitude: 9.8518, longitude: 122.8859, timestamp: Date.now(), barangay: "Mabinay", status: "inactive" },
            history: {}
        }).then(() => {
            closeModal('addJeepModal');
            alert("Jeep Added");
        });
    }
}
function loadJeepsTable(allJeeps) {
    const tbody = document.getElementById('jeepTableBody');
    tbody.innerHTML = '';
    if(allJeeps) {
        Object.keys(allJeeps).forEach(id => {
            const meta = allJeeps[id].meta || {};
            tbody.innerHTML += `<tr><td>${id}</td><td>${meta.plate}</td><td>${meta.routeName}</td><td><button class="delete-btn" onclick="deleteJeep('${id}')">DEL</button></td></tr>`;
        });
    }
}
function deleteJeep(id) { if(confirm("Delete Jeep " + id + "?")) firebaseDb.ref(`jeeps/${id}`).remove(); }

function loadAdminHistory() {
    const id = document.getElementById('historyJeepSelect').value;
    if(!id) return;
    const list = document.getElementById('adminHistoryList');
    list.innerHTML = 'Loading...';
    firebaseDb.ref(`jeeps/${id}/history`).limitToLast(50).once('value').then(snap => {
        const hist = snap.val();
        list.innerHTML = '';
        if(hist) {
            Object.values(hist).sort((a,b)=>b.timestamp-a.timestamp).forEach(h => {
                const lat = h.latitude || h.lat;
                const loc = getSmartLocationName(lat);
                const time = new Date(h.timestamp).toLocaleString();
                list.innerHTML += `<div class="history-item"><span>${loc}</span><span style="font-size:10px; color:#666">${time}</span></div>`;
            });
        } else { list.innerHTML = "No history recorded."; }
    });
}

function logoutAdmin() {
    isAdminMode = false;
    document.getElementById('adminDashboard').style.display = 'none';
    document.getElementById('publicDashboard').style.display = 'flex';
}
function openAdminLogin() { document.getElementById('adminLoginModal').style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openLoginModal() { document.getElementById('loginModal').style.display = 'flex'; }
function switchAdminTab(t) {
    document.querySelectorAll('.tab-content').forEach(e => e.style.display = 'none');
    document.getElementById(t === 'drivers' ? 'tabDrivers' : t === 'units' ? 'tabUnits' : 'tabHistory').style.display = 'block';
}
function populateAdminJeepSelect(jeeps) {
    const s = document.getElementById('historyJeepSelect');
    if(s.options.length <= 1 && jeeps) Object.keys(jeeps).forEach(id => s.innerHTML += `<option value="${id}">${jeeps[id].meta.plate}</option>`);
}
function trackUser() {
    if (!navigator.geolocation) return;
    navigator.geolocation.watchPosition(p => {
        const lat = p.coords.latitude, lng = p.coords.longitude;
        if (userMarker) userMarker.setLatLng([lat, lng]); else userMarker = L.marker([lat, lng], {icon: userIcon}).addTo(map);
    });
}
window.onload = () => { initMap(); connectFirebase(); };