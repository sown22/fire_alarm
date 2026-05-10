import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig =
{
    apiKey: "AIzaSyAPp8MJzki1YOGL3tMoqb5mEbReYAvP7gk",
    authDomain: "firealarmsystem-3d6b0.firebaseapp.com",
    databaseURL: "https://firealarmsystem-3d6b0-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "firealarmsystem-3d6b0",
};

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// =========================================================
// PHẦN 2: ÁNH XẠ PHẦN TỬ GIAO DIỆN (DOM)
// =========================================================
const modeSelect        = document.getElementById('modeSelect');
const actuatorPanel     = document.getElementById('actuatorPanel');
const fireBadge         = document.getElementById('fireBadge');
const tempValueDisplay  = document.getElementById('tempValue');
const gasValueDisplay   = document.getElementById('gasValue');
const tempThresholdInput = document.getElementById('tempThresholdInput');
const gasThresholdInput  = document.getElementById('gasThresholdInput');
const saveTempBtn       = document.getElementById('saveTempBtn');
const saveGasBtn        = document.getElementById('saveGasBtn');

const outputDevices =
{
    led:    document.getElementById('toggleLed'),
    buzzer: document.getElementById('toggleBuzzer'),
    relay1: document.getElementById('toggleRelay1'),
    relay2: document.getElementById('toggleRelay2')
};

// =========================================================
// PHẦN 3: GỬI LỆNH TỪ WEB LÊN FIREBASE (WRITE)
// =========================================================

// 1. Lưu Ngưỡng Cảnh Báo
saveTempBtn.addEventListener('click', () => {
    let newVal = parseFloat(tempThresholdInput.value);
    switch (true) {
        case (isNaN(newVal)):
            alert("Error: Please enter a valid number!");
            tempThresholdInput.focus();
            break;

        case (newVal < 0 || newVal > 100):
            alert("Error: The temperature threshold must be within the range of 0 to 100 °C!");
            tempThresholdInput.value = "";
            tempThresholdInput.focus();
            break;

        default:
            set(ref(db, 'settings/temp_threshold'), newVal)
                .then(() => alert(`Temperature threshold has been saved: ${newVal}°C to Firebase`));
            break;
    }
});

saveGasBtn.addEventListener('click', () => {
    let newVal = parseFloat(gasThresholdInput.value);
    switch (true) {
        case (isNaN(newVal)):
            alert("Error: Please enter a valid number!");
            gasThresholdInput.focus();
            break;

        case (newVal < 0 || newVal > 1000):
            alert("Error: The gas threshold must be within the range of 0 to 1000 ppm!");
            gasThresholdInput.value = "";
            gasThresholdInput.focus();
            break;

        default:
            set(ref(db, 'settings/gas_threshold'), newVal)
                .then(() => alert(`Gas threshold has been saved: ${newVal} ppm to Firebase`));
            break;
    }
});

// Hiệu ứng đổi màu viền ô nhập
tempThresholdInput.addEventListener('input', function() {
    let val = parseFloat(this.value);
    if (val < 0 || val > 100) {
        this.style.borderColor = "red"; this.style.color = "red"; this.style.outline = "none";
    } else {
        this.style.borderColor = "#ccc"; this.style.color = "inherit";
    }
});

gasThresholdInput.addEventListener('input', function() {
    let val = parseFloat(this.value);
    if (val < 0 || val > 1000) {
        this.style.borderColor = "red"; this.style.color = "red"; this.style.outline = "none";
    } else {
        this.style.borderColor = "#ccc"; this.style.color = "inherit";
    }
});

// 2. Chuyển đổi Chế độ Auto/Manual
modeSelect.addEventListener('change', function() {
    const selectedMode = this.value;
    set(ref(db, 'system/mode'), selectedMode);
});

// 3. Bật/Tắt thiết bị
Object.keys(outputDevices).forEach(key => {
    outputDevices[key].addEventListener('change', function() {
        if (modeSelect.value === 'manual') {
            const state = this.checked ? 'ON' : 'OFF';
            set(ref(db, `devices/${key}`), state);
        }
    });
});

