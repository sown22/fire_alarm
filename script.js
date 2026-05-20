import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set, get } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = {
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
const fireBadge          = document.getElementById('fireBadge');
const tempValueDisplay   = document.getElementById('tempValue');
const gasValueDisplay    = document.getElementById('gasValue');
const tempThresholdInput = document.getElementById('tempThresholdInput');
const gasThresholdInput  = document.getElementById('gasThresholdInput');
const saveTempBtn        = document.getElementById('saveTempBtn');
const saveGasBtn         = document.getElementById('saveGasBtn');
const currentSSIDEl      = document.getElementById('currentSSID');
const wifiStatusEl       = document.getElementById('wifiStatus');

// =========================================================
// PHẦN 3: GỬI LỆNH TỪ WEB LÊN FIREBASE (WRITE) - CHỈ CÒN CÀI NGƯỠNG
// =========================================================
saveTempBtn.addEventListener('click', () => {
    let newVal = parseFloat(tempThresholdInput.value);
    if (isNaN(newVal)) { alert("Lỗi: Vui lòng nhập lại!"); tempThresholdInput.focus(); return; }
    if (newVal < 0 || newVal > 150) { alert("Lỗi: Ngưỡng nhiệt độ phải từ 0 đến 150 °C!"); tempThresholdInput.value = ""; return; }
    set(ref(db, 'settings/temp_threshold'), newVal).then(() => alert(`Đã lưu ngưỡng nhiệt độ: ${newVal}°C`));
});

saveGasBtn.addEventListener('click', () => {
    let newVal = parseFloat(gasThresholdInput.value);
    if (isNaN(newVal)) { alert("Lỗi: Vui lòng nhập một số hợp lệ!"); gasThresholdInput.focus(); return; }
    if (newVal < 0 || newVal > 1000) { alert("Lỗi: Ngưỡng khí gas phải từ 0 đến 1000 ppm!"); gasThresholdInput.value = ""; return; }
    set(ref(db, 'settings/gas_threshold'), newVal).then(() => alert(`Đã lưu ngưỡng khí gas: ${newVal} ppm`));
});

tempThresholdInput.addEventListener('input', function() {
    let val = parseFloat(this.value);
    if (val < 0 || val > 150) { this.style.borderColor = "red"; this.style.color = "red"; }
    else { this.style.borderColor = "#ccc"; this.style.color = "inherit"; }
});

gasThresholdInput.addEventListener('input', function() {
    let val = parseFloat(this.value);
    if (val < 0 || val > 1000) { this.style.borderColor = "red"; this.style.color = "red"; }
    else { this.style.borderColor = "#ccc"; this.style.color = "inherit"; }
});

// =========================================================
// PHẦN 4: LẮNG NGHE DỮ LIỆU TỪ FIREBASE ĐỔ VỀ (READ)
// =========================================================
let currentTemp = 0, currentGas = 0, currentFire = 0;
let thTemp = 50, thGas = 600;

// --- CÁC BIẾN KIỂM SOÁT KẾT NỐI ---
let isEspLive = false;
let isStmLive = false;

let lastEspTimestamp = null, lastStmTimestamp = null;
let lastEspUpdateTime = Date.now(), lastStmUpdateTime = Date.now();

const TELEGRAM_TOKEN   = "8632276059:AAHIHfQTQDT-OxwZIv6eWygJwRfeYivGCZQ";
const TELEGRAM_CHAT_ID = "8408334921";

function sendTelegramAlert(message) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(message)}`;
    fetch(url).catch(error => console.error(error));
}

function setEspDisconnected() {
    isEspLive = false;
    currentSSIDEl.textContent = '--';
    wifiStatusEl.textContent  = '--';
    wifiStatusEl.className    = 'wifi-status-badge';
}

function setStmDisconnected() {
    isStmLive = false;
    tempValueDisplay.textContent = '--';
    gasValueDisplay.textContent  = '--';
    fireBadge.textContent        = 'Chưa có dữ liệu';
    fireBadge.className          = 'badge safety';
    document.body.classList.remove('danger-mode');
}

setEspDisconnected();
setStmDisconnected();

function updateFireUI(state) {
    if (state === 1 || state === true) {
        fireBadge.textContent = 'Phát hiện';
        fireBadge.className   = 'badge danger';
    } else {
        fireBadge.textContent = 'Không phát hiện';
        fireBadge.className   = 'badge safety';
    }
}

function checkDangerState() {
    let isDanger = (currentFire === 1 || currentTemp >= thTemp || currentGas >= thGas);
    document.body.classList.toggle('danger-mode', isDanger);
}

// --- 1. LẮNG NGHE NHỊP TIM ESP32 ---
onValue(ref(db, 'wifi/timestamp'), (snapshot) => {
    if (!snapshot.exists()) return;
    const newTs = snapshot.val();
    if (newTs === 0 || newTs === null) return;

    if (lastEspTimestamp === null) { lastEspTimestamp = newTs; return; }

    if (newTs !== lastEspTimestamp) {
        isEspLive         = true;
        lastEspTimestamp  = newTs;
        lastEspUpdateTime = Date.now();

        get(ref(db, 'wifi/current_ssid')).then(s => { currentSSIDEl.textContent = s.val() || '--'; });
        get(ref(db, 'wifi/ip')).then(s => {
            if (s.val()) {
                wifiStatusEl.textContent = 'IP: ' + s.val();
                wifiStatusEl.className   = 'wifi-status-badge connected';
            }
        });
    }
});

// --- 2. LẮNG NGHE NHỊP TIM STM32 ---
onValue(ref(db, 'sensors/timestamp'), (snapshot) => {
    if (snapshot.exists()) {
        const newTs = snapshot.val();
        if (lastStmTimestamp === null) { lastStmTimestamp = newTs; return; }
        if (newTs !== lastStmTimestamp) {
            isStmLive         = true;
            lastStmTimestamp  = newTs;
            lastStmUpdateTime = Date.now();

            tempValueDisplay.textContent = currentTemp;
            gasValueDisplay.textContent  = currentGas;
            updateFireUI(currentFire);
        }
    }
});

// --- 3. WATCHDOG KÉP ---
setInterval(() => {
    let now = Date.now();
    if (isEspLive && (now - lastEspUpdateTime > 10000)) setEspDisconnected();
    if (isStmLive && (now - lastStmUpdateTime > 10000)) setStmDisconnected();
}, 1000);

onValue(ref(db, 'sensors/temperature'), (snapshot) => {
    currentTemp = snapshot.val() || 0;
    if (isStmLive) { tempValueDisplay.textContent = currentTemp; checkDangerState(); pushHistory(currentTemp, currentGas, currentFire); }
});

onValue(ref(db, 'sensors/gas'), (snapshot) => {
    currentGas = snapshot.val() || 0;
    if (isStmLive) { gasValueDisplay.textContent = currentGas; checkDangerState(); pushHistory(currentTemp, currentGas, currentFire); }
});

onValue(ref(db, 'sensors/fire'), (snapshot) => {
    currentFire = snapshot.val();
    if (isStmLive) { updateFireUI(currentFire); checkDangerState(); pushHistory(currentTemp, currentGas, currentFire); }
});

onValue(ref(db, 'settings/temp_threshold'), (snapshot) => {
    if (snapshot.exists()) {
        thTemp = snapshot.val(); tempThresholdInput.value = thTemp;
        if (isStmLive) { checkDangerState(); pushHistory(currentTemp, currentGas, currentFire); }
    }
});

onValue(ref(db, 'settings/gas_threshold'), (snapshot) => {
    if (snapshot.exists()) {
        thGas = snapshot.val(); gasThresholdInput.value = thGas;
        if (isStmLive) { checkDangerState(); pushHistory(currentTemp, currentGas, currentFire); }
    }
});

// ==========================================
// LỊCH SỬ CẢM BIẾN & TELEGRAM
// ==========================================
function renderHistory(historyArr) {
    const tbody = document.getElementById('historyBody');
    if (!historyArr || historyArr.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="history-empty">Chưa có cảnh báo ...</td></tr>'; return;
    }
    const reversed = [...historyArr].reverse();
    tbody.innerHTML = reversed.map(entry => {
        let formattedReason = entry.reason ? '• ' + entry.reason.split(' + ').join('<br>• ') : '';
        return `
        <tr>
            <td>${entry.time}</td>
            <td class="${entry.temperature >= thTemp ? 'fire-danger' : ''}">${entry.temperature} °C</td>
            <td class="${entry.gas >= thGas ? 'fire-danger' : ''}">${entry.gas} ppm</td>
            <td class="${entry.fire === 1 ? 'fire-danger' : 'fire-safe'}">
                ${entry.fire === 1 ? 'Phát hiện' : 'Không phát hiện'}
            </td>
            <td class="reason-cell"><div class="reason-box">${formattedReason}</div></td>
        </tr>
        `;
    }).join('');
}
let telegramSent = false;
let activeAlarmSet = new Set(); // có thể chứa: 'fire', 'temp', 'gas'

function pushHistory(temp, gas, fire) {
    // Tính tập hợp cảnh báo hiện tại
    const currentAlarms = new Set();
    if (fire === 1)     currentAlarms.add('fire');
    if (temp >= thTemp) currentAlarms.add('temp');
    if (gas >= thGas)   currentAlarms.add('gas');

    // Tìm các loại cảnh báo MỚI (chưa có trong lần trước)
    const newAlarms = [...currentAlarms].filter(a => !activeAlarmSet.has(a));

    // Nếu không có cảnh báo nào mới → không làm gì cả
    // (kể cả khi vẫn đang cháy, hoặc khi mất bớt 1 loại)
    if (newAlarms.length === 0) {
        // Nếu tất cả đã hết → reset để lần sau kích hoạt lại được
        if (currentAlarms.size === 0) {
            activeAlarmSet = new Set();
            telegramSent = false;
        }
        return;
    }

    // Cập nhật tập hợp active
    activeAlarmSet = new Set(currentAlarms);

    // Gửi Telegram (chỉ khi có cảnh báo mới)
    if (!telegramSent) {
        telegramSent = true;
        let reasons = [];
        if (currentAlarms.has('fire')) reasons.push('- Co lua');
        if (currentAlarms.has('temp')) reasons.push('- Nhiet do cao');
        if (currentAlarms.has('gas'))  reasons.push('- Ro ri gas');
        sendTelegramAlert(`🚨 CANH BAO SU CO:\n${reasons.join('\n')}\n\nVui long kiem tra ngay!`);
    } else {
        // Đã từng gửi rồi, chỉ gửi thêm cho loại mới
        let newReasons = [];
        if (newAlarms.includes('fire')) newReasons.push('- Co lua (them moi)');
        if (newAlarms.includes('temp')) newReasons.push('- Nhiet do cao (them moi)');
        if (newAlarms.includes('gas'))  newReasons.push('- Ro ri gas (them moi)');
        sendTelegramAlert(`⚠️ THEM SU CO MOI:\n${newReasons.join('\n')}`);
    }

    // Ghi lịch sử
    let vnReason = [];
    if (currentAlarms.has('fire')) vnReason.push('Phát hiện có Lửa');
    if (currentAlarms.has('temp')) vnReason.push(`Nhiệt độ cao (${temp}°C)`);
    if (currentAlarms.has('gas'))  vnReason.push(`Rò rỉ khí Gas (${gas} ppm)`);

    const historyRef = ref(db, 'sensors/history');
    get(historyRef).then((snapshot) => {
        let history = snapshot.val() || [];
        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
        history.push({ time: timeStr, temperature: temp, gas: gas, fire: fire, reason: vnReason.join(' + ') });
        if (history.length > 5) history = history.slice(-5);
        set(historyRef, history);
    });
}
onValue(ref(db, 'sensors/history'), (snapshot) => { renderHistory(snapshot.val()); });