-- Data Migration SQL
-- Generated from SQLite database
-- Run this AFTER running supabase_migration.sql

-- =====================================================
-- Insert Restaurant Data
-- =====================================================

INSERT INTO restaurant (id, name, lat, lng, description, avg_eat_time, is_active) VALUES (1, 'Bún bò Huế cô Ba', 10.7765, 106.7009, 'Quán bún bò truyền thống hơn 20 năm', 25, TRUE);
INSERT INTO restaurant (id, name, lat, lng, description, avg_eat_time, is_active) VALUES (2, 'Bánh mì cô Hoa', 10.7752, 106.7021, 'Bánh mì nóng giòn, nhân đầy đặn', 10, TRUE);
INSERT INTO restaurant (id, name, lat, lng, description, avg_eat_time, is_active) VALUES (3, 'Phở Minh', 10.774, 106.6995, 'Phở bò gia truyền, nước dùng đậm đà', 30, TRUE);
INSERT INTO restaurant (id, name, lat, lng, description, avg_eat_time, is_active) VALUES (4, 'Cơm Tấm Tuấn Ngọc', 10.7736, 106.6966, 'Cơm tấm sườn nướng đậm vị, ăn cùng chả, bì, nước mắm', 25, TRUE);
INSERT INTO restaurant (id, name, lat, lng, description, avg_eat_time, is_active) VALUES (5, 'Quán Lươn Thanh Tuấn', 10.7725, 106.6951, 'Chuyên các món về lươn', 50, TRUE);
INSERT INTO restaurant (id, name, lat, lng, description, avg_eat_time, is_active) VALUES (7, 'Cổng Trước SGU', 10.760516973033758, 106.68174588750001, 'Các món ăn vỉa hè cổng trước SGU', 25, TRUE);
INSERT INTO restaurant (id, name, lat, lng, description, avg_eat_time, is_active) VALUES (8, 'Cổng Sau SGU', 10.759128923228175, 106.68277047686901, 'Các món ăn vỉa hè cổng sau SGU', 25, TRUE);

-- =====================================================
-- Insert Menu Item Data
-- =====================================================

INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (1, 'Bún bò đặc biệt', 46000, 1);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (2, 'Bún bò giò', 40000, 1);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (4, 'Bánh mì thịt', 20000, 2);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (5, 'Bánh mì trứng', 18000, 2);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (6, 'Bánh mì xíu mại', 25000, 2);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (7, 'Phở bò tái', 50000, 3);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (8, 'Phở bò viên', 48000, 3);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (9, 'Phở gà', 45000, 3);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (10, 'Cơm Sườn', 35000, 4);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (11, 'Cơm Sườn Chả', 45000, 4);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (12, 'Cơm Sườn Bì Chả', 55000, 4);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (13, 'Lươn Nướng', 120000, 5);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (14, 'Cháo Lươn', 50000, 5);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (15, 'Miến Lươn', 45000, 5);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (16, 'Bún Bò Tái', 36000, 1);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (17, 'Cơm trộn thập cẩm ', 25000, 7);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (18, 'Bánh Cuốn ', 25000, 7);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (19, 'Bánh Mì', 15000, 7);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (20, 'Bánh mì thịt nướng', 15000, 8);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (21, 'Phở Tái', 30000, 8);
INSERT INTO menu_item (id, name, price, restaurant_id) VALUES (22, 'Matcha Latte', 25000, 8);

-- =====================================================
-- Reset Sequences
-- =====================================================

SELECT setval('restaurant_id_seq', 8, true);
SELECT setval('menu_item_id_seq', 22, true);