# 📸 Hướng dẫn Setup Upload Hình Ảnh

## 🎯 Tổng quan
Hệ thống upload ảnh đã được cập nhật để cho phép **chọn file trực tiếp từ máy tính** thay vì phải paste URL!

---

## ⚙️ Setup Backend (BẮT BUỘC)

### Bước 1: Cài đặt thư viện mới

```bash
cd backend
pip install -r requirements.txt
```

Các thư viện mới được thêm:
- `supabase` - Python client cho Supabase
- `python-dotenv` - Đọc biến môi trường từ file .env

### Bước 2: Tạo file .env

Tạo file `backend/.env` với nội dung:

```env
# Database
DATABASE_URL=your_postgresql_url_from_supabase

# Supabase Storage (QUAN TRỌNG!)
SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxxxx...
```

**Lấy thông tin từ đâu?**

1. Vào **Supabase Dashboard** → Project Settings
2. **SUPABASE_URL**: 
   - Tab "General" → Project URL
   - VD: `https://abcdefghijk.supabase.co`

3. **SUPABASE_SERVICE_KEY**:
   - Tab "API" → Project API keys → `service_role` key (secret)
   - ⚠️ **LƯU Ý**: Dùng `service_role` key, KHÔNG dùng `anon` key

### Bước 3: Tạo Storage Bucket trên Supabase

1. Vào **Supabase Dashboard** → **Storage**
2. Click **New bucket**
3. Điền thông tin:
   - **Name**: `restaurant-images`
   - **Public bucket**: ✅ **BẮT BUỘC phải tick**
   - **File size limit**: 5MB (hoặc tùy chỉnh)
   - **Allowed MIME types**: `image/*`
4. Click **Create bucket**

### Bước 4: Khởi động lại Backend

```bash
python app.py
```

Nếu thành công, bạn sẽ thấy:
```
✅ Supabase client initialized successfully
```

Nếu lỗi:
```
⚠️  Supabase credentials not found. Image upload will not work.
   Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env file
```
→ Kiểm tra lại file `.env`

---

## 🎨 Frontend (Đã hoàn tất)

Frontend đã được cập nhật tự động. Không cần làm gì thêm!

---

## 🚀 Sử dụng

### Thêm hình ảnh mới

1. Login **Admin Dashboard**
2. Click **📋 Chi tiết** ở quán muốn thêm ảnh
3. Chọn tab **📸 Hình ảnh**
4. Click vào ô **"Chọn file hình ảnh"**
5. Chọn ảnh từ máy tính
6. Xem preview ảnh
7. Điền thông tin:
   - Mô tả (tùy chọn)
   - Thứ tự hiển thị (0, 1, 2...)
   - Tick "Đặt làm ảnh chính" nếu cần
8. Click **➕ Thêm hình**
9. ⏳ Đợi upload (sẽ hiện "Đang xử lý...")
10. ✅ Xong! Ảnh sẽ hiện trong danh sách

### Sửa hình ảnh

1. Click **✏️ Sửa** ở hình muốn sửa
2. **LƯU Ý**: Không thể thay đổi file ảnh khi sửa
3. Chỉ có thể sửa: mô tả, thứ tự, ảnh chính
4. Click **💾 Cập nhật**

### Xóa hình ảnh

1. Click **🗑️ Xóa**
2. Confirm → Xóa thành công

---

## 📋 File types được hỗ trợ

✅ Cho phép:
- `.jpg` / `.jpeg`
- `.png`
- `.gif`
- `.webp`

❌ Không cho phép:
- `.bmp`, `.tiff`, `.svg`, `.ico`, etc.

---

## 🐛 Troubleshooting

### Lỗi: "Image upload is not configured"

**Nguyên nhân**: Backend chưa có SUPABASE_URL hoặc SUPABASE_SERVICE_KEY

**Giải quyết**:
1. Kiểm tra file `backend/.env` có tồn tại không
2. Kiểm tra 2 biến có đúng không
3. Khởi động lại backend

### Lỗi: "Failed to upload image"

**Nguyên nhân**: 
- Bucket chưa tạo
- Bucket không public
- Service key không đúng
- File quá lớn

**Giải quyết**:
1. Vào Storage → Kiểm tra bucket `restaurant-images` có tồn tại
2. Settings bucket → Đảm bảo "Public" = Yes
3. Thử upload file nhỏ hơn (< 2MB)

### Lỗi: "No file selected"

**Nguyên nhân**: Chưa chọn file

**Giải quyết**: Click vào input file và chọn ảnh

### Preview không hiện

**Nguyên nhân**: File không phải định dạng ảnh

**Giải quyết**: Chọn file .jpg, .png, .webp

### Upload lâu

**Nguyên nhân**: File quá lớn hoặc mạng chậm

**Giải quyết**: 
- Nén ảnh trước khi upload
- Dùng ảnh kích thước vừa phải (800x600 đến 1200x900)

---

## 💡 Tips

### Tối ưu hóa ảnh trước khi upload

Dùng các tool online miễn phí:
- https://tinypng.com - Nén PNG/JPG
- https://squoosh.app - Nén và resize
- https://compressor.io - Nén nhiều format

### Kích thước khuyến nghị
- **Ảnh chính**: 1200x800 px
- **Ảnh phụ**: 800x600 px
- **Dung lượng**: < 500KB mỗi ảnh

### Quy tắc đặt ảnh chính
- Mỗi quán chỉ có 1 ảnh chính
- Ảnh chính sẽ được ưu tiên hiển thị
- Nên chọn ảnh đẹp nhất làm ảnh chính

---

## 🔒 Bảo mật

⚠️ **QUAN TRỌNG**:
- **KHÔNG commit** file `.env` lên Git
- File `.env` đã được thêm vào `.gitignore`
- Service key có quyền admin, BẢO MẬT tuyệt đối
- Chỉ dùng trên server, KHÔNG expose ra client

---

## ✅ Checklist

- [ ] Cài `pip install -r requirements.txt`
- [ ] Tạo file `backend/.env` với SUPABASE_URL và SUPABASE_SERVICE_KEY
- [ ] Tạo bucket `restaurant-images` trên Supabase Storage
- [ ] Set bucket = Public
- [ ] Khởi động lại backend
- [ ] Thấy message "✅ Supabase client initialized successfully"
- [ ] Test upload 1 ảnh thử
- [ ] Ảnh hiện trong danh sách

---

## 🎉 Xong!

Bây giờ bạn có thể upload ảnh trực tiếp từ máy tính mà không cần paste URL nữa! 🚀

**So sánh:**

❌ **Trước**: Copy URL → Paste → Submit  
✅ **Bây giờ**: Chọn file → Preview → Submit → Done!

Thuận tiện hơn nhiều phải không? 😊
