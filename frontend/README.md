# Food Street - React + Vite Frontend

## 🚀 Chạy dự án

### Cài đặt dependencies
```bash
npm install
```

### Chạy development server
```bash
npm run dev
```

Server sẽ chạy tại `http://localhost:3000`

### Build production
```bash
npm run build
```

### Preview production build
```bash
npm run preview
```

## 📁 Cấu trúc dự án

```
frontend/
├── src/
│   ├── pages/
│   │   ├── LocationTracker.jsx    # Trang chính - theo dõi vị trí
│   │   ├── AdminLogin.jsx         # Trang đăng nhập admin
│   │   ├── AdminDashboard.jsx     # Trang quản lý quán
│   │   └── MenuManagement.jsx     # Trang quản lý menu
│   ├── App.jsx                    # Component chính
│   ├── main.jsx                   # Entry point
│   ├── config.js                  # Cấu hình API & ngôn ngữ
│   └── index.css                  # Global styles
├── index_new.html                 # HTML template
├── package.json
├── vite.config.js
└── .env.local                     # Environment variables
```

## 🔧 Cấu hình

File `.env.local`:
```
VITE_BASE_URL=https://nearbite.up.railway.app
```

## 📱 Routes

- `/` - Trang chính (Location Tracker)
- `/admin/login` - Đăng nhập admin
- `/admin` - Dashboard admin
- `/admin/menu/:restaurantId` - Quản lý menu của quán

## 🌟 Features

### User Features
- ✅ Tự động theo dõi vị trí GPS
- ✅ Hiển thị quán ăn gần nhất
- ✅ Phát audio giới thiệu tự động
- ✅ Hỗ trợ 14 ngôn ngữ
- ✅ Lưu ngôn ngữ đã chọn

### Admin Features
- ✅ Đăng nhập admin
- ✅ Thêm/sửa/xóa quán ăn
- ✅ Ẩn/khôi phục quán
- ✅ Quản lý menu cho từng quán
- ✅ Thêm/sửa/xóa món ăn

## 🛠️ Technologies

- **React 18** - UI library
- **Vite 5** - Build tool & dev server
- **React Router 6** - Routing
- **Geolocation API** - GPS tracking
- **Web Audio API** - Audio playback
