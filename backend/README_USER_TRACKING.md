# User Tracking - Hướng dẫn hoạt động

## 🎯 Tracking Logic

### 1. **Audio Duration Tracking** (Thời gian nghe thuyết minh)

**Khi nào track:**
- ✅ User bấm nghe audio (manual hoặc auto-play)
- ✅ Audio phát từ đầu đến cuối
- ✅ User dừng audio giữa chừng
- ✅ User tắt tracking trong khi đang phát

**Cách hoạt động:**
```javascript
// Khi bắt đầu phát audio
audioStartTimeRef.current = Date.now()

// Khi audio kết thúc (onended) HOẶC khi user dừng (stopAudio)
const audioDuration = Math.floor((Date.now() - audioStartTimeRef.current) / 1000)
if (audioDuration >= 1) {
  // Gọi API: POST /track-audio
  trackAudioDuration(restaurantId, audioDuration)
}
```

**API Call:**
```
POST /track-audio
{
  "restaurant_id": 1,
  "duration_seconds": 45
}
```

**Cập nhật database:**
- Backend tự động cập nhật `avg_audio_duration` trong bảng `restaurant`
- Công thức: `avg_audio_duration = (avg_audio_duration + new_duration) / 2`

---

### 2. **Location Visit Tracking** (Lượt ghé và thời gian ghé)

**Điều kiện để bắt đầu đếm:**
- ✅ User ở **CỰC GẦN** quán (< 1m ~= 0.001 km)
- ✅ Đứng ở đó **liên tục > 10 giây**
- ✅ Trong POI radius của quán

**Cách hoạt động:**
```javascript
// Khi user vào gần quán (< 1m)
if (distance <= 0.001 && !visitStartTimeRef.current) {
  visitStartTimeRef.current = Date.now()
  console.log('📍 Bắt đầu đếm thời gian visit')
}

// Khi user ra khỏi POI HOẶC tắt tracking
if (visitStartTimeRef.current) {
  const visitDuration = Math.floor((Date.now() - visitStartTimeRef.current) / 1000)
  if (visitDuration >= 10) {
    // Gọi API: POST /track-location
    trackLocationVisit(lat, lng, visitDuration, restaurantId)
  }
  visitStartTimeRef.current = null
}
```

**API Call:**
```
POST /track-location
{
  "lat": 10.7765,
  "lng": 106.7009,
  "duration_seconds": 120,
  "restaurant_id": 1
}
```

**Cập nhật database:**

**Bảng `location_visit`:**
```sql
INSERT INTO location_visit (lat, lng, duration_seconds, restaurant_id, timestamp)
VALUES (10.7765, 106.7009, 120, 1, NOW());
```

**Bảng `restaurant` (nếu duration >= 60s):**
```python
restaurant.visit_count += 1
restaurant.avg_visit_duration = (avg_visit_duration + duration_minutes) / 2
```

---

## 📊 Kết quả trong Admin Dashboard

### Heatmap
- Hiển thị tất cả visits có `duration_seconds >= 60`
- Màu sắc dựa trên `intensity` (số lần visit tại vị trí đó)

### Restaurant Analytics Table
| Quán | Lượt ghé | TG ghé TB (phút) | TG nghe TB (giây) |
|------|----------|------------------|-------------------|
| Phở A | 15 | 3 | 45 |
| Bánh mì B | 8 | 2 | 28 |

---

## 🎮 Test Scenarios

### Scenario 1: User nghe audio đầy đủ
```
1. User ở gần quán → Audio auto-play
2. Audio phát 45 giây → onended
3. ✅ Track audio: 45s
```

### Scenario 2: User dừng audio giữa chừng
```
1. User ở gần quán → Audio auto-play
2. User bấm dừng sau 20s
3. ✅ Track audio: 20s
```

### Scenario 3: User đứng gần quán lâu
```
1. User đến gần quán (0.5m)
2. Đứng yên 2 phút
3. Ra khỏi quán
4. ✅ Track location: 120s (2 phút)
5. ✅ Backend: visit_count +1, avg_visit_duration cập nhật
```

### Scenario 4: User chỉ đi ngang qua
```
1. User đi ngang (3m từ quán)
2. Đi qua trong 5 giây
3. ❌ Không track (không đủ gần, không đủ lâu)
```

### Scenario 5: User tắt tracking trong khi ở quán
```
1. User đứng gần quán 30s
2. User bấm "Dừng tracking"
3. ✅ Track location: 30s (đủ > 10s)
4. ✅ Track audio nếu đang phát
```

---

## 🔧 Debug Tips

### Xem console logs:
```
📍 Bắt đầu đếm thời gian visit (đứng trong 1m)
✅ Location visit tracked: {status: "success"}
✅ Audio duration tracked: {status: "success"}
```

### Check database:
```sql
-- Xem location visits
SELECT * FROM location_visit ORDER BY timestamp DESC LIMIT 10;

-- Xem analytics của quán
SELECT id, name, visit_count, avg_visit_duration, avg_audio_duration 
FROM restaurant WHERE visit_count > 0;

-- Xem heatmap data (visits >= 60s)
SELECT lat, lng, COUNT(*) as intensity 
FROM location_visit 
WHERE duration_seconds >= 60 
GROUP BY lat, lng
ORDER BY intensity DESC;
```

---

## ⚠️ Lưu ý quan trọng

1. **Điều kiện track location visit:**
   - Phải ở cực gần (< 1m)
   - Phải đứng > 10 giây
   - Chỉ track 1 lần khi ra khỏi POI hoặc tắt tracking

2. **Điều kiện track audio:**
   - Bất kỳ khi nào audio play
   - Track ngay cả khi nghe vài giây (minimum 1s)
   - Track khi: onended, stopAudio, hoặc tắt tracking

3. **Không track nếu:**
   - User chỉ đi ngang qua (không dừng)
   - User ở xa quán > POI radius
   - Duration < 10s (location) hoặc < 1s (audio)

4. **Performance:**
   - Chỉ gọi API khi cần thiết
   - Không track liên tục mỗi 5 giây
   - Chỉ track khi có sự kiện: out of POI, stop tracking, audio end

---

## 🎯 Kết luận

- **Audio tracking**: Tính mỗi lần user nghe, bất kể thời gian (>= 1s)
- **Location tracking**: Chỉ tính khi user ở **CỰC GẦN** (< 1m) và đứng **LÂU** (> 10s)
- Tất cả được track tự động, user không cần làm gì thêm
- Admin thấy analytics real-time trong dashboard
