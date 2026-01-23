const btn = document.getElementById("locateBtn");
const resultDiv = document.getElementById("result");
const placeName = document.getElementById("placeName");
const narration = document.getElementById("narration");
const distanceText = document.getElementById("distance");
const langSelect = document.getElementById("language");
const playBtn = document.getElementById("playAudioBtn");

let audio = null;
let watchTimer = null;
let lastRestaurantId = null;
let isTracking = false;

// =====================
// CORE: gọi backend
// =====================
function fetchAndUpdateLocation() {
  navigator.geolocation.getCurrentPosition((pos) => {
    fetch("http://127.0.0.1:5000/location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        language: langSelect.value
      })
    })
    .then(res => res.json())
    .then(data => {
      const newId = data.nearest_place.id;

      // 👉 CHỈ xử lý khi đổi quán
      if (newId !== lastRestaurantId) {
        lastRestaurantId = newId;

        // ⛔ Tắt audio cũ
        if (audio) {
          audio.pause();
          audio = null;
        }

        // UI
        placeName.innerText = data.nearest_place.name;
        narration.innerText = data.narration;
        distanceText.innerText = `Khoảng cách: ${data.distance_km} km`;
        resultDiv.classList.remove("hidden");

        // 🔊 Tạo audio mới
        if (data.audio_url) {
          playBtn.classList.remove("hidden");

          audio = new Audio(`http://127.0.0.1:5000${data.audio_url}`);
          audio.play();

          audio.onended = () => {
            playBtn.innerText = "🔊";
          };

          playBtn.innerText = "⏸";
        }
      }
    });
  });
}

// =====================
// NÚT CHÍNH
// =====================
btn.onclick = () => {
  if (!navigator.geolocation) {
    alert("Trình duyệt không hỗ trợ GPS");
    return;
  }

  // 👉 BẮT ĐẦU THEO DÕI
  if (!isTracking) {
    isTracking = true;
    btn.innerText = "⏹ Đang theo dõi... (bấm để dừng)";

    fetchAndUpdateLocation();
    watchTimer = setInterval(fetchAndUpdateLocation, 5000);
    return;
  }

  // 👉 DỪNG THEO DÕI
  isTracking = false;
  btn.innerText = "▶️ Bắt đầu theo dõi";

  clearInterval(watchTimer);
  watchTimer = null;
  lastRestaurantId = null;

  if (audio) {
    audio.pause();
    audio = null;
  }
};

// =====================
// NÚT 🔊 PLAY / PAUSE
// =====================
playBtn.onclick = () => {
  if (!audio) return;

  if (audio.paused) {
    audio.play();
    playBtn.innerText = "⏸";
  } else {
    audio.pause();
    playBtn.innerText = "🔊";
  }
};

// =====================
// LANGUAGE SELECT
// =====================
LANGUAGES.forEach(lang => {
  const option = document.createElement("option");
  option.value = lang.code;
  option.textContent = lang.label;
  langSelect.appendChild(option);
});

const savedLang = localStorage.getItem("language");
langSelect.value = savedLang || "vi";

langSelect.addEventListener("change", () => {
  localStorage.setItem("language", langSelect.value);
});
