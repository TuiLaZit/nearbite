// Translation keys - Vietnamese text làm source
export const TRANSLATION_KEYS = {
  // Header
  appTitle: 'Bản Đồ Ẩm Thực',
  planTour: 'Xếp Tour',
  tourPlanning: 'Lên Kế Hoạch Tour',
  backToMap: 'Quay Lại Bản Đồ',
  
  // Tracking
  startTracking: 'Bắt Đầu Theo Dõi',
  stopTracking: 'Dừng Theo Dõi',
  currentLocation: 'Vị Trí Hiện Tại',
  
  // Tour form
  tourInfo: 'Thông tin tour',
  totalTime: 'Tổng thời gian',
  hours: 'giờ',
  budget: 'Ngân sách',
  selectTags: 'Chọn tags yêu thích',
  planTourNow: 'Xếp Tour Ngay',
  tourResults: 'Kết quả tour',
  planning: 'Đang lên kế hoạch...',
  
  // Tags
  loadingTags: 'Đang tải tags...',
  selectedTags: 'Đã chọn {count} tags',
  noTagsSelected: 'Chưa chọn tags nào',
  foodPreferences: 'Sở thích ăn uống',
  
  // Tour strategies
  bestScore: 'Điểm cao nhất',
  nearest: 'Gần nhất',
  cheapest: 'Rẻ nhất',
  
  // Tour details
  tour: 'Tour',
  tourStrategy: 'Chiến lược',
  tourSuggestions: 'Gợi ý {count} tour',
  totalRestaurants: 'Tổng số quán',
  restaurants: 'Quán ăn',
  restaurant_count: '{count} quán',
  totalCost: 'Tổng chi phí',
  time: 'Thời gian',
  cost: 'Chi phí',
  estimatedTime: 'Thời gian dự kiến',
  stops: 'Điểm dừng',
  distance: 'Khoảng cách',
  avgEatTime: 'Thời gian ăn',
  menuItems: 'Món ăn',
  travelTime: 'Thời gian di chuyển',
  from: 'Từ',
  description: 'Mô tả',
  cheapestItem: 'Món rẻ nhất',
  viewDirections: 'Xem chỉ đường',
  
  // Messages
  fetching: 'Đang lấy vị trí...',
  loading: 'Đang tải...',
  error: 'Lỗi',
  noTours: 'Không tìm thấy tour phù hợp',
  geolocationError: 'Trình duyệt không hỗ trợ định vị',
  fetchingTags: 'Đang tải tags...',
  planningTour: 'Đang lên kế hoạch tour...',
  connectionError: 'Lỗi kết nối',
  
  // Units
  km: 'km',
  vnd: 'đ',
  minutes: 'phút',
  minute: 'phút',
  meter: 'm',
  
  // Time hints
  timeRangeHint: 'Từ 30 phút đến 8 giờ',

  // POI menu modal
  viewMenu: 'Xem menu',
  menuAndPrice: 'Menu và giá',
  close: 'Đóng',
  noMenuInPoi: 'Quán này hiện chưa có menu để hiển thị.',

  // Common customer flow
  backToMapArrow: 'Về bản đồ',
  loadingRestaurantInfo: 'Đang tải thông tin...',
  loadRestaurantInfoFailed: 'Không thể tải thông tin. Vui lòng thử lại.',
  directionButton: 'Chỉ đường',
  listenButton: 'Nghe',
  stopButton: 'Dừng',
  listenNarrationButton: 'Nghe thuyết minh',
  login: 'Đăng nhập',
  logout: 'Đăng xuất',
  yourDistance: 'Khoảng cách',
  gpsNotSupported: 'Trình duyệt không hỗ trợ GPS',
  gpsPermissionError: 'Không thể lấy vị trí GPS. Vui lòng bật GPS và cho phép truy cập.',

  // Customer login
  back: 'Quay lại',
  customerLoginTitle: 'Đăng nhập khách hàng',
  emailLabel: 'Email',
  sendOtp: 'Gửi OTP',
  sending: 'Đang gửi...',
  otpSentToEmail: 'OTP đã được gửi tới {email}. Vui lòng nhập mã để đăng nhập.',
  otpCodeLabel: 'Mã OTP',
  otpPlaceholder: 'Nhập 6 số OTP',
  otpLocalLabel: 'OTP local',
  verifying: 'Đang xác nhận...',
  verifyOtp: 'Xác nhận OTP',
  resendOtp: 'Gửi lại OTP',
  changeEmail: 'Đổi email',
  cannotSendOtp: 'Không gửi được OTP',
  invalidOtp: 'OTP không hợp lệ',

  // Role selection
  portalTitle: 'NearBite Portal',
  chooseRoleToLogin: 'Chọn loại tài khoản để đăng nhập',
  customerRole: 'Khách hàng',
  ownerRole: 'Chủ quán',
  customerRoleDesc: 'Đăng nhập bằng email + OTP để khám phá và lập tour ăn uống.',
  ownerRoleDesc: 'Đăng nhập bằng tài khoản do admin cấp để quản lý quán.'
}

// Helper để lấy tất cả values cần dịch
export const getAllTranslatableTexts = () => {
  return Object.values(TRANSLATION_KEYS)
}
