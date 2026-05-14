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
const toggleEmergency    = document.getElementById('toggleEmergency');
const currentSSIDEl      = document.getElementById('currentSSID');
const wifiStatusEl       = document.getElementById('wifiStatus');

const outputIndicators = {
    led:    document.getElementById('statusLed'),
    buzzer: document.getElementById('statusBuzzer'),
    fan:    document.getElementById('statusFan'),
    pump:   document.getElementById('statusPump')
};

// =========================================================
// PHẦN 3: GỬI LỆNH TỪ WEB LÊN FIREBASE (WRITE)
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

// Gửi lệnh ON/OFF khi gạt nút trên Web
toggleEmergency.addEventListener('change', function() {
    const state = this.checked ? 'ON' : 'OFF';
    set(ref(db, 'system/web_emergency'), state);
});

// =========================================================
// PHẦN 4: LẮNG NGHE DỮ LIỆU TỪ FIREBASE ĐỔ VỀ (READ)
// =========================================================
let currentTemp      = 0, currentGas = 0, currentFire = 0;
let currentEmergency = false; // Biến JS riêng, không đọc từ DOM
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

// fire === 1 mới là có cháy (đồng bộ STM32 & ESP32)
function updateFireUI(state) {
    if (state === 1 || state === true) {
        fireBadge.textContent = 'Phát hiện';
        fireBadge.className   = 'badge danger';
    } else {
        fireBadge.textContent = 'Không phát hiện';
        fireBadge.className   = 'badge safety';
    }
}

// Dùng biến currentEmergency thay vì toggleEmergency.checked
// → tránh flash trạng thái sai khi nhiều listener Firebase resolve cùng lúc
function checkDangerState() {
    let isDanger = (currentFire === 1 || currentTemp >= thTemp || currentGas >= thGas || currentEmergency);
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

Object.keys(outputIndicators).forEach(key => {
    onValue(ref(db, `devices/${key}`), (snapshot) => {
        let isOn = (snapshot.val() === 'ON');
        if (isOn) { outputIndicators[key].textContent = "BẬT"; outputIndicators[key].className = "status-badge on"; }
        else      { outputIndicators[key].textContent = "TẮT"; outputIndicators[key].className = "status-badge off"; }
    });
});

onValue(ref(db, 'devices/emergency'), (snapshot) => {
    let isOn = (snapshot.val() === 'ON');
    currentEmergency = isOn;                                               // Cập nhật biến JS trước
    if (toggleEmergency.checked !== isOn) toggleEmergency.checked = isOn; // Rồi mới sync DOM
    checkDangerState();
    if (isStmLive) pushHistory(currentTemp, currentGas, currentFire);      // Trigger Telegram nếu cần
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

// Cờ chống spam Telegram — giống isWarningSent bên ESP32
// Gửi 1 lần khi có sự cố, reset khi về an toàn
let telegramSent = false;

function pushHistory(temp, gas, fire) {
    const isOverThreshold   = (fire === 1 || temp >= thTemp || gas >= thGas || currentEmergency);
    const shouldSaveHistory = (fire === 1 || temp >= thTemp || gas >= thGas); // Nút khẩn cấp không lưu lịch sử

    // Gửi Telegram 1 lần khi có sự cố (tính cả nút khẩn cấp)
    if (isOverThreshold && !telegramSent) {
        telegramSent = true;
        let reasons = [];
        if (fire === 1)       reasons.push('- Co lua');
        if (temp >= thTemp)   reasons.push('- Nhiet do cao');
        if (gas >= thGas)     reasons.push('- Ro ri gas');
        if (currentEmergency) reasons.push('- Nhan nut khan cap');
        sendTelegramAlert(`🚨 CANH BAO SU CO:\n${reasons.join('\n')}\n\nVui long kiem tra ngay!`);
    }

    // Reset khi về an toàn
    if (!isOverThreshold) telegramSent = false;

    // Lưu lịch sử chỉ khi cảm biến vượt ngưỡng, không tính nút khẩn cấp
    if (shouldSaveHistory) {
        let vnReason = [];
        if (fire === 1)     vnReason.push('Phát hiện có Lửa');
        if (temp >= thTemp) vnReason.push(`Nhiệt độ cao (${temp}°C)`);
        if (gas >= thGas)   vnReason.push(`Rò rỉ khí Gas (${gas} ppm)`);

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
}

onValue(ref(db, 'sensors/history'), (snapshot) => { renderHistory(snapshot.val()); });