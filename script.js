// Import các module cần thiết từ Firebase v10
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

const firebaseConfig = 
{
    apiKey: "AIzaSyAPp8MJzki1YOGL3tMoqb5mEbReYAvP7gk",
    authDomain: "firealarmsystem-3d6b0.firebaseapp.com",
    databaseURL: "https://firealarmsystem-3d6b0-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "firealarmsystem-3d6b0",
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// =========================================================
// PHẦN 2: ÁNH XẠ PHẦN TỬ GIAO DIỆN (DOM)
// =========================================================
const modeSelect = document.getElementById('modeSelect');
const actuatorPanel = document.getElementById('actuatorPanel');
const fireBadge = document.getElementById('fireBadge');
const tempValueDisplay = document.getElementById('tempValue');
const gasValueDisplay = document.getElementById('gasValue');
const tempThresholdInput = document.getElementById('tempThresholdInput');
const gasThresholdInput = document.getElementById('gasThresholdInput');
const saveTempBtn = document.getElementById('saveTempBtn');
const saveGasBtn = document.getElementById('saveGasBtn');

const outputDevices = 
{
    led: document.getElementById('toggleLed'),
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

// --- BIẾN TOÀN CỤC LƯU TRẠNG THÁI HIỆN TẠI ĐỂ KIỂM TRA BÁO ĐỘNG ---
let currentTemp = 0;
let currentGas = 0;
let currentFire = 1; // Mặc định 1 là an toàn
let thTemp = 50;
let thGas = 600;

// HÀM KIỂM TRA BÁO ĐỘNG VÀ NHÁY MÀN HÌNH
function checkDangerState() {
    let isDanger = (currentFire === 0 || currentTemp >= thTemp || currentGas >= thGas);
    
    // Nếu có nguy hiểm thì thêm class 'danger-mode', nếu an toàn thì gỡ bỏ
    document.body.classList.toggle('danger-mode', isDanger);
}

// 1. Lắng nghe thông số Cảm biến 
onValue(ref(db, 'sensors/temperature'), (snapshot) => {
    currentTemp = snapshot.val() || 0;
    tempValueDisplay.textContent = currentTemp;
    checkDangerState(); // Gọi hàm kiểm tra ngay khi cập nhật
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
        fireBadge.className = 'badge danger';
    } else {
        fireBadge.textContent = 'Safety';
        fireBadge.className = 'badge safety';
    }
    checkDangerState();
});

// 2. Lắng nghe Cài đặt Ngưỡng
onValue(ref(db, 'settings/temp_threshold'), (snapshot) => {
    if(snapshot.exists()) {
        thTemp = snapshot.val();
        tempThresholdInput.value = thTemp;
        checkDangerState(); // Cập nhật lại trạng thái nếu bị đổi ngưỡng
    }
});

onValue(ref(db, 'settings/gas_threshold'), (snapshot) => {
    if(snapshot.exists()) {
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

// 4. Lắng nghe Trạng thái Thiết bị đầu ra (Đồng bộ nút gạt)
Object.keys(outputDevices).forEach(key => {
    onValue(ref(db, `devices/${key}`), (snapshot) => {
        let state = snapshot.val();
        outputDevices[key].checked = (state === 'ON' || state === 1 || state === true);
    });
});

// ==========================================
// TÍNH NĂNG ĐỒNG HỒ
// ==========================================
function updateClockAndGreeting() {
    const ownerName = "sown"; 

    const now = new Date();
    const hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0'); 
    const year = now.getFullYear();

    let greetingText = "";
    if (hours >= 5 && hours < 12) {
        greetingText = `🌅 Good morning, ${ownerName}!`;
    } else if (hours >= 12 && hours < 18) {
        greetingText = `☀️ Good afternoon, ${ownerName}!`;
    } else {
        greetingText = `🌙 Good evening, ${ownerName}!`;
    }
    document.getElementById('greeting').innerText = greetingText;

    document.getElementById('timeText').innerText = `${hours}:${minutes}:${seconds}`;
    document.getElementById('dateText').innerText = `${day}/${month}/${year}`;
}

updateClockAndGreeting();
setInterval(updateClockAndGreeting, 1000);

// ==========================================
// TÍNH NĂNG ĐĂNG NHẬP (LOGIN)
// ==========================================
const VALID_USER = "sown22";
const VALID_PASS = "012345"; 

document.getElementById('loginBtn').addEventListener('click', function() {
    const userVal = document.getElementById('username').value;
    const passVal = document.getElementById('password').value;
    const errorText = document.getElementById('loginError');

    if (userVal === VALID_USER && passVal === VALID_PASS) {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainDashboard').style.display = 'block';
    } else {
        errorText.style.display = 'block';
    }
});

document.getElementById('password').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('loginBtn').click();
    }
});