-- =====================================================
-- Complete Data Migration SQL
-- Includes: Restaurant, Menu, Tags, Restaurant-Tag mappings, and sample images
-- Run this AFTER running supabase_complete_migration.sql
-- Date: 2026-01-26
-- =====================================================

-- =====================================================
-- 1. Insert Restaurant Data
-- =====================================================

INSERT INTO restaurant (id, name, lat, lng, description, avg_eat_time, is_active) VALUES 
(1, 'Bún bò Huế cô Ba', 10.7765, 106.7009, 'Quán bún bò truyền thống hơn 20 năm', 25, TRUE),
(2, 'Bánh mì cô Hoa', 10.7752, 106.7021, 'Bánh mì nóng giòn, nhân đầy đặn', 10, TRUE),
(3, 'Phở Minh', 10.774, 106.6995, 'Phở bò gia truyền, nước dùng đậm đà', 30, TRUE),
(4, 'Cơm Tấm Tuấn Ngọc', 10.7736, 106.6966, 'Cơm tấm sườn nướng đậm vị, ăn cùng chả, bì, nước mắm', 25, TRUE),
(5, 'Quán Lươn Thanh Tuấn', 10.7725, 106.6951, 'Chuyên các món về lươn', 50, TRUE),
(7, 'Cổng Trước SGU', 10.760516973033758, 106.68174588750001, 'Các món ăn vỉa hè cổng trước SGU', 25, TRUE),
(8, 'Cổng Sau SGU', 10.759128923228175, 106.68277047686901, 'Các món ăn vỉa hè cổng sau SGU', 25, TRUE);

-- =====================================================
-- 2. Insert Menu Item Data
-- =====================================================

INSERT INTO menu_item (id, name, price, restaurant_id) VALUES 
(1, 'Bún bò đặc biệt', 46000, 1),
(2, 'Bún bò giò', 40000, 1),
(16, 'Bún Bò Tái', 36000, 1),
(4, 'Bánh mì thịt', 20000, 2),
(5, 'Bánh mì trứng', 18000, 2),
(6, 'Bánh mì xíu mại', 25000, 2),
(7, 'Phở bò tái', 50000, 3),
(8, 'Phở bò viên', 48000, 3),
(9, 'Phở gà', 45000, 3),
(10, 'Cơm Sườn', 35000, 4),
(11, 'Cơm Sườn Chả', 45000, 4),
(12, 'Cơm Sườn Bì Chả', 55000, 4),
(13, 'Lươn Nướng', 120000, 5),
(14, 'Cháo Lươn', 50000, 5),
(15, 'Miến Lươn', 45000, 5),
(17, 'Cơm trộn thập cẩm', 25000, 7),
(18, 'Bánh Cuốn', 25000, 7),
(19, 'Bánh Mì', 15000, 7),
(20, 'Bánh mì thịt nướng', 15000, 8),
(21, 'Phở Tái', 30000, 8),
(22, 'Matcha Latte', 25000, 8);

-- =====================================================
-- 3. Insert Tag Data
-- =====================================================

INSERT INTO tag (id, name, icon, color, description) VALUES 
(1, 'Món nước', '🍜', '#3498db', 'Các món ăn có nước dùng như phở, bún, hủ tiếu'),
(2, 'Món khô', '🍚', '#e67e22', 'Các món ăn khô như cơm, bánh mì, xôi'),
(3, 'Ăn nhẹ', '🥖', '#f39c12', 'Các món ăn nhẹ, ăn vặt, thích hợp cho bữa phụ'),
(4, 'Ăn no', '🍽️', '#2ecc71', 'Các món ăn chính, đầy đủ dinh dưỡng'),
(5, 'Món mặn', '🧂', '#e74c3c', 'Các món ăn có vị mặn, thích hợp cho bữa chính'),
(6, 'Món ngọt', '🍰', '#9b59b6', 'Các món ăn ngọt, tráng miệng, đồ uống'),
(7, 'Giá rẻ', '💰', '#27ae60', 'Các món ăn có giá cả phải chăng dưới 30k'),
(8, 'Cao cấp', '⭐', '#c0392b', 'Các món cao cấp, giá trên 100k'),
(9, 'Đồ uống', '☕', '#16a085', 'Các loại nước uống, trà, cà phê'),
(10, 'Truyền thống', '🏮', '#d35400', 'Các món ăn truyền thống Việt Nam');

-- =====================================================
-- 4. Insert Restaurant-Tag Mappings
-- =====================================================

-- Bún bò Huế cô Ba: món nước, ăn no, món mặn, giá rẻ, truyền thống
INSERT INTO restaurant_tag (restaurant_id, tag_id) VALUES 
(1, 1), (1, 4), (1, 5), (1, 7), (1, 10);

-- Bánh mì cô Hoa: món khô, ăn nhẹ, món mặn, giá rẻ
INSERT INTO restaurant_tag (restaurant_id, tag_id) VALUES 
(2, 2), (2, 3), (2, 5), (2, 7);

-- Phở Minh: món nước, ăn no, món mặn, truyền thống
INSERT INTO restaurant_tag (restaurant_id, tag_id) VALUES 
(3, 1), (3, 4), (3, 5), (3, 10);

