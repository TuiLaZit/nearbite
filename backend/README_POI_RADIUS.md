# Hướng dẫn thêm cột Bán kính POI (POI Radius)

## 📋 Tổng quan
Đã thêm tính năng quản lý bán kính kích hoạt POI (Point of Interest) cho từng quán ăn. Mỗi quán có thể có bán kính kích hoạt khác nhau thay vì dùng một giá trị chung.

## 🗄️ Thay đổi Database

### File SQL Migration: `supabase_add_poi_radius.sql`

**Chạy các bước sau trong Supabase SQL Editor:**

1. Mở Supabase Dashboard → SQL Editor
2. Copy toàn bộ nội dung từ file `supabase_add_poi_radius.sql`
3. Paste vào SQL Editor và chạy
4. Kiểm tra kết quả:
   ```sql
   SELECT id, name, poi_radius_km, (poi_radius_km * 1000) as poi_radius_meters 
   FROM restaurant 
   ORDER BY id;
   ```

### Cột mới được thêm:
- **Tên cột**: `poi_radius_km`
- **Kiểu dữ liệu**: `DOUBLE PRECISION`
- **Giá trị mặc định**: `0.015` (15 mét)
- **Ràng buộc**: `NOT NULL`

### Giá trị mẫu:
- 10m = 0.010 km
- **15m = 0.015 km** (mặc định)
- 20m = 0.020 km
- 30m = 0.030 km
- 50m = 0.050 km
- 100m = 0.100 km

## 🔧 Thay đổi Backend

### 1. Models (`models.py`)
✅ Đã thêm field `poi_radius_km` vào class `Restaurant`:
```python
poi_radius_km = db.Column(db.Float, default=0.015, nullable=False)
```

✅ Đã cập nhật method `to_dict()` để trả về `poi_radius_km`

### 2. Routes (`routes/admin.py`)
✅ Đã cập nhật API endpoints:
- POST `/admin/restaurants` - Nhận `poi_radius_km` khi thêm quán mới
- PUT `/admin/restaurants/<id>` - Nhận `poi_radius_km` khi cập nhật quán

### 3. Validators (`validators.py`)
✅ Đã thêm validation cho `poi_radius_km`:
- Phải là số
- Giá trị từ 0 đến 1 km (0-1000m)

## 🎨 Thay đổi Frontend

### Admin Dashboard (`AdminDashboard.jsx`)
✅ Đã thêm các chức năng:
1. **Form thêm/sửa quán**:
   - Input field cho bán kính POI
   - Placeholder: "Bán kính POI (km) - VD: 0.015 = 15m"
   - Step: 0.001 (có thể điều chỉnh từng 1m)
   - Min: 0.001 km (1m)
   - Max: 1 km (1000m)

2. **Bảng danh sách quán**:
   - Thêm cột "Bán kính POI"
   - Hiển thị bằng mét (m) để dễ đọc
   - VD: 15m, 20m, 30m

## 📝 Cách sử dụng

### 1. Chạy Migration Database
```bash
# Trong Supabase SQL Editor, chạy file:
supabase_add_poi_radius.sql
```

### 2. Khởi động Backend
```bash
cd backend
python app.py
```

### 3. Sử dụng Admin Dashboard

#### Thêm quán mới:
1. Truy cập: `http://localhost:5000/admin`
2. Điền form:
   - Tên quán
   - Latitude, Longitude
   - Thời gian ăn (phút)
   - **Bán kính POI (km)** - VD: `0.015` cho 15m
   - Mô tả
3. Click "➕ Thêm quán"

#### Sửa quán:
1. Click "✏️ Sửa" ở quán muốn chỉnh
2. Thay đổi giá trị "Bán kính POI"
3. Click "💾 Cập nhật"

#### Xem bán kính:
- Cột "Bán kính POI" hiển thị giá trị bằng mét (m)
- VD: 15m, 20m, 30m

## 🎯 Ví dụ thực tế

### Quán nhỏ (xe đẩy, gánh hàng rong):
```
Bán kính: 0.010 km (10m)
```

### Quán vừa (nhà hàng thông thường):
```
Bán kính: 0.015 km (15m) ← Mặc định
```

### Quán lớn (nhà hàng rộng):
```
Bán kính: 0.030 km (30m)
```

### Khu ẩm thực tập trung:
```
Bán kính: 0.050 km (50m)
```

## ⚠️ Lưu ý quan trọng

1. **Giá trị lưu trong database là km** (kilometers)
   - Frontend hiển thị bằng mét (m) cho dễ hiểu
   - Khi nhập: 0.015 km = 15m

2. **Tất cả quán hiện có đã được set mặc định 15m**
   - Có thể vào Admin Dashboard để chỉnh sửa từng quán

3. **Validation**:
   - Tối thiểu: 1m (0.001 km)
   - Tối đa: 1000m (1 km)

4. **Tích hợp với frontend user**:
   - File `LocationTracker.jsx` sử dụng constant `POI_THRESHOLD = 0.03`
   - Cần update để lấy `poi_radius_km` từ API cho từng quán
   - Thay thế `POI_THRESHOLD` bằng `restaurant.poi_radius_km`

## 🔄 Bước tiếp theo (Tùy chọn)

Nếu muốn frontend user (LocationTracker) dùng bán kính riêng cho từng quán:

1. API `/location` đã trả về thông tin restaurant với `poi_radius_km`
2. Trong `LocationTracker.jsx`:
   - Thay `distance > POI_THRESHOLD` 
   - Thành `distance > data.nearest_place.poi_radius_km`

## 📞 Support

Nếu gặp lỗi:
1. Kiểm tra file SQL đã chạy thành công chưa
2. Kiểm tra backend có khởi động lại chưa
3. Clear cache browser và refresh lại Admin Dashboard
