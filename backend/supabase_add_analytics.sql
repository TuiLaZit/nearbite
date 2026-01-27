-- =====================================================
-- Migration: Add Analytics Features
-- Description: Adds analytics columns to restaurant and creates location_visit table
-- Date: 2026-01-27
-- =====================================================

-- =====================================================
-- 1. Add Analytics Columns to Restaurant Table
-- =====================================================

-- Add visit_count column (số lần ghé)
ALTER TABLE restaurant 
ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 0 NOT NULL;

-- Add avg_visit_duration column (thời gian ghé trung bình - phút)
ALTER TABLE restaurant 
ADD COLUMN IF NOT EXISTS avg_visit_duration INTEGER DEFAULT 0 NOT NULL;

-- Add avg_audio_duration column (thời gian nghe audio trung bình - giây)
ALTER TABLE restaurant 
ADD COLUMN IF NOT EXISTS avg_audio_duration INTEGER DEFAULT 0 NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN restaurant.visit_count IS 'Số lần user ghé thăm quán (tăng khi dừng >= 60 giây)';
COMMENT ON COLUMN restaurant.avg_visit_duration IS 'Thời gian ghé trung bình tính bằng phút';
COMMENT ON COLUMN restaurant.avg_audio_duration IS 'Thời gian nghe thuyết minh trung bình tính bằng giây';

-- =====================================================
-- 2. Create Location Visit Table (for Heatmap)
-- =====================================================

CREATE TABLE IF NOT EXISTS location_visit (
    id SERIAL PRIMARY KEY,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    duration_seconds INTEGER NOT NULL,
    restaurant_id INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_location_visit_restaurant
        FOREIGN KEY(restaurant_id) 
        REFERENCES restaurant(id)
        ON DELETE SET NULL
);

-- Add comments
COMMENT ON TABLE location_visit IS 'Lưu lịch sử vị trí user để tạo heatmap và analytics';
COMMENT ON COLUMN location_visit.duration_seconds IS 'Thời gian user ở vị trí này (giây) - >= 60s mới tính là visit';
COMMENT ON COLUMN location_visit.restaurant_id IS 'ID quán ăn nếu vị trí này thuộc POI radius của quán';

-- =====================================================
-- 3. Create Indexes for Performance
-- =====================================================

-- Index for location queries (heatmap)
CREATE INDEX IF NOT EXISTS idx_location_visit_coords ON location_visit(lat, lng);

-- Index for restaurant analytics queries
CREATE INDEX IF NOT EXISTS idx_location_visit_restaurant ON location_visit(restaurant_id);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_location_visit_timestamp ON location_visit(timestamp);

-- Index for visit count queries
CREATE INDEX IF NOT EXISTS idx_location_visit_duration ON location_visit(duration_seconds);

-- Composite index for heatmap queries (visits >= 60s)
CREATE INDEX IF NOT EXISTS idx_location_visit_heatmap 
ON location_visit(duration_seconds, lat, lng) 
WHERE duration_seconds >= 60;

-- =====================================================
-- 4. Enable Row Level Security (RLS) for Location Visit
-- =====================================================

ALTER TABLE location_visit ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert location data (user tracking)
CREATE POLICY "Allow public insert location visits"
    ON location_visit
    FOR INSERT
    WITH CHECK (TRUE);

-- Policy: Allow authenticated users (admin) to read all data
CREATE POLICY "Allow authenticated read location visits"
    ON location_visit
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- Policy: Allow authenticated users (admin) to delete old data
CREATE POLICY "Allow authenticated delete location visits"
    ON location_visit
    FOR DELETE
    USING (auth.role() = 'authenticated');

-- =====================================================
-- 5. Grant Permissions
-- =====================================================

-- Grant usage on sequence
GRANT USAGE ON SEQUENCE location_visit_id_seq TO anon, authenticated;

-- Grant insert to anonymous users (for tracking)
GRANT INSERT ON location_visit TO anon;

-- Grant select to authenticated users (admin)
GRANT SELECT, DELETE ON location_visit TO authenticated;

-- =====================================================
-- 6. Update Existing Restaurant Data
-- =====================================================

-- Set all existing restaurants to have default analytics values
UPDATE restaurant 
SET 
    visit_count = 0,
    avg_visit_duration = 0,
    avg_audio_duration = 0
WHERE visit_count IS NULL 
   OR avg_visit_duration IS NULL 
   OR avg_audio_duration IS NULL;

-- =====================================================
-- 7. Create Helper Function to Update Restaurant Analytics
-- =====================================================

-- Function to recalculate restaurant analytics from location_visit data
CREATE OR REPLACE FUNCTION recalculate_restaurant_analytics(p_restaurant_id INTEGER)
RETURNS VOID AS $$
BEGIN
    -- Update visit count and average duration
    UPDATE restaurant r
    SET 
        visit_count = (
            SELECT COUNT(*) 
            FROM location_visit 
            WHERE restaurant_id = p_restaurant_id 
            AND duration_seconds >= 60
        ),
        avg_visit_duration = (
            SELECT COALESCE(AVG(duration_seconds / 60), 0)::INTEGER
            FROM location_visit 
            WHERE restaurant_id = p_restaurant_id 
            AND duration_seconds >= 60
        )
    WHERE r.id = p_restaurant_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_restaurant_analytics(INTEGER) IS 
'Recalculate visit_count and avg_visit_duration for a restaurant based on location_visit data';

-- =====================================================
-- 8. Verification Queries (Uncomment to run)
-- =====================================================

-- Check if columns were added successfully
-- SELECT column_name, data_type, column_default 
-- FROM information_schema.columns 
-- WHERE table_name = 'restaurant' 
-- AND column_name IN ('visit_count', 'avg_visit_duration', 'avg_audio_duration');

-- Check if location_visit table was created
-- SELECT table_name, table_type 
-- FROM information_schema.tables 
-- WHERE table_name = 'location_visit';

-- View all restaurants with analytics
-- SELECT id, name, visit_count, avg_visit_duration, avg_audio_duration 
-- FROM restaurant 
-- ORDER BY id;

-- =====================================================
-- Notes:
-- =====================================================
-- 1. Các cột analytics tự động có giá trị mặc định là 0
-- 2. Backend sẽ tự động cập nhật các giá trị này khi user:
--    - Dừng lại >= 60 giây: tăng visit_count, cập nhật avg_visit_duration
--    - Nghe audio: cập nhật avg_audio_duration
-- 3. Table location_visit lưu tất cả vị trí user đã ghé
-- 4. Heatmap được tạo từ location_visit với duration_seconds >= 60
-- 5. RLS policies cho phép:
--    - Anonymous users: INSERT location visits (tracking)
--    - Authenticated users (admin): SELECT, DELETE (xem và quản lý)
-- 6. Function recalculate_restaurant_analytics() có thể dùng để sync lại data nếu cần
--
-- Để test:
-- 1. Chạy toàn bộ script này trong Supabase SQL Editor
-- 2. Backend sẽ tự động sử dụng các column mới
-- 3. Heatmap sẽ hiển thị data từ location_visit table
--
-- Để thêm test data:
-- INSERT INTO location_visit (lat, lng, duration_seconds, restaurant_id) 
-- VALUES (10.7765, 106.7009, 120, 1);
