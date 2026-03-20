import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BASE_URL } from '../config'

const DEFAULT_COMMISSION_RATE = 0.1

function CustomerOrders() {
  const navigate = useNavigate()
  const [restaurants, setRestaurants] = useState([])
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('')
  const [quantities, setQuantities] = useState({})
  const [orderType, setOrderType] = useState('pickup')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [orderHistory, setOrderHistory] = useState([])
  const [loading, setLoading] = useState(true)

  const selectedRestaurant = useMemo(() => {
    return restaurants.find((r) => String(r.id) === String(selectedRestaurantId)) || null
  }, [restaurants, selectedRestaurantId])

  const selectedItems = useMemo(() => {
    const menu = selectedRestaurant?.menu || []
    return menu
      .map((item) => {
        const quantity = Number(quantities[item.id] || 0)
        if (quantity <= 0) return null
        return {
          menu_item_id: item.id,
          name: item.name,
          price: item.price,
          quantity,
          lineTotal: item.price * quantity
        }
      })
      .filter(Boolean)
  }, [selectedRestaurant, quantities])

  const subtotal = useMemo(() => {
    return selectedItems.reduce((sum, item) => sum + item.lineTotal, 0)
  }, [selectedItems])

  const commission = useMemo(() => {
    return Math.round(subtotal * DEFAULT_COMMISSION_RATE)
  }, [subtotal])

  const total = subtotal + commission

  const fetchRestaurants = async () => {
    const response = await fetch(`${BASE_URL}/restaurants`)
    if (!response.ok) {
      throw new Error('Không thể tải danh sách quán')
    }

    const data = await response.json()
    const restaurantList = data.restaurants || []
    setRestaurants(restaurantList)
    if (!selectedRestaurantId && restaurantList.length > 0) {
      setSelectedRestaurantId(String(restaurantList[0].id))
    }
  }

  const fetchOrderHistory = async () => {
    const response = await fetch(`${BASE_URL}/customer/orders`, {
      credentials: 'include'
    })

    if (!response.ok) {
      throw new Error('Không thể tải lịch sử đơn hàng')
    }

    const data = await response.json()
    setOrderHistory(Array.isArray(data) ? data : [])
  }

  useEffect(() => {
    Promise.all([fetchRestaurants(), fetchOrderHistory()])
      .catch((error) => alert(error.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (orderType === 'delivery') {
      setPaymentMethod('online_demo')
    }
  }, [orderType])

  const handleRestaurantChange = (event) => {
    setSelectedRestaurantId(event.target.value)
    setQuantities({})
  }

  const handleQuantityChange = (menuItemId, value) => {
    const quantity = Math.max(0, Number(value || 0))
    setQuantities((prev) => ({
      ...prev,
      [menuItemId]: quantity
    }))
  }

  const formatCurrency = (amount) => {
    return Number(amount || 0).toLocaleString('vi-VN') + 'đ'
  }

  const getOrderStatusLabel = (status) => {
    const statusMap = {
      pending: 'Chờ xác nhận',
      confirmed: 'Đã xác nhận',
      delivering: 'Đang giao',
      delivered: 'Đã giao xong',
      completed: 'Hoàn tất',
      cancelled: 'Đã hủy'
    }
    return statusMap[status] || status
  }

  const handleSubmitOrder = async (event) => {
    event.preventDefault()

    if (!selectedRestaurantId) {
      alert('Vui lòng chọn quán')
      return
    }

    if (selectedItems.length === 0) {
      alert('Vui lòng chọn ít nhất 1 món')
      return
    }

    if (orderType === 'delivery' && !deliveryAddress.trim()) {
      alert('Vui lòng nhập địa chỉ giao hàng')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch(`${BASE_URL}/customer/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          restaurant_id: Number(selectedRestaurantId),
          order_type: orderType,
          delivery_address: orderType === 'delivery' ? deliveryAddress.trim() : '',
          payment_method: paymentMethod,
          note: note.trim(),
          items: selectedItems.map((item) => ({
            menu_item_id: item.menu_item_id,
            quantity: item.quantity
          }))
        })
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data.error || 'Không thể tạo đơn hàng')
      }

      alert('Đặt món thành công! Chủ quán sẽ xử lý đơn sớm nhất.')
      setQuantities({})
      setDeliveryAddress('')
      setNote('')
      setOrderType('pickup')
      setPaymentMethod('cod')
      await fetchOrderHistory()
    } catch (error) {
      alert(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={styles.loading}>Đang tải trang đặt món...</div>
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>🧾 Đặt Món</h1>
        <button style={styles.backButton} onClick={() => navigate('/customer')}>
          ← Về bản đồ
        </button>
      </div>

      <div style={styles.grid}>
        <section style={styles.card}>
          <h3>Tạo đơn mới</h3>
          <form onSubmit={handleSubmitOrder} style={styles.form}>
            <label>
              Chọn quán
              <select value={selectedRestaurantId} onChange={handleRestaurantChange} required>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {restaurant.name}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <div style={styles.subTitle}>Chọn món</div>
              {(selectedRestaurant?.menu || []).length === 0 && <p>Quán này chưa có menu.</p>}
              <div style={styles.menuList}>
                {(selectedRestaurant?.menu || []).map((item) => (
                  <div key={item.id} style={styles.menuRow}>
                    <div>
                      <strong>{item.name}</strong>
                      <div style={styles.price}>{formatCurrency(item.price)}</div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={quantities[item.id] || 0}
                      onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                      style={styles.qtyInput}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={styles.subTitle}>Hình thức nhận món</div>
              <label style={styles.radioLine}>
                <input
                  type="radio"
                  checked={orderType === 'pickup'}
                  onChange={() => setOrderType('pickup')}
                />
                Đặt trước tại quán (Pickup)
              </label>
              <label style={styles.radioLine}>
                <input
                  type="radio"
                  checked={orderType === 'delivery'}
                  onChange={() => setOrderType('delivery')}
                />
                Giao hàng tận nơi (Delivery)
              </label>
            </div>

            {orderType === 'delivery' && (
              <label>
                Địa chỉ giao hàng
                <textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  rows={3}
                  placeholder="Nhập địa chỉ chi tiết"
                  required
                />
              </label>
            )}

            <div>
              <div style={styles.subTitle}>Phương thức thanh toán</div>
              {orderType === 'delivery' ? (
                <label style={styles.radioLine}>
                  <input type="radio" checked readOnly />
                  Online demo (bắt buộc cho delivery)
                </label>
              ) : (
                <>
                  <label style={styles.radioLine}>
                    <input
                      type="radio"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                    />
                    Thanh toán khi nhận món (COD)
                  </label>
                  <label style={styles.radioLine}>
                    <input
                      type="radio"
                      checked={paymentMethod === 'online_demo'}
                      onChange={() => setPaymentMethod('online_demo')}
                    />
                    Online demo
                  </label>
                </>
              )}
            </div>

            <label>
              Ghi chú đơn hàng
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Ví dụ: ít cay, thêm đũa..."
              />
            </label>

            <div style={styles.totalsBox}>
              <div>Tạm tính: <strong>{formatCurrency(subtotal)}</strong></div>
              <div>Phí nền tảng demo (~10%): <strong>{formatCurrency(commission)}</strong></div>
              <div>Tổng thanh toán: <strong>{formatCurrency(total)}</strong></div>
            </div>

            <button type="submit" disabled={submitting || selectedItems.length === 0} style={styles.submitButton}>
              {submitting ? 'Đang gửi đơn...' : 'Xác nhận đặt món'}
            </button>
          </form>
        </section>

        <section style={styles.card}>
          <h3>Lịch sử đơn hàng</h3>
          {orderHistory.length === 0 && <p>Bạn chưa có đơn hàng nào.</p>}
          <div style={styles.historyList}>
            {orderHistory.map((order) => (
              <article key={order.id} style={styles.historyItem}>
                <div style={styles.historyTop}>
                  <strong>#{order.id} - {order.restaurant_name || `Quán #${order.restaurant_id}`}</strong>
                  <span>{getOrderStatusLabel(order.order_status)}</span>
                </div>
                <div>Loại đơn: {order.order_type === 'delivery' ? 'Giao hàng' : 'Đặt trước'}</div>
                <div>Thanh toán: {order.payment_status === 'paid_demo' ? 'Online demo' : 'COD chờ thu'}</div>
                {order.delivery_address && <div>Địa chỉ: {order.delivery_address}</div>}
                <div>Món:</div>
                <ul style={styles.itemList}>
                  {(order.items || []).map((item) => (
                    <li key={item.id}>{item.item_name} x{item.quantity} - {formatCurrency(item.line_total)}</li>
                  ))}
                </ul>
                <div>Tổng: <strong>{formatCurrency(order.total_amount)}</strong></div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#f8fafc',
    padding: '24px'
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '16px'
  },
  title: {
    margin: 0
  },
  backButton: {
    padding: '10px 14px',
    borderRadius: '8px',
    border: 'none',
    background: '#0f172a',
    color: '#fff',
    cursor: 'pointer'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: '16px'
  },
  card: {
    background: '#fff',
    borderRadius: '12px',
    border: '1px solid #e2e8f0',
    padding: '16px'
  },
  form: {
    display: 'grid',
    gap: '12px'
  },
  subTitle: {
    fontWeight: '600',
    marginBottom: '8px'
  },
  menuList: {
    display: 'grid',
    gap: '8px',
    maxHeight: '260px',
    overflowY: 'auto',
    paddingRight: '4px'
  },
  menuRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    border: '1px solid #e2e8f0',
    borderRadius: '8px',
    padding: '8px 10px'
  },
  price: {
    color: '#475569',
    fontSize: '13px'
  },
  qtyInput: {
    width: '70px',
    padding: '6px'
  },
  radioLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '6px'
  },
  totalsBox: {
    border: '1px dashed #cbd5e1',
    borderRadius: '10px',
    padding: '10px',
    background: '#f8fafc',
    display: 'grid',
    gap: '4px'
  },
  submitButton: {
    padding: '12px 14px',
    border: 'none',
    borderRadius: '8px',
    background: '#2563eb',
    color: '#fff',
    fontWeight: '700',
    cursor: 'pointer'
  },
  historyList: {
    display: 'grid',
    gap: '10px',
    maxHeight: '70vh',
    overflowY: 'auto'
  },
  historyItem: {
    border: '1px solid #e2e8f0',
    borderRadius: '10px',
    padding: '10px',
    display: 'grid',
    gap: '4px'
  },
  historyTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px'
  },
  itemList: {
    margin: '0 0 0 18px',
    padding: 0
  },
  loading: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
}

export default CustomerOrders
