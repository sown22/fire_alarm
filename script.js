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
    relay1: document.getElementById('statusRelay1'),
    relay2: document.getElementById('statusRelay2')
};

// =========================================================
// PHẦN 3: GỬI LỆNH TỪ WEB LÊN FIREBASE (WRITE)
// =========================================================
saveTempBtn.addEventListener('click', () => {
    let newVal = parseFloat(tempThresholdInput.value);
    if (isNaN(newVal)) { alert("Lỗi: Vui lòng nhập lại!"); tempThresholdInput.focus(); return; }
    if (newVal < 0 || newVal > 100) { alert("Lỗi: Ngưỡng nhiệt độ phải từ 0 đến 150 °C!"); tempThresholdInput.value = ""; return; }
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
    if (val < 0 || val > 100) { this.style.borderColor = "red"; this.style.color = "red"; } 
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
let currentTemp = 0, currentGas = 0, currentFire = 1;
let thTemp = 50, thGas = 600;
let lastReasonString = ""; 

// --- CÁC BIẾN KIỂM SOÁT KẾT NỐI ---
let isEspLive = false; // Trạng thái của mạng ESP32
let isStmLive = false; // Trạng thái của cảm biến STM32

let lastEspTimestamp = null, lastStmTimestamp = null;
let lastEspUpdateTime = Date.now(), lastStmUpdateTime = Date.now();

const TELEGRAM_TOKEN = "8632276059:AAHIHfQTQDT-OxwZIv6eWygJwRfeYivGCZQ";
const TELEGRAM_CHAT_ID = "8408334921";

function sendTelegramAlert(message) {
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(message)}`;
    fetch(url).catch(error => console.error(error));
}

// Reset riêng khung ESP32 (WiFi)
function setEspDisconnected() {
    isEspLive = false; 
    currentSSIDEl.textContent = '--';
    wifiStatusEl.textContent  = '--';
    wifiStatusEl.className    = 'wifi-status-badge';
}

// Reset riêng khung STM32 (Cảm biến)
function setStmDisconnected() {
    isStmLive = false; 
    tempValueDisplay.textContent = '--'; 
    gasValueDisplay.textContent  = '--';
    fireBadge.textContent        = 'Chưa có dữ liệu'; 
    fireBadge.className          = 'badge safety'; 
    document.body.classList.remove('danger-mode');
}

// GỌI LẬP TỨC KHI MỞ WEB
setEspDisconnected();
setStmDisconnected();

function updateFireUI(state) {
    if (state === 0 || state === false) { 
        fireBadge.textContent = 'Phát hiện'; 
        fireBadge.className = 'badge danger'; 
    } else { 
        fireBadge.textContent = 'Không phát hiện'; 
        fireBadge.className = 'badge safety'; 
    }
}

function checkDangerState() {
    let isDanger = (currentFire === 0 || currentTemp >= thTemp || currentGas >= thGas || toggleEmergency.checked);
    document.body.classList.toggle('danger-mode', isDanger);
}

// --- 1. LẮNG NGHE NHỊP TIM ESP32 (Quản lý WiFi/IP) ---
onValue(ref(db, 'wifi/timestamp'), (snapshot) => {
    if (snapshot.exists()) {
        const newTs = snapshot.val();
        if (lastEspTimestamp === null) { lastEspTimestamp = newTs; return; }
        if (newTs !== lastEspTimestamp) {
            isEspLive = true;
            lastEspTimestamp = newTs;
            lastEspUpdateTime = Date.now();
        }
    }
});

// --- 2. LẮNG NGHE NHỊP TIM STM32 (Quản lý Cảm biến) ---
onValue(ref(db, 'sensors/timestamp'), (snapshot) => {
    if (snapshot.exists()) {
        const newTs = snapshot.val();
        if (lastStmTimestamp === null) { lastStmTimestamp = newTs; return; }
        if (newTs !== lastStmTimestamp) {
            isStmLive = true;
            lastStmTimestamp = newTs;
            lastStmUpdateTime = Date.now();
            
            // Có tim STM32 mới hiển thị số
            tempValueDisplay.textContent = currentTemp;
            gasValueDisplay.textContent  = currentGas;
            updateFireUI(currentFire);
        }
    }
});

// --- 3. BỘ ĐẾM NGƯỢC (WATCHDOG KÉP) ---
setInterval(() => {
    let now = Date.now();
    // Chờ 10s: Cứ ai mất nhịp tim thì reset riêng người đó về "--"
    if (isEspLive && (now - lastEspUpdateTime > 10000)) setEspDisconnected();
    if (isStmLive && (now - lastStmUpdateTime > 10000)) setStmDisconnected();
}, 1000);

// 2. LẮNG NGHE DỮ LIỆU CẢM BIẾN (CHỈ XỬ LÝ KHI MẠCH ONLINE)
onValue(ref(db, 'sensors/temperature'), (snapshot) => { 
    currentTemp = snapshot.val() || 0; 
    if (isStmLive) {
        tempValueDisplay.textContent = currentTemp; 
        checkDangerState(); 
        pushHistory(currentTemp, currentGas, currentFire); 
    }
});

onValue(ref(db, 'sensors/gas'), (snapshot) => { 
    currentGas = snapshot.val() || 0; 
    if (isStmLive) {
        gasValueDisplay.textContent = currentGas; 
        checkDangerState(); 
        pushHistory(currentTemp, currentGas, currentFire); 
    }
});

onValue(ref(db, 'sensors/fire'), (snapshot) => {
    currentFire = snapshot.val();
    if (isStmLive) {
        updateFireUI(currentFire);
        checkDangerState(); 
        pushHistory(currentTemp, currentGas, currentFire);
    }
});

onValue(ref(db, 'settings/temp_threshold'), (snapshot) => { 
    if (snapshot.exists()) { 
        thTemp = snapshot.val(); 
        tempThresholdInput.value = thTemp; 
        if (isStmLive) { checkDangerState(); pushHistory(currentTemp, currentGas, currentFire); }
    } 
});

onValue(ref(db, 'settings/gas_threshold'), (snapshot) => { 
    if (snapshot.exists()) { 
        thGas = snapshot.val(); 
        gasThresholdInput.value = thGas; 
        if (isStmLive) { checkDangerState(); pushHistory(currentTemp, currentGas, currentFire); }
    } 
});

// Cập nhật đèn báo Thiết bị Output
Object.keys(outputIndicators).forEach(key => {
    onValue(ref(db, `devices/${key}`), (snapshot) => {
        let state = snapshot.val();
        let isOn = (state === 'ON' || state === 1 || state === true);
        if (isOn) { outputIndicators[key].textContent = "BẬT"; outputIndicators[key].className = "status-badge on"; } 
        else { outputIndicators[key].textContent = "TẮT"; outputIndicators[key].className = "status-badge off"; }
    });
});

// Cập nhật trạng thái nút gạt khẩn cấp (ĐỒNG BỘ 2 CHIỀU HOÀN HẢO)
onValue(ref(db, 'devices/emergency'), (snapshot) => {
    let state = snapshot.val();
    let isOn = (state === 'ON' || state === 1 || state === true);
    
    // Nếu trạng thái thực tế của mạch KHÁC với cái nút trên Web
    if (toggleEmergency.checked !== isOn) {
        // 1. Gạt nút trên giao diện
        toggleEmergency.checked = isOn; 
        
        // 2. Ép luôn biến mệnh lệnh trên Firebase đồng bộ theo thực tế
        set(ref(db, 'system/web_emergency'), isOn ? 'ON' : 'OFF'); 
    }
    
    checkDangerState(); 
});

// ==========================================
// LỊCH SỬ CẢM BIẾN
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
            <td class="${entry.fire === 0 ? 'fire-danger' : 'fire-safe'}">
                ${entry.fire === 0 ? 'Phát hiện' : 'Không phát hiện'}
            </td>
            <td class="reason-cell"><div class="reason-box">${formattedReason}</div></td>
        </tr>
        `;
    }).join('');
}

