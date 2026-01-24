-- Supabase Migration SQL
-- Generated from SQLite database
-- Date: 2026-01-24

-- =====================================================
-- 1. Create Tables
-- =====================================================

-- Create restaurant table
CREATE TABLE IF NOT EXISTS restaurant (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    description TEXT,
    avg_eat_time INTEGER,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create menu_item table
CREATE TABLE IF NOT EXISTS menu_item (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price INTEGER NOT NULL,
    restaurant_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_restaurant
        FOREIGN KEY(restaurant_id) 
        REFERENCES restaurant(id)
        ON DELETE CASCADE
);

-- =====================================================
-- 2. Create Indexes for Performance
-- =====================================================

-- Index for restaurant location queries
CREATE INDEX IF NOT EXISTS idx_restaurant_location ON restaurant(lat, lng);

-- Index for active restaurants
CREATE INDEX IF NOT EXISTS idx_restaurant_active ON restaurant(is_active);

-- Index for menu items by restaurant
CREATE INDEX IF NOT EXISTS idx_menu_item_restaurant ON menu_item(restaurant_id);

-- =====================================================
-- 3. Create Updated_at Trigger Function
-- =====================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for restaurant table
CREATE TRIGGER update_restaurant_updated_at 
    BEFORE UPDATE ON restaurant 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for menu_item table
CREATE TRIGGER update_menu_item_updated_at 
    BEFORE UPDATE ON menu_item 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. Enable Row Level Security (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE restaurant ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item ENABLE ROW LEVEL SECURITY;

-- Policy: Allow public read access to active restaurants
CREATE POLICY "Allow public read active restaurants"
    ON restaurant
    FOR SELECT
    USING (is_active = TRUE);

-- Policy: Allow public read access to menu items
CREATE POLICY "Allow public read menu items"
    ON menu_item
    FOR SELECT
    USING (TRUE);

-- Policy: Allow authenticated users full access (for admin)
-- Note: You'll need to adjust this based on your auth setup
CREATE POLICY "Allow authenticated full access restaurants"
    ON restaurant
    FOR ALL
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated full access menu items"
    ON menu_item
    FOR ALL
    USING (auth.role() = 'authenticated');

-- =====================================================
-- 5. Comments for Documentation
-- =====================================================

COMMENT ON TABLE restaurant IS 'Stores restaurant information including location and metadata';
COMMENT ON TABLE menu_item IS 'Stores menu items for each restaurant';

COMMENT ON COLUMN restaurant.lat IS 'Latitude coordinate for restaurant location';
COMMENT ON COLUMN restaurant.lng IS 'Longitude coordinate for restaurant location';
COMMENT ON COLUMN restaurant.avg_eat_time IS 'Average eating time in minutes';
COMMENT ON COLUMN restaurant.is_active IS 'Soft delete flag - false means restaurant is hidden';

-- =====================================================
-- 6. Grant Permissions
-- =====================================================

-- Grant usage on sequences
GRANT USAGE ON SEQUENCE restaurant_id_seq TO anon, authenticated;
GRANT USAGE ON SEQUENCE menu_item_id_seq TO anon, authenticated;

-- Grant select to anonymous users (public API)
GRANT SELECT ON restaurant TO anon;
GRANT SELECT ON menu_item TO anon;

-- Grant all to authenticated users (admin)
GRANT ALL ON restaurant TO authenticated;
GRANT ALL ON menu_item TO authenticated;

-- =====================================================
-- Notes:
-- =====================================================
-- 1. Run this script in Supabase SQL Editor
-- 2. Adjust RLS policies based on your authentication setup
-- 3. If you need to import existing data, use the data migration script
-- 4. Make sure to update your Flask app to use PostgreSQL instead of SQLite
-- 5. Update connection string in app.py to use Supabase PostgreSQL URL
