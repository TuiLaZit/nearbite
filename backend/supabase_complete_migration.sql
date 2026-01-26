-- =====================================================
-- Complete Supabase Migration SQL
-- Includes: Restaurant, Menu, Tags, and Images
-- Date: 2026-01-26
-- =====================================================

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

-- Create tag table
CREATE TABLE IF NOT EXISTS tag (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    icon VARCHAR(20),
    color VARCHAR(20),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create restaurant_tag junction table (many-to-many)
CREATE TABLE IF NOT EXISTS restaurant_tag (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL,
    tag_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_restaurant_tag_restaurant
        FOREIGN KEY(restaurant_id) 
        REFERENCES restaurant(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_restaurant_tag_tag
        FOREIGN KEY(tag_id) 
        REFERENCES tag(id)
        ON DELETE CASCADE,
    CONSTRAINT unique_restaurant_tag UNIQUE(restaurant_id, tag_id)
);

-- Create restaurant_image table
CREATE TABLE IF NOT EXISTS restaurant_image (
    id SERIAL PRIMARY KEY,
    restaurant_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    caption TEXT,
    display_order INTEGER DEFAULT 0,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_restaurant_image_restaurant
        FOREIGN KEY(restaurant_id) 
        REFERENCES restaurant(id)
        ON DELETE CASCADE
);

-- =====================================================
-- 2. Create Indexes for Performance
-- =====================================================

-- Indexes for restaurant
CREATE INDEX IF NOT EXISTS idx_restaurant_location ON restaurant(lat, lng);
CREATE INDEX IF NOT EXISTS idx_restaurant_active ON restaurant(is_active);

-- Indexes for menu_item
CREATE INDEX IF NOT EXISTS idx_menu_item_restaurant ON menu_item(restaurant_id);

-- Indexes for tag
CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(name);

-- Indexes for restaurant_tag
CREATE INDEX IF NOT EXISTS idx_restaurant_tag_restaurant ON restaurant_tag(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tag_tag ON restaurant_tag(tag_id);

-- Indexes for restaurant_image
CREATE INDEX IF NOT EXISTS idx_restaurant_image_restaurant ON restaurant_image(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_image_order ON restaurant_image(restaurant_id, display_order);
CREATE INDEX IF NOT EXISTS idx_restaurant_image_primary ON restaurant_image(restaurant_id, is_primary);

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

-- Triggers for restaurant table
CREATE TRIGGER update_restaurant_updated_at 
    BEFORE UPDATE ON restaurant 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for menu_item table
CREATE TRIGGER update_menu_item_updated_at 
    BEFORE UPDATE ON menu_item 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for tag table
CREATE TRIGGER update_tag_updated_at 
    BEFORE UPDATE ON tag 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Triggers for restaurant_image table
CREATE TRIGGER update_restaurant_image_updated_at 
    BEFORE UPDATE ON restaurant_image 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 4. Enable Row Level Security (RLS)
-- =====================================================

-- Enable RLS
ALTER TABLE restaurant ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurant_image ENABLE ROW LEVEL SECURITY;

-- Policies for restaurant
CREATE POLICY "Allow public read active restaurants"
    ON restaurant
    FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "Allow authenticated full access restaurants"
    ON restaurant
    FOR ALL
    USING (auth.role() = 'authenticated');

-- Policies for menu_item
CREATE POLICY "Allow public read menu items"
    ON menu_item
    FOR SELECT
    USING (TRUE);

CREATE POLICY "Allow authenticated full access menu items"
    ON menu_item
    FOR ALL
    USING (auth.role() = 'authenticated');

-- Policies for tag
CREATE POLICY "Allow public read tags"
    ON tag
    FOR SELECT
    USING (TRUE);

CREATE POLICY "Allow authenticated full access tags"
    ON tag
    FOR ALL
    USING (auth.role() = 'authenticated');

-- Policies for restaurant_tag
CREATE POLICY "Allow public read restaurant_tag"
    ON restaurant_tag
    FOR SELECT
    USING (TRUE);

CREATE POLICY "Allow authenticated full access restaurant_tag"
    ON restaurant_tag
    FOR ALL
    USING (auth.role() = 'authenticated');

-- Policies for restaurant_image
CREATE POLICY "Allow public read restaurant_image"
    ON restaurant_image
    FOR SELECT
    USING (TRUE);

CREATE POLICY "Allow authenticated full access restaurant_image"
    ON restaurant_image
    FOR ALL
    USING (auth.role() = 'authenticated');

-- =====================================================
-- 5. Comments for Documentation
-- =====================================================

COMMENT ON TABLE restaurant IS 'Stores restaurant information including location and metadata';
COMMENT ON TABLE menu_item IS 'Stores menu items for each restaurant';
COMMENT ON TABLE tag IS 'Stores tags/categories for restaurants (e.g., món nước, món khô, ăn nhẹ)';
COMMENT ON TABLE restaurant_tag IS 'Junction table linking restaurants to tags (many-to-many)';
COMMENT ON TABLE restaurant_image IS 'Stores images for each restaurant';

COMMENT ON COLUMN restaurant.lat IS 'Latitude coordinate for restaurant location';
COMMENT ON COLUMN restaurant.lng IS 'Longitude coordinate for restaurant location';
COMMENT ON COLUMN restaurant.avg_eat_time IS 'Average eating time in minutes';
COMMENT ON COLUMN restaurant.is_active IS 'Soft delete flag - false means restaurant is hidden';

COMMENT ON COLUMN tag.icon IS 'Emoji or icon identifier for the tag';
COMMENT ON COLUMN tag.color IS 'Hex color code for tag display (e.g., #FF5733)';

COMMENT ON COLUMN restaurant_image.display_order IS 'Order in which images should be displayed (lower number = higher priority)';
COMMENT ON COLUMN restaurant_image.is_primary IS 'Indicates if this is the primary/featured image for the restaurant';

-- =====================================================
-- 6. Grant Permissions
-- =====================================================

-- Grant usage on sequences
GRANT USAGE ON SEQUENCE restaurant_id_seq TO anon, authenticated;
GRANT USAGE ON SEQUENCE menu_item_id_seq TO anon, authenticated;
GRANT USAGE ON SEQUENCE tag_id_seq TO anon, authenticated;
GRANT USAGE ON SEQUENCE restaurant_tag_id_seq TO anon, authenticated;
GRANT USAGE ON SEQUENCE restaurant_image_id_seq TO anon, authenticated;

-- Grant select to anonymous users (public API)
GRANT SELECT ON restaurant TO anon;
GRANT SELECT ON menu_item TO anon;
GRANT SELECT ON tag TO anon;
GRANT SELECT ON restaurant_tag TO anon;
GRANT SELECT ON restaurant_image TO anon;

-- Grant all to authenticated users (admin)
GRANT ALL ON restaurant TO authenticated;
GRANT ALL ON menu_item TO authenticated;
GRANT ALL ON tag TO authenticated;
GRANT ALL ON restaurant_tag TO authenticated;
GRANT ALL ON restaurant_image TO authenticated;

-- =====================================================
-- Notes:
-- =====================================================
-- 1. Run this script in Supabase SQL Editor
-- 2. After running this, run the data migration script
-- 3. Adjust RLS policies based on your authentication setup
-- 4. Update your Flask models.py to match these tables
-- 5. Consider setting up storage bucket for actual image uploads
