import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { BASE_URL } from '../config'
import { useTranslation } from '../hooks/useTranslation'
import { useAppLanguage } from '../hooks/useAppLanguage'

const DEFAULT_COMMISSION_RATE = 0.1

function CustomerOrders() {
  const navigate = useNavigate()
  const location = useLocation()
  const { restaurantId: routeRestaurantId } = useParams()

  const queryRestaurantId = useMemo(() => {
    const params = new URLSearchParams(location.search)
    return params.get('restaurantId')
  }, [location.search])

  const requestedRestaurantId = routeRestaurantId || queryRestaurantId || ''

  const [restaurants, setRestaurants] = useState([])
  const { language, setLanguage } = useAppLanguage()
  const [languages, setLanguages] = useState([])
  const { t } = useTranslation(language)
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('')
  const [checkoutStep, setCheckoutStep] = useState(1)
  const [quantities, setQuantities] = useState({})
  const [orderType, setOrderType] = useState('pickup')
  const [paymentMethod, setPaymentMethod] = useState('cod')
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [note, setNote] = useState('')
  const [transferConfirmed, setTransferConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [orderHistory, setOrderHistory] = useState([])
  const [historyError, setHistoryError] = useState('')
  const [dynamicTranslations, setDynamicTranslations] = useState({})
  const [loading, setLoading] = useState(true)

  const selectedRestaurant = useMemo(() => {
    return restaurants.find((r) => String(r.id) === String(selectedRestaurantId)) || null
  }, [restaurants, selectedRestaurantId])

  const isRestaurantLocked = useMemo(() => {
    if (!requestedRestaurantId) return false
    return restaurants.some((r) => String(r.id) === String(requestedRestaurantId))
  }, [restaurants, requestedRestaurantId])

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

  const transferContent = useMemo(() => {
    const restaurantCode = selectedRestaurantId || 'X'
    const amountCode = total || 0
    return `NB-${restaurantCode}-${amountCode}`
  }, [selectedRestaurantId, total])

  const translateDynamicText = (text) => {
    if (!text) return ''
    return dynamicTranslations[text] || text
  }

  const fetchRestaurants = async () => {
    const response = await fetch(`${BASE_URL}/restaurants`)
    if (!response.ok) {
      throw new Error(t('error'))
    }

    const data = await response.json()
    const restaurantList = data.restaurants || []
    setRestaurants(restaurantList)

    if (restaurantList.length === 0) {
      setSelectedRestaurantId('')
      return
    }

    if (requestedRestaurantId) {
      const matchedRestaurant = restaurantList.find((restaurant) => String(restaurant.id) === String(requestedRestaurantId))
      if (matchedRestaurant) {
        setSelectedRestaurantId(String(matchedRestaurant.id))
        return
      }
    }

    if (!selectedRestaurantId) {
      setSelectedRestaurantId(String(restaurantList[0].id))
    }
  }

  const fetchLanguages = async () => {
    const response = await fetch(`${BASE_URL}/languages`)
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.status !== 'success') {
      return
    }
    setLanguages(Array.isArray(data.languages) ? data.languages : [])
  }

  const fetchOrderHistory = async () => {
    const response = await fetch(`${BASE_URL}/customer/orders`, {
      credentials: 'include'
    })

    if (response.status === 401) {
      navigate('/customer/login', { replace: true })
      return
    }

    if (!response.ok) {
      setOrderHistory([])
      setHistoryError(t('cannotLoadOrderHistoryNow'))
      return
    }

    const data = await response.json()
    setOrderHistory(Array.isArray(data) ? data : [])
    setHistoryError('')
  }

  useEffect(() => {
    Promise.all([fetchRestaurants(), fetchLanguages()])
      .catch((error) => alert(error.message))
      .finally(async () => {
        await fetchOrderHistory()
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (orderType === 'delivery') {
      setPaymentMethod('online_demo')
    }
    setTransferConfirmed(false)
  }, [orderType])

  useEffect(() => {
    const translateDynamicTexts = async () => {
      if (language === 'vi') {
        setDynamicTranslations({})
        return
      }

      const sourceTexts = new Set()

      restaurants.forEach((restaurant) => {
        if (restaurant.name) sourceTexts.add(restaurant.name)
        ;(restaurant.menu || []).forEach((item) => {
          if (item.name) sourceTexts.add(item.name)
        })
      })

      orderHistory.forEach((order) => {
        if (order.restaurant_name) sourceTexts.add(order.restaurant_name)
        ;(order.items || []).forEach((item) => {
          if (item.item_name) sourceTexts.add(item.item_name)
        })
      })

      const texts = Array.from(sourceTexts)
      if (texts.length === 0) {
        setDynamicTranslations({})
        return
      }

      try {
        const response = await fetch(`${BASE_URL}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts, target_lang: language })
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok || data.status !== 'success') {
          return
        }

        setDynamicTranslations(data.translations || {})
      } catch {
        // Ignore translation failure and keep original Vietnamese text.
      }
    }

    translateDynamicTexts()
  }, [language, restaurants, orderHistory])

  useEffect(() => {
    setTransferConfirmed(false)
  }, [paymentMethod, selectedRestaurantId, total])

  const handleRestaurantChange = (event) => {
    setSelectedRestaurantId(event.target.value)
    setQuantities({})
    setCheckoutStep(1)
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
      pending: t('waitingForConfirm'),
      confirmed: t('confirmed'),
      delivering: t('deliveringLabel'),
      delivered: t('deliveredLabel'),
      completed: t('completedLabel'),
      cancelled: t('cancelledLabel')
    }
    return statusMap[status] || status
  }

  const handleGoToCheckout = () => {
    if (!selectedRestaurantId) {
      alert(t('cannotFindRestaurantToOrder'))
      return
    }

    if (selectedItems.length === 0) {
      alert(t('selectAtLeastOneItemBeforeContinue'))
      return
    }

    setCheckoutStep(2)
  }

  const copyTransferContent = async () => {
    try {
      await navigator.clipboard.writeText(transferContent)
      alert(t('copiedTransferContent'))
    } catch {
      alert(`${t('transferContentLabel')}: ${transferContent}`)
    }
  }

  const handleSubmitOrder = async (event) => {
    event.preventDefault()

    if (!selectedRestaurantId) {
      alert(t('selectRestaurantFirst'))
      return
    }

    if (selectedItems.length === 0) {
      alert(t('selectAtLeastOneItem'))
      return
    }

    if (orderType === 'delivery' && !deliveryAddress.trim()) {
      alert(t('inputDeliveryAddressRequired'))
      return
    }

    if (orderType === 'delivery' && deliveryAddress.trim().length < 5) {
      alert(t('deliveryAddressTooShort'))
      return
    }

    if (paymentMethod === 'online_demo' && !transferConfirmed) {
      alert(t('finishTransferBeforeOrder'))
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
        throw new Error(data.error || t('cannotCreateOrder'))
      }

      alert(t('orderSuccessMessage'))
      setQuantities({})
      setDeliveryAddress('')
      setNote('')
      setOrderType('pickup')
      setPaymentMethod('cod')
      setTransferConfirmed(false)
      setCheckoutStep(1)
      await fetchOrderHistory()
    } catch (error) {
      alert(error.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div style={styles.loading}>{t('loadingOrderPage')}</div>
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <h1 style={styles.title}>
          🧾 {selectedRestaurant ? t('orderForRestaurant', { name: translateDynamicText(selectedRestaurant.name) }) : t('orderFood')}
        </h1>
        <div style={styles.headerActions}>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            style={styles.languageSelect}
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.label}</option>
            ))}
          </select>
          <button style={styles.backButton} onClick={() => navigate('/customer')}>
            ← {t('backToMapArrow')}
          </button>
        </div>
      </div>

      <div style={styles.grid}>
        <section style={styles.card}>
          <h3>{t('createNewOrder')}</h3>

          {!isRestaurantLocked && (
            <label style={styles.formField}>
              {t('chooseRestaurant')}
              <select value={selectedRestaurantId} onChange={handleRestaurantChange} required>
                {restaurants.map((restaurant) => (
                  <option key={restaurant.id} value={restaurant.id}>
                    {translateDynamicText(restaurant.name)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div style={styles.stepRow}>
            <div style={checkoutStep === 1 ? styles.activeStepChip : styles.stepChip}>1. {t('chooseDish')}</div>
            <div style={checkoutStep === 2 ? styles.activeStepChip : styles.stepChip}>2. {t('receiveAndPayment')}</div>
          </div>

          {checkoutStep === 1 && (
            <div style={styles.form}>
              <div>
                <div style={styles.subTitle}>{t('menuOfRestaurant')}</div>
                {(selectedRestaurant?.menu || []).length === 0 && <p>{t('noMenuYet')}</p>}
                <div style={styles.menuList}>
                  {(selectedRestaurant?.menu || []).map((item) => (
                    <div key={item.id} style={styles.menuRow}>
                      <div>
                        <strong>{translateDynamicText(item.name)}</strong>
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

              <div style={styles.totalsBox}>
                <div>{t('subtotal')}: <strong>{formatCurrency(subtotal)}</strong></div>
                <div>{t('platformFee')}: <strong>{formatCurrency(commission)}</strong></div>
                <div>{t('estimatedTotal')}: <strong>{formatCurrency(total)}</strong></div>
              </div>

              <button type="button" onClick={handleGoToCheckout} disabled={selectedItems.length === 0} style={styles.submitButton}>
                {t('continueCheckout')}
              </button>
            </div>
          )}

          {checkoutStep === 2 && (
            <form onSubmit={handleSubmitOrder} style={styles.form}>
              <div>
                <div style={styles.subTitle}>{t('receiveMethod')}</div>
                <label style={styles.radioLine}>
                  <input
                    type="radio"
                    checked={orderType === 'pickup'}
                    onChange={() => setOrderType('pickup')}
                  />
                  {t('pickupAtRestaurant')}
                </label>
                <label style={styles.radioLine}>
                  <input
                    type="radio"
                    checked={orderType === 'delivery'}
                    onChange={() => setOrderType('delivery')}
                  />
                  {t('deliveryToAddress')}
                </label>
              </div>

              {orderType === 'delivery' && (
                <label style={styles.formField}>
                  {t('deliveryAddress')}
                  <textarea
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    rows={3}
                    placeholder={t('deliveryAddressPlaceholder')}
                    required
                  />
                </label>
              )}

              <div>
                <div style={styles.subTitle}>{t('paymentMethod')}</div>
                {orderType === 'delivery' ? (
                  <label style={styles.radioLine}>
                    <input type="radio" checked readOnly />
                    {t('onlineRequiredForDelivery')}
                  </label>
                ) : (
                  <>
                    <label style={styles.radioLine}>
                      <input
                        type="radio"
                        checked={paymentMethod === 'cod'}
                        onChange={() => setPaymentMethod('cod')}
                      />
                      {t('codAtPickup')}
                    </label>
                    <label style={styles.radioLine}>
                      <input
                        type="radio"
                        checked={paymentMethod === 'online_demo'}
                        onChange={() => setPaymentMethod('online_demo')}
                      />
                      {t('onlinePlatformPayment')}
                    </label>
                  </>
                )}
              </div>

              {paymentMethod === 'online_demo' && (
                <div style={styles.transferBox}>
                  <div style={styles.transferTitle}>{t('transferDemo')}</div>
                  <div>{t('bankLabel')}: <strong>MB Bank (Demo)</strong></div>
                  <div>{t('accountNumberLabel')}: <strong>0123456789</strong></div>
                  <div>{t('accountNameLabel')}: <strong>NEARBITE DEMO</strong></div>
                  <div>{t('amountLabel')}: <strong>{formatCurrency(total)}</strong></div>
                  <div>
                    {t('transferContentLabel')}: <strong>{transferContent}</strong>
                    <button type="button" onClick={copyTransferContent} style={styles.copyButton}>
                      {t('copyButton')}
                    </button>
                  </div>
                  <label style={styles.confirmLine}>
                    <input
                      type="checkbox"
                      checked={transferConfirmed}
                      onChange={(e) => setTransferConfirmed(e.target.checked)}
                    />
                    {t('transferConfirmedDemo')}
                  </label>
                </div>
              )}

              <label style={styles.formField}>
                {t('orderNote')}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder={t('orderNotePlaceholder')}
                />
              </label>

              <div style={styles.totalsBox}>
                <div>{t('subtotal')}: <strong>{formatCurrency(subtotal)}</strong></div>
                <div>{t('platformFee')}: <strong>{formatCurrency(commission)}</strong></div>
                <div>{t('totalPayment')}: <strong>{formatCurrency(total)}</strong></div>
              </div>

              <div style={styles.actionRow}>
                <button type="button" style={styles.secondaryButton} onClick={() => setCheckoutStep(1)}>
                  ← {t('backToChooseDish')}
                </button>
                <button
                  type="submit"
                  disabled={submitting || selectedItems.length === 0 || (paymentMethod === 'online_demo' && !transferConfirmed)}
                  style={styles.submitButton}
                >
                  {submitting ? t('sendingOrder') : t('confirmOrder')}
                </button>
              </div>
            </form>
          )}
        </section>

        <section style={styles.card}>
          <h3>{t('orderHistory')}</h3>
          {historyError && <p style={styles.warningText}>{historyError}</p>}
          {!historyError && orderHistory.length === 0 && <p>{t('noOrdersYet')}</p>}
          <div style={styles.historyList}>
            {orderHistory.map((order) => (
              <article key={order.id} style={styles.historyItem}>
                <div style={styles.historyTop}>
                  <strong>#{order.id} - {translateDynamicText(order.restaurant_name) || `Quán #${order.restaurant_id}`}</strong>
                  <span>{getOrderStatusLabel(order.order_status)}</span>
                </div>
                <div>{t('orderType')}: {order.order_type === 'delivery' ? t('deliveryLabel') : t('pickupLabel')}</div>
                <div>{t('payment')}: {order.payment_status === 'paid_demo' ? t('onlineDemoPaid') : t('codPending')}</div>
                {order.delivery_address && <div>{t('deliveryAddress')}: {order.delivery_address}</div>}
                <div>{t('dishes')}:</div>
                <ul style={styles.itemList}>
                  {(order.items || []).map((item) => (
                    <li key={item.id}>{translateDynamicText(item.item_name)} x{item.quantity} - {formatCurrency(item.line_total)}</li>
                  ))}
                </ul>
                <div>{t('totalPayment')}: <strong>{formatCurrency(order.total_amount)}</strong></div>
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
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  languageSelect: {
    padding: '10px 12px',
    borderRadius: '8px',
    border: '2px solid #ddd',
    background: '#fff',
    minWidth: '110px',
    fontSize: '13px',
    cursor: 'pointer'
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
  formField: {
    display: 'grid',
    gap: '6px'
  },
  stepRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '12px'
  },
  stepChip: {
    border: '1px solid #cbd5e1',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '12px',
    color: '#475569',
    background: '#f8fafc'
  },
  activeStepChip: {
    border: '1px solid #2563eb',
    borderRadius: '999px',
    padding: '6px 10px',
    fontSize: '12px',
    color: '#1d4ed8',
    background: '#dbeafe',
    fontWeight: '700'
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
  actionRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px'
  },
  secondaryButton: {
    padding: '12px 14px',
    border: '1px solid #cbd5e1',
    borderRadius: '8px',
    background: '#fff',
    color: '#1e293b',
    fontWeight: '600',
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
  },
  warningText: {
    margin: '8px 0 10px',
    padding: '8px 10px',
    borderRadius: '8px',
    background: '#fffbeb',
    border: '1px solid #fde68a',
    color: '#92400e',
    fontSize: '13px'
  },
  transferBox: {
    border: '1px solid #bfdbfe',
    background: '#eff6ff',
    borderRadius: '10px',
    padding: '10px',
    display: 'grid',
    gap: '6px',
    fontSize: '14px'
  },
  transferTitle: {
    fontWeight: '700',
    color: '#1d4ed8'
  },
  copyButton: {
    marginLeft: '8px',
    padding: '4px 8px',
    fontSize: '12px',
    borderRadius: '6px',
    border: '1px solid #93c5fd',
    background: '#fff',
    cursor: 'pointer'
  },
  confirmLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '4px',
    fontWeight: '600'
  }
}

export default CustomerOrders
