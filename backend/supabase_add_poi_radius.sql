-- =====================================================
-- Migration: Add POI Activation Radius to Restaurant
-- Description: Adds poi_radius_km column to restaurant table
-- Default value: 0.015 km (15 meters)
-- Date: 2026-01-26
-- =====================================================

-- =====================================================
-- 1. Add poi_radius_km column to restaurant table
-- =====================================================

-- Add the column with default value of 0.015 (15m in kilometers)
ALTER TABLE restaurant 
ADD COLUMN IF NOT EXISTS poi_radius_km DOUBLE PRECISION DEFAULT 0.015 NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN restaurant.poi_radius_km IS 'POI activation radius in kilometers (e.g., 0.015 = 15 meters)';

-- =====================================================
-- 2. Update existing restaurants to have 15m radius
-- =====================================================

-- Set all existing restaurants to have 15m (0.015 km) radius
UPDATE restaurant 
SET poi_radius_km = 0.015 
WHERE poi_radius_km IS NULL OR poi_radius_km = 0;

-- =====================================================
-- 3. Create index for performance (optional)
-- =====================================================

-- Create index if you plan to query by radius
CREATE INDEX IF NOT EXISTS idx_restaurant_poi_radius ON restaurant(poi_radius_km);

-- =====================================================
-- 4. Verify the changes
-- =====================================================

-- View all restaurants with their POI radius
-- Uncomment to run verification query:
-- SELECT id, name, poi_radius_km, (poi_radius_km * 1000) as poi_radius_meters 
-- FROM restaurant 
-- ORDER BY id;

-- =====================================================
-- Notes:
-- =====================================================
-- 1. poi_radius_km is stored in kilometers for consistency with distance calculations
-- 2. All existing restaurants are set to 15m (0.015 km) by default
-- 3. Admin interface needs to be updated to allow editing this value
-- 4. Frontend needs to use this value instead of hardcoded POI_THRESHOLD
-- 5. To convert meters to kilometers: meters / 1000
-- 6. To convert kilometers to meters: km * 1000
-- 
-- Example values:
-- - 10m = 0.010 km
-- - 15m = 0.015 km (default)
-- - 20m = 0.020 km
-- - 30m = 0.030 km
-- - 50m = 0.050 km