// =========================================================
// PHẦN 4: LẮNG NGHE DỮ LIỆU TỪ FIREBASE ĐỔ VỀ (READ)
// =========================================================

// --- BIẾN TOÀN CỤC ---
let currentTemp = 0;
let currentGas  = 0;
let currentFire = 1;
let thTemp      = 50;
let thGas       = 600;

// HÀM KIỂM TRA BÁO ĐỘNG VÀ NHÁY MÀN HÌNH
function checkDangerState() {
    let isDanger = (currentFire === 0 || currentTemp >= thTemp || currentGas >= thGas);
    document.body.classList.toggle('danger-mode', isDanger);
}

// 1. Lắng nghe thông số Cảm biến
onValue(ref(db, 'sensors/temperature'), (snapshot) => {
    currentTemp = snapshot.val() || 0;
    tempValueDisplay.textContent = currentTemp;
    checkDangerState();
    pushHistory(currentTemp, currentGas, currentFire);
});

onValue(ref(db, 'sensors/gas'), (snapshot) => {
    currentGas = snapshot.val() || 0;
    gasValueDisplay.textContent = currentGas;
    checkDangerState();
});

onValue(ref(db, 'sensors/fire'), (snapshot) => {
    currentFire = snapshot.val();
    if (currentFire === 0 || currentFire === false) {
        fireBadge.textContent = 'Danger';
        fireBadge.className   = 'badge danger';
    } else {
        fireBadge.textContent = 'Safety';
        fireBadge.className   = 'badge safety';
    }
    checkDangerState();
});

// 2. Lắng nghe Cài đặt Ngưỡng
onValue(ref(db, 'settings/temp_threshold'), (snapshot) => {
    if (snapshot.exists()) {
        thTemp = snapshot.val();
        tempThresholdInput.value = thTemp;
        checkDangerState();
    }
});

onValue(ref(db, 'settings/gas_threshold'), (snapshot) => {
    if (snapshot.exists()) {
        thGas = snapshot.val();
        gasThresholdInput.value = thGas;
        checkDangerState();
    }
});

// 3. Lắng nghe Chế độ và cập nhật UI
onValue(ref(db, 'system/mode'), (snapshot) => {
    let currentMode = snapshot.val() || 'auto';
    modeSelect.value = currentMode;

    if (currentMode === 'manual') {
        modeSelect.className = 'mode-dropdown mode-manual';
        actuatorPanel.classList.remove('locked');
        Object.values(outputDevices).forEach(device => device.disabled = false);
    } else {
        modeSelect.className = 'mode-dropdown mode-auto';
        actuatorPanel.classList.add('locked');
        Object.values(outputDevices).forEach(device => device.disabled = true);
    }
});

// 4. Lắng nghe Trạng thái Thiết bị đầu ra
Object.keys(outputDevices).forEach(key => {
    onValue(ref(db, `devices/${key}`), (snapshot) => {
        let state = snapshot.val();
        outputDevices[key].checked = (state === 'ON' || state === 1 || state === true);
    });
});

// ==========================================
// LỊCH SỬ CẢM BIẾN (5 lần vượt ngưỡng gần nhất)
// ==========================================
let lastDangerState = false;

function renderHistory(historyArr) {
    const tbody = document.getElementById('historyBody');
    if (!historyArr || historyArr.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="history-empty">No threshold exceeded yet...</td></tr>';
        return;
    }

    const reversed = [...historyArr].reverse();
    tbody.innerHTML = reversed.map(entry => `
        <tr>
            <td>${entry.time}</td>
            <td class="${entry.temperature >= thTemp ? 'fire-danger' : ''}">${entry.temperature} °C</td>
            <td class="${entry.gas >= thGas ? 'fire-danger' : ''}">${entry.gas} ppm</td>
            <td class="${entry.fire === 0 ? 'fire-danger' : 'fire-safe'}">
                ${entry.fire === 0 ? '🔥 Danger' : '✅ Safety'}
            </td>
            <td style="color:#e65100; font-weight:600;">${entry.reason}</td>
        </tr>
    `).join('');
}

