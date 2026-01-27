-- Initial Database Schema Migration
-- Created: 2025-01-28
-- Description: Complete database schema for restaurant location tracking and management system

-- Create sequences for auto-incrementing IDs
CREATE SEQUENCE IF NOT EXISTS restaurant_id_seq;
CREATE SEQUENCE IF NOT EXISTS menu_item_id_seq;
CREATE SEQUENCE IF NOT EXISTS tag_id_seq;
CREATE SEQUENCE IF NOT EXISTS restaurant_tag_id_seq;
CREATE SEQUENCE IF NOT EXISTS restaurant_image_id_seq;
CREATE SEQUENCE IF NOT EXISTS location_visit_id_seq;

-- ============================================================================
-- Table: restaurant
-- Description: Stores restaurant/POI information with location and analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.restaurant (
  id integer NOT NULL DEFAULT nextval('restaurant_id_seq'::regclass),
  name character varying NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  description text,
  avg_eat_time integer,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  poi_radius_km double precision NOT NULL DEFAULT 0.015,
  visit_count integer NOT NULL DEFAULT 0,
  avg_visit_duration integer NOT NULL DEFAULT 0,
  avg_audio_duration integer NOT NULL DEFAULT 0,
  CONSTRAINT restaurant_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- Table: menu_item
-- Description: Menu items for each restaurant with pricing
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.menu_item (
  id integer NOT NULL DEFAULT nextval('menu_item_id_seq'::regclass),
  name character varying NOT NULL,
  price integer NOT NULL,
  restaurant_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT menu_item_pkey PRIMARY KEY (id),
  CONSTRAINT fk_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id) ON DELETE CASCADE
);

-- ============================================================================
-- Table: tag
-- Description: Tags for categorizing restaurants (e.g., cuisine type, features)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tag (
  id integer NOT NULL DEFAULT nextval('tag_id_seq'::regclass),
  name character varying NOT NULL UNIQUE,
  icon character varying,
  color character varying,
  description text,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tag_pkey PRIMARY KEY (id)
);

-- ============================================================================
-- Table: restaurant_tag
-- Description: Many-to-many relationship between restaurants and tags
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_tag (
  id integer NOT NULL DEFAULT nextval('restaurant_tag_id_seq'::regclass),
  restaurant_id integer NOT NULL,
  tag_id integer NOT NULL,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT restaurant_tag_pkey PRIMARY KEY (id),
  CONSTRAINT fk_restaurant_tag_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id) ON DELETE CASCADE,
  CONSTRAINT fk_restaurant_tag_tag FOREIGN KEY (tag_id) REFERENCES public.tag(id) ON DELETE CASCADE
);

-- ============================================================================
-- Table: restaurant_image
-- Description: Images for restaurants with ordering and primary designation
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.restaurant_image (
  id integer NOT NULL DEFAULT nextval('restaurant_image_id_seq'::regclass),
  restaurant_id integer NOT NULL,
  image_url text NOT NULL,
  caption text,
  display_order integer DEFAULT 0,
  is_primary boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT restaurant_image_pkey PRIMARY KEY (id),
  CONSTRAINT fk_restaurant_image_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id) ON DELETE CASCADE
);

-- ============================================================================
-- Table: location_visit
-- Description: Tracks user visits to restaurant locations with duration analytics
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.location_visit (
  id integer NOT NULL DEFAULT nextval('location_visit_id_seq'::regclass),
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  duration_seconds integer NOT NULL,
  restaurant_id integer,
  timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT location_visit_pkey PRIMARY KEY (id),
  CONSTRAINT fk_location_visit_restaurant FOREIGN KEY (restaurant_id) REFERENCES public.restaurant(id) ON DELETE SET NULL
);

-- ============================================================================
-- Indexes for performance optimization
-- ============================================================================

-- Index for restaurant location queries
CREATE INDEX IF NOT EXISTS idx_restaurant_location ON public.restaurant(lat, lng);

-- Index for active restaurants
CREATE INDEX IF NOT EXISTS idx_restaurant_active ON public.restaurant(is_active) WHERE is_active = true;

-- Index for menu items by restaurant
CREATE INDEX IF NOT EXISTS idx_menu_item_restaurant ON public.menu_item(restaurant_id);

-- Index for restaurant tags lookup
CREATE INDEX IF NOT EXISTS idx_restaurant_tag_restaurant ON public.restaurant_tag(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_tag_tag ON public.restaurant_tag(tag_id);

-- Index for restaurant images
CREATE INDEX IF NOT EXISTS idx_restaurant_image_restaurant ON public.restaurant_image(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_image_primary ON public.restaurant_image(restaurant_id, is_primary) WHERE is_primary = true;

-- Index for location visits by restaurant
CREATE INDEX IF NOT EXISTS idx_location_visit_restaurant ON public.location_visit(restaurant_id);

-- Index for location visits by timestamp
CREATE INDEX IF NOT EXISTS idx_location_visit_timestamp ON public.location_visit(timestamp);

-- ============================================================================
-- Comments for documentation
-- ============================================================================

COMMENT ON TABLE public.restaurant IS 'Restaurants and points of interest with location and analytics data';
COMMENT ON COLUMN public.restaurant.poi_radius_km IS 'Radius in kilometers for detecting when user is near this location';
COMMENT ON COLUMN public.restaurant.visit_count IS 'Total number of visits to this restaurant';
COMMENT ON COLUMN public.restaurant.avg_visit_duration IS 'Average duration of visits in seconds';
COMMENT ON COLUMN public.restaurant.avg_audio_duration IS 'Average audio playback duration in seconds';

COMMENT ON TABLE public.menu_item IS 'Menu items available at each restaurant';
COMMENT ON TABLE public.tag IS 'Tags for categorizing restaurants (cuisine, features, etc.)';
COMMENT ON TABLE public.restaurant_tag IS 'Many-to-many junction table linking restaurants to tags';
COMMENT ON TABLE public.restaurant_image IS 'Images associated with restaurants';
COMMENT ON TABLE public.location_visit IS 'User location visit tracking with duration analytics';
