-- Add audio_play_count column to restaurant table
-- Migration: 20250128_add_audio_play_count.sql

ALTER TABLE restaurant ADD COLUMN IF NOT EXISTS audio_play_count INTEGER DEFAULT 0;

-- Update existing rows to have default value
UPDATE restaurant SET audio_play_count = 0 WHERE audio_play_count IS NULL;