function pushHistory(temp, gas, fire) {
    const isOverThreshold = (fire === 0 || temp >= thTemp || gas >= thGas);
    let vnReason = [];
    if (fire === 0) vnReason.push('Phát hiện có Lửa');
    if (temp >= thTemp) vnReason.push(`Nhiệt độ cao (${temp}°C)`);
    if (gas >= thGas) vnReason.push(`Rò rỉ khí Gas (${gas} ppm)`);
    const currentReason = vnReason.join(' + ');

    if (isOverThreshold && currentReason !== lastReasonString) {
        lastReasonString = currentReason;
        const historyRef = ref(db, 'sensors/history');
        get(historyRef).then((snapshot) => {
            let history = snapshot.val() || [];
            const now = new Date();
            const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
            
            sendTelegramAlert(`CẢNH BÁO:\n\n ${currentReason}\n Thời gian: ${timeStr}\n\nVui lòng kiểm tra!`);
            
            history.push({ time: timeStr, temperature: temp, gas: gas, fire: fire, reason: currentReason });
            if (history.length > 5) history = history.slice(-5);
            set(historyRef, history);
        });
    }
    if (!isOverThreshold) lastReasonString = "";
}

onValue(ref(db, 'sensors/history'), (snapshot) => { renderHistory(snapshot.val()); });

// ==========================================
// TRẠNG THÁI WIFI (HIỂN THỊ IP KHI ONLINE)
// ==========================================
onValue(ref(db, 'wifi/current_ssid'), (snapshot) => { 
    if (isEspLive) currentSSIDEl.textContent = snapshot.val() || '--'; 
});

// Lắng nghe địa chỉ IP từ Firebase
onValue(ref(db, 'wifi/ip'), (snapshot) => {
    if (!isEspLive) return;
    
    const ipAddress = snapshot.val();
    if (ipAddress) {
        wifiStatusEl.textContent = 'IP: ' + ipAddress; 
        wifiStatusEl.className = 'wifi-status-badge connected'; // Hiện màu xanh lá
    }
});