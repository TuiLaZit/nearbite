// config/api.js
// Lấy BASE_URL từ biến môi trường hoặc window object
const BASE_URL = window.BASE_URL || (typeof process !== 'undefined' && process.env.BASE_URL);
// const BASE_URL = "http://127.0.0.1:5000"; // dùng khi dev local
