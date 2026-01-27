# Admin Dashboard - Hướng dẫn cập nhật

## 🎯 Những thay đổi chính

### 1. **Trang Dashboard với Heatmap**
- Hiển thị bản đồ nhiệt (heatmap) cho thấy "điểm nóng" - nơi user hay ghé
- Chỉ tính các vị trí mà user dừng lại hơn 1 phút

### 2. **Sidebar Navigation**
- Dashboard: Xem heatmap
- Quản lý Quán: CRUD quán ăn với search/filter
- Quản lý Tags: CRUD tags

### 3. **Quản lý Quán nâng cao**
- ✅ Tìm kiếm theo tên
- ✅ Lọc theo tags
- ✅ Sắp xếp theo:
  - Tên quán
  - Lượt ghé qua
  - Thời gian ghé trung bình
  - Thời gian nghe thuyết minh trung bình
- ✅ Hiển thị analytics: visit_count, avg_visit_duration, avg_audio_duration
- ✅ Modal popup cho Add/Edit

### 4. **Database Changes**
- Thêm vào `Restaurant`:
  - `visit_count`: Số lần ghé
  - `avg_visit_duration`: Thời gian ghé trung bình (phút)
  - `avg_audio_duration`: Thời gian nghe trung bình (giây)
- Table mới `LocationVisit`:
  - Lưu lịch sử vị trí user
  - Tự động tính analytics

### 5. **Tất cả Add/Edit đều dùng Modal**
- Quán: Modal popup
- Tags: Modal popup
- Menu: Modal popup

## 🚀 Cách chạy Migration

### Bước 1: Chạy migration script
```bash
cd backend
python migrate_analytics.py
```

### Bước 2: Khởi động lại backend
```bash
python app.py
```

### Bước 3: Khởi động frontend
```bash
cd ../frontend
npm run dev
```

## 📡 API Endpoints mới

### 1. Heatmap Data
```
GET /admin/heatmap
```
Trả về dữ liệu điểm nóng (visits >= 60 giây)

### 2. Restaurant Analytics
```
GET /admin/restaurants/analytics?search=...&tags[]=...&sort=...
```
Tìm kiếm và sort với analytics

### 3. Track Location
```
POST /track-location
Body: {
  "lat": 16.047,
  "lng": 108.206,
  "duration_seconds": 120
}
```
Frontend gọi khi user ở một vị trí

### 4. Track Audio
```
POST /track-audio
Body: {
  "restaurant_id": 1,
  "duration_seconds": 45
}
```
Frontend gọi khi user nghe audio xong

## 🎨 UI/UX Changes

### Màu sắc chính
- Sidebar: `#1e293b` (slate-800)
- Primary: `#3b82f6` (blue-500)
- Success: `#10b981` (green-500)
- Warning: `#f59e0b` (amber-500)
- Danger: `#ef4444` (red-500)
- Purple: `#9b59b6` (tags)

### Layout
- Sidebar: 280px fixed width
- Main content: flexible với max-width
- Modal: centered overlay
- Cards: rounded corners với shadow

## 📝 Ghi chú

1. **Leaflet Heatmap**: Đã thêm vào `index.html`, không cần install npm package
2. **Location Tracking**: Frontend cần implement logic gửi location data
3. **Audio Tracking**: Frontend cần implement logic track audio playback
4. **Analytics**: Tự động tính toán mỗi khi có data mới

## 🐛 Troubleshooting

### Lỗi "column not found"
→ Chạy lại migration script

### Heatmap không hiển thị
→ Kiểm tra:
1. Leaflet đã load chưa (xem console)
2. Có data trong LocationVisit table chưa
3. Map container có height chưa

### Modal không đóng
→ Click vào overlay (vùng tối) hoặc nút Hủy

## 🔄 Cách thêm data test

```python
from app import app
from db import db
from models import LocationVisit
from datetime import datetime

with app.app_context():
    # Thêm test visits
    visit = LocationVisit(
        lat=16.047079,
        lng=108.206230,
        duration_seconds=120
    )
    db.session.add(visit)
    db.session.commit()
```

## ✨ Features để thêm sau (optional)

1. Real-time heatmap updates
2. Date range filter cho analytics
3. Export analytics to CSV
4. Heatmap layer controls (intensity, radius)
5. Restaurant performance dashboard