-- Cơm Tấm Tuấn Ngọc: món khô, ăn no, món mặn, giá rẻ, truyền thống
INSERT INTO restaurant_tag (restaurant_id, tag_id) VALUES 
(4, 2), (4, 4), (4, 5), (4, 7), (4, 10);

-- Quán Lươn Thanh Tuấn: món mặn, ăn no, cao cấp, truyền thống
INSERT INTO restaurant_tag (restaurant_id, tag_id) VALUES 
(5, 5), (5, 4), (5, 8), (5, 10);

-- Cổng Trước SGU: món khô, món nước, ăn nhẹ, giá rẻ
INSERT INTO restaurant_tag (restaurant_id, tag_id) VALUES 
(7, 2), (7, 1), (7, 3), (7, 7);

-- Cổng Sau SGU: món khô, món nước, ăn nhẹ, giá rẻ, đồ uống
INSERT INTO restaurant_tag (restaurant_id, tag_id) VALUES 
(8, 2), (8, 1), (8, 3), (8, 7), (8, 9);

-- =====================================================
-- 5. Insert Restaurant Image Data (Sample URLs)
-- =====================================================
-- Note: Replace these placeholder URLs with actual image URLs after uploading

-- Bún bò Huế cô Ba
INSERT INTO restaurant_image (restaurant_id, image_url, caption, display_order, is_primary) VALUES 
(1, 'https://placeholder-image-url.com/bun-bo-1.jpg', 'Tô bún bò đặc biệt', 1, TRUE),
(1, 'https://placeholder-image-url.com/bun-bo-2.jpg', 'Không gian quán', 2, FALSE),
(1, 'https://placeholder-image-url.com/bun-bo-3.jpg', 'Nước dùng đậm đà', 3, FALSE);

-- Bánh mì cô Hoa
INSERT INTO restaurant_image (restaurant_id, image_url, caption, display_order, is_primary) VALUES 
(2, 'https://placeholder-image-url.com/banh-mi-1.jpg', 'Bánh mì thịt đặc biệt', 1, TRUE),
(2, 'https://placeholder-image-url.com/banh-mi-2.jpg', 'Xe bánh mì', 2, FALSE);

-- Phở Minh
INSERT INTO restaurant_image (restaurant_id, image_url, caption, display_order, is_primary) VALUES 
(3, 'https://placeholder-image-url.com/pho-1.jpg', 'Tô phở bò tái', 1, TRUE),
(3, 'https://placeholder-image-url.com/pho-2.jpg', 'Quán phở', 2, FALSE),
(3, 'https://placeholder-image-url.com/pho-3.jpg', 'Gia vị ăn kèm', 3, FALSE);

-- Cơm Tấm Tuấn Ngọc
INSERT INTO restaurant_image (restaurant_id, image_url, caption, display_order, is_primary) VALUES 
(4, 'https://placeholder-image-url.com/com-tam-1.jpg', 'Cơm sườn bì chả', 1, TRUE),
(4, 'https://placeholder-image-url.com/com-tam-2.jpg', 'Sườn nướng', 2, FALSE);

-- Quán Lươn Thanh Tuấn
INSERT INTO restaurant_image (restaurant_id, image_url, caption, display_order, is_primary) VALUES 
(5, 'https://placeholder-image-url.com/luon-1.jpg', 'Lươn nướng', 1, TRUE),
(5, 'https://placeholder-image-url.com/luon-2.jpg', 'Cháo lươn', 2, FALSE),
(5, 'https://placeholder-image-url.com/luon-3.jpg', 'Bên trong quán', 3, FALSE);

-- Cổng Trước SGU
INSERT INTO restaurant_image (restaurant_id, image_url, caption, display_order, is_primary) VALUES 
(7, 'https://placeholder-image-url.com/sgu-truoc-1.jpg', 'Các món ăn', 1, TRUE),
(7, 'https://placeholder-image-url.com/sgu-truoc-2.jpg', 'Khu vực ăn uống', 2, FALSE);

-- Cổng Sau SGU
INSERT INTO restaurant_image (restaurant_id, image_url, caption, display_order, is_primary) VALUES 
(8, 'https://placeholder-image-url.com/sgu-sau-1.jpg', 'Phở và bánh mì', 1, TRUE),
(8, 'https://placeholder-image-url.com/sgu-sau-2.jpg', 'Quầy đồ uống', 2, FALSE);

-- =====================================================
-- 6. Reset Sequences
-- =====================================================

SELECT setval('restaurant_id_seq', (SELECT MAX(id) FROM restaurant), true);
SELECT setval('menu_item_id_seq', (SELECT MAX(id) FROM menu_item), true);
SELECT setval('tag_id_seq', (SELECT MAX(id) FROM tag), true);
SELECT setval('restaurant_tag_id_seq', (SELECT MAX(id) FROM restaurant_tag), true);
SELECT setval('restaurant_image_id_seq', (SELECT MAX(id) FROM restaurant_image), true);

-- =====================================================
-- Notes:
-- =====================================================
-- 1. All image URLs are placeholders - replace with actual URLs after upload
-- 2. To upload images to Supabase Storage:
--    a. Create a storage bucket called 'restaurant-images'
--    b. Enable public access for the bucket
--    c. Upload images via Supabase Dashboard or API
--    d. Update image_url values with actual Supabase Storage URLs
-- 3. Image URL format: https://[project-ref].supabase.co/storage/v1/object/public/restaurant-images/[filename]