function pushHistory(temp, gas, fire) {
    const isOverThreshold = (fire === 0 || temp >= thTemp || gas >= thGas);

    // Chỉ ghi khi vừa chuyển từ an toàn → nguy hiểm (tránh ghi trùng liên tục)
    if (isOverThreshold && !lastDangerState) {
        lastDangerState = true;

        const historyRef = ref(db, 'sensors/history');
        get(historyRef).then((snapshot) => {
            let history = snapshot.val() || [];

            const now     = new Date();
            const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;

            let reason = [];
            if (fire === 0)     reason.push('Fire');
            if (temp >= thTemp) reason.push('High Temp');
            if (gas >= thGas)   reason.push('High Gas');

            history.push({
                time:        timeStr,
                temperature: temp,
                gas:         gas,
                fire:        fire,
                reason:      reason.join(', ')
            });

            if (history.length > 5) history = history.slice(-5);
            set(historyRef, history);
        });
    }

    // Reset cờ khi hệ thống an toàn → cho phép ghi lần tiếp theo
    if (!isOverThreshold) {
        lastDangerState = false;
    }
}

// Lắng nghe lịch sử từ Firebase và render
onValue(ref(db, 'sensors/history'), (snapshot) => {
    renderHistory(snapshot.val());
});

// ==========================================
// TÍNH NĂNG ĐỒNG HỒ
// ==========================================
function updateClockAndGreeting() {
    const ownerName = "sown";

    const now     = new Date();
    const hours   = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const day   = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year  = now.getFullYear();

    let greetingText = "";
    if (hours >= 5 && hours < 12) {
        greetingText = `🌅 Good morning, ${ownerName}!`;
    } else if (hours >= 12 && hours < 18) {
        greetingText = `☀️ Good afternoon, ${ownerName}!`;
    } else {
        greetingText = `🌙 Good evening, ${ownerName}!`;
    }

    document.getElementById('greeting').innerText  = greetingText;
    document.getElementById('timeText').innerText  = `${hours}:${minutes}:${seconds}`;
    document.getElementById('dateText').innerText  = `${day}/${month}/${year}`;
}

updateClockAndGreeting();
setInterval(updateClockAndGreeting, 1000);

// ==========================================
// TÍNH NĂNG ĐĂNG NHẬP + GHI NHỚ ĐĂNG NHẬP
// ==========================================
const VALID_USER = "sown22";
const VALID_PASS = "012345";

function doLogin() {
    document.getElementById('loginScreen').style.display  = 'none';
    document.getElementById('mainDashboard').style.display = 'block';
}

// Kiểm tra localStorage khi load trang — bỏ qua màn hình login nếu đã đăng nhập
if (localStorage.getItem('isLoggedIn') === 'true') {
    doLogin();
}

document.getElementById('loginBtn').addEventListener('click', function() {
    const userVal   = document.getElementById('username').value;
    const passVal   = document.getElementById('password').value;
    const errorText = document.getElementById('loginError');

    if (userVal === VALID_USER && passVal === VALID_PASS) {
        localStorage.setItem('isLoggedIn', 'true');
        doLogin();
    } else {
        errorText.style.display = 'block';
    }
});

document.getElementById('password').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

// Nút Logout
document.getElementById('logoutBtn').addEventListener('click', function() {
    if (confirm('Are you sure you want to logout?')) {
        localStorage.removeItem('isLoggedIn');
        document.getElementById('mainDashboard').style.display = 'none';
        document.getElementById('loginScreen').style.display   = 'flex';
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        document.getElementById('loginError').style.display = 'none';
    }
});

// ==========================================
// TÍNH NĂNG CHỌN WIFI
// ==========================================
let selectedSSID = '';

const scanWifiBtn       = document.getElementById('scanWifiBtn');
const wifiList          = document.getElementById('wifiList');
const wifiConnectForm   = document.getElementById('wifiConnectForm');
const selectedSSIDLabel = document.getElementById('selectedSSIDLabel');
const wifiPasswordInput = document.getElementById('wifiPasswordInput');
const connectWifiBtn    = document.getElementById('connectWifiBtn');
const cancelWifiBtn     = document.getElementById('cancelWifiBtn');
const currentSSIDEl     = document.getElementById('currentSSID');
const wifiStatusEl      = document.getElementById('wifiStatus');

