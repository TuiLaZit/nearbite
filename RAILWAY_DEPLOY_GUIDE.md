# 🚂 Hướng dẫn Deploy Backend lên Railway

## ⚠️ VẤN ĐỀ HIỆN TẠI

Backend production (Railway) đang chạy **CODE CŨ** không có 2 endpoints:
- `/track-location` 
- `/track-audio`

Dẫn đến lỗi **404 Not Found** khi frontend gọi các endpoints này.

## ✅ GIẢI PHÁP TẠM THỜI

Frontend đã được cập nhật để:
- **Không hiện error đỏ** khi gặp 404 (chỉ warning trong console)
- App vẫn hoạt động bình thường, chỉ thiếu tracking analytics

## 🔧 CÁCH SỬA TRIỆT ĐỂ

### Bước 1: Kiểm tra Railway Dashboard

1. Truy cập https://railway.app/
2. Đăng nhập vào account
3. Tìm project **nearbite** hoặc project backend của bạn
4. Kiểm tra:
   - ✅ Service có đang chạy không?
   - ✅ Deployment gần nhất có thành công không?
   - ✅ Có log lỗi gì không?

### Bước 2: Kiểm tra GitHub Repository

1. Xác nhận Railway đang connect với repo: `https://github.com/TuiLaZit/nearbite.git`
2. Check branch mà Railway đang deploy (thường là `main` hoặc `master`)
3. Verify code mới đã được push lên:
   ```bash
   git log --oneline -5
   # Phải thấy commit: "fix: ensure track-audio endpoint is deployed"
   ```

### Bước 3: Trigger Deploy Thủ Công

#### Option A: Từ Railway Dashboard (Khuyến nghị)

1. Vào Railway Dashboard → Project → Service
2. Click tab **Deployments**
3. Click nút **Deploy** hoặc **Redeploy**
4. Đợi 2-3 phút để Railway build và deploy

#### Option B: Từ Terminal

```bash
# Force push lại (Railway sẽ auto-deploy)
git commit --allow-empty -m "trigger Railway deploy"
git push origin main
```

### Bước 4: Verify Deployment

Sau khi deploy xong, chạy test script:

```bash
cd backend
python test_track_audio.py
```

**Kết quả mong đợi:**
```
✅ Test PASSED - Endpoint hoạt động đúng!
Production: ✅ OK
```

### Bước 5: Test Frontend

1. Reload trang frontend: https://nearbite.vercel.app
2. Mở **Developer Console** (F12)
3. Bật tracking và nghe thuyết minh
4. Kiểm tra console:
   - ❌ Nếu vẫn thấy: `⚠️ Audio tracking endpoint not available yet (404)` → Railway chưa deploy xong
   - ✅ Nếu thấy: `✅ Audio duration tracked` → Đã hoạt động!

## 🐛 Troubleshooting

### Railway không tự động deploy sau khi push?

**Nguyên nhân:** Railway có thể:
- Tắt auto-deploy
- Connect sai branch
- Connect sai repo

**Cách fix:**
1. Railway Dashboard → Settings → GitHub → Check branch
2. Enable **Auto Deploy** nếu bị tắt
3. Hoặc deploy thủ công (xem Bước 3)

### Deployment failed?

**Check Railway Logs:**
1. Railway Dashboard → Deployments → Click deployment mới nhất
2. Xem tab **Build Logs** và **Deploy Logs**
3. Tìm error message (thường là missing dependencies)

**Common fixes:**
```bash
# Nếu thiếu packages
pip freeze > requirements.txt
git add requirements.txt
git commit -m "update requirements"
git push
```

### Endpoint vẫn 404 sau khi deploy?

**Verify code đã được deploy:**

```bash
# Check code trên GitHub
curl https://raw.githubusercontent.com/TuiLaZit/nearbite/main/backend/routes/user.py | grep "track-audio"

# Phải thấy: @app.route("/track-audio", methods=["POST"])
```

## 📝 Note

- Sau khi Railway deploy thành công, **KHÔNG CẦN** cập nhật frontend nữa
- Frontend đã sẵn sàng, chỉ cần backend có endpoints
- Các endpoints khác (`/restaurants`, `/location`) vẫn hoạt động bình thường
