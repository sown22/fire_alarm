// Import các module cần thiết từ Firebase v10
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
// QUAN TRỌNG: Phải import thêm hàm 'set' để ghi dữ liệu
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

// 1. Lưu Ngưỡng Cảnh Báo (Dùng hàm set và ref mới)
saveTempBtn.addEventListener('click', () => {
    let newVal = parseFloat(tempThresholdInput.value);

    switch (true) {
        case (isNaN(newVal)):
            alert("Error: Please enter a valid number!");
            tempThresholdInput.focus();
            break;
            
        case (newVal < 0 || newVal > 100):
            alert("Error: The temperature threshold must be within the range of 0 to 100 °C!");
            tempThresholdInput.value = ""; // Xóa trắng để người dùng nhập lại
            tempThresholdInput.focus();
            break;
            
        default:
            // Dữ liệu hợp lệ, cho phép gửi lên Firebase
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
            gasThresholdInput.value = ""; // Xóa trắng để người dùng nhập lại
            gasThresholdInput.focus();
            break;
            
        default:
            // Dữ liệu hợp lệ, cho phép gửi lên Firebase
            set(ref(db, 'settings/gas_threshold'), newVal)
                .then(() => alert(`Gas threshold has been saved: ${newVal} ppm to Firebase`));
            break;
    }
});
// Hiệu ứng đổi màu viền ô nhập Nhiệt độ khi nhập sai
tempThresholdInput.addEventListener('input', function() {
    let val = parseFloat(this.value);
    switch (true) {
        case (val < 0 || val > 100):
            this.style.borderColor = "red";
            this.style.color = "red";
            this.style.outline = "none";
            break;
        default:
            this.style.borderColor = "#ccc"; // Trả lại màu viền bình thường
            this.style.color = "inherit";
            break;
    }
});

// Hiệu ứng đổi màu viền ô nhập Khí Gas khi nhập sai
gasThresholdInput.addEventListener('input', function() {
    let val = parseFloat(this.value);
    switch (true) {
        case (val < 0 || val > 1000):
            this.style.borderColor = "red";
            this.style.color = "red";
            this.style.outline = "none";
            break;
        default:
            this.style.borderColor = "#ccc"; // Trả lại màu viền bình thường
            this.style.color = "inherit";
            break;
    }
});

// 2. Chuyển đổi Chế độ Auto/Manual
modeSelect.addEventListener('change', function() {
    const selectedMode = this.value;
    set(ref(db, 'system/mode'), selectedMode);
});

// 3. Bật/Tắt thiết bị (Chỉ gửi khi đang ở Manual)
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

// 1. Lắng nghe thông số Cảm biến (Dùng hàm onValue và ref mới)
// Lưu ý: Tôi đã đổi 'sensors/temp' thành 'sensors/temperature' cho đúng cấu trúc JSON
onValue(ref(db, 'sensors/temperature'), (snapshot) => {
    tempValueDisplay.textContent = snapshot.val() || 0;
});

onValue(ref(db, 'sensors/gas'), (snapshot) => {
    gasValueDisplay.textContent = snapshot.val() || 0;
});

onValue(ref(db, 'sensors/fire'), (snapshot) => {
    let isFire = snapshot.val(); 
    if (isFire === 0 || isFire === false) {
        fireBadge.textContent = 'Danger';
        fireBadge.className = 'badge danger';
    } else {
        fireBadge.textContent = 'Safety';
        fireBadge.className = 'badge safety';
    }
});

// 2. Lắng nghe Cài đặt Ngưỡng
onValue(ref(db, 'settings/temp_threshold'), (snapshot) => {
    if(snapshot.exists()) tempThresholdInput.value = snapshot.val();
});

onValue(ref(db, 'settings/gas_threshold'), (snapshot) => {
    if(snapshot.exists()) gasThresholdInput.value = snapshot.val();
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