// Lắng nghe trạng thái WiFi hiện tại từ Firebase
onValue(ref(db, 'wifi/current_ssid'), (snapshot) => {
    currentSSIDEl.textContent = snapshot.val() || '--';
});

onValue(ref(db, 'wifi/status'), (snapshot) => {
    const status = snapshot.val() || '--';
    wifiStatusEl.textContent = status;
    wifiStatusEl.className   = 'wifi-status-badge ' + status;
});

// Nút Scan → đọc danh sách từ Firebase và hiển thị
scanWifiBtn.addEventListener('click', () => {
    wifiList.innerHTML            = '<p class="wifi-empty">⏳ Scanning... Please wait</p>';
    wifiConnectForm.style.display = 'none';

    // Tạo ID ngẫu nhiên cho lần scan này
    const myScanId = Math.floor(Math.random() * 900000) + 100000;

    // Ghi scan_id và scan_request lên Firebase
    set(ref(db, 'wifi/scan_id'),      myScanId);
    set(ref(db, 'wifi/scan_request'), true);

    // Lắng nghe scan_result_id — chờ ESP32 echo lại đúng ID
    const unsubscribe = onValue(ref(db, 'wifi/scan_result_id'), (snapshot) => {
        const resultId = snapshot.val();

        // Chưa khớp → tiếp tục chờ
        if (resultId !== myScanId) return;

        // Khớp rồi → huỷ lắng nghe và render list
        unsubscribe();

        get(ref(db, 'wifi/available_networks')).then((snapshot) => {
            const networks = snapshot.val();
            wifiList.innerHTML = '';

            if (!networks || networks.length === 0) {
                wifiList.innerHTML = '<p class="wifi-empty">No network found.</p>';
                return;
            }

            networks.forEach(ssid => {
                const isCurrentNetwork = (ssid === currentSSIDEl.textContent);
                const item = document.createElement('div');
                item.className = 'wifi-item' + (isCurrentNetwork ? ' active' : '');
                item.innerHTML = `
                    <span class="wifi-item-icon">🛜</span>
                    <span class="wifi-item-name">${ssid}</span>
                    ${isCurrentNetwork
                        ? '<span style="color:var(--safe-color);font-size:0.8em;font-weight:bold;">✓ Connected</span>'
                        : '<span style="color:#aaa;font-size:0.8em;">Tap to connect</span>'}
                `;

                item.addEventListener('click', () => {
                    if (isCurrentNetwork) return;
                    selectedSSID                  = ssid;
                    selectedSSIDLabel.textContent = ssid;
                    wifiPasswordInput.value       = '';
                    wifiConnectForm.style.display = 'block';
                    wifiPasswordInput.focus();
                });

                wifiList.appendChild(item);
            });
        });
    });
});

// Nút Kết nối → ghi target lên Firebase
connectWifiBtn.addEventListener('click', () => {
    const pass = wifiPasswordInput.value;

    if (!selectedSSID) {
        alert('Please select a WiFi network!');
        return;
    }

    if (pass.length < 8 && pass.length > 0) {
        alert('The WiFi password must be at least 8 characters long!');
        return;
    }

    set(ref(db, 'wifi/target_ssid'),     selectedSSID);
    set(ref(db, 'wifi/target_password'), pass);
    set(ref(db, 'wifi/status'),          'connecting');

    wifiStatusEl.textContent      = 'connecting';
    wifiStatusEl.className        = 'wifi-status-badge connecting';
    wifiConnectForm.style.display = 'none';

    alert(`⏳ Connecting to "${selectedSSID}"...\nPlease wait for about 10 seconds...`);
});

// Nút Huỷ
cancelWifiBtn.addEventListener('click', () => {
    wifiConnectForm.style.display = 'none';
    selectedSSID = '';
});
