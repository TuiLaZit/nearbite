# 🚀 Quick Start - Upload Ảnh Trực Tiếp

## TL;DR - Làm nhanh trong 3 bước

### 1️⃣ Cài thư viện
```bash
cd backend
pip install supabase python-dotenv
```

### 2️⃣ Tạo file `.env`
Tạo file `backend/.env`:
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_KEY=eyJhbG...
```

**Lấy ở đâu?**
- Vào Supabase Dashboard → Settings → API
- Copy `Project URL` và `service_role key`

### 3️⃣ Tạo bucket
- Vào Storage → New bucket
- Tên: `restaurant-images`
- ✅ Public bucket
- Create!

### ✅ Chạy thử
```bash
python app.py
```
Thấy: `✅ Supabase client initialized successfully` → OK!

---

## 🎨 Sử dụng

1. Admin → Chi tiết quán → Tab Hình ảnh
2. **Click "Chọn file"** → Chọn ảnh từ máy
3. Xem preview → Điền mô tả (optional)
4. Click "Thêm hình" → Done! ✨

**So sánh:**

| Trước | Bây giờ |
|-------|---------|
| 1. Upload lên Imgur | ~~1. Upload lên Imgur~~ |
| 2. Copy URL | ~~2. Copy URL~~ |
| 3. Paste vào form | 1. Chọn file |
| 4. Submit | 2. Submit |

→ **Nhanh hơn 2x!** 🚀

---

## ❓ Lỗi thường gặp

**"Image upload is not configured"**
→ File `.env` chưa có hoặc sai → Xem lại bước 2

**"Failed to upload"**
→ Bucket chưa tạo hoặc không public → Xem lại bước 3

**Upload lâu**
→ File quá lớn → Nén ảnh trước (dùng tinypng.com)

---

Xem hướng dẫn đầy đủ trong [HUONG_DAN_UPLOAD_ANH.md](HUONG_DAN_UPLOAD_ANH.md)
