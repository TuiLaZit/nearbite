"""
Migration script to add analytics fields to Restaurant model and create LocationVisit table
Run this to update your database schema
"""

from app import app
from db import db
from models import Restaurant, LocationVisit

def run_migration():
    with app.app_context():
        # Check if columns exist before adding
        inspector = db.inspect(db.engine)
        
        # Get existing columns for restaurant table
        restaurant_columns = [col['name'] for col in inspector.get_columns('restaurant')]
        
        # Add new columns to Restaurant if they don't exist
        if 'visit_count' not in restaurant_columns:
            with db.engine.connect() as conn:
                conn.execute(db.text('ALTER TABLE restaurant ADD COLUMN visit_count INTEGER DEFAULT 0'))
                conn.commit()
                print('✅ Added visit_count column')
        
        if 'avg_visit_duration' not in restaurant_columns:
            with db.engine.connect() as conn:
                conn.execute(db.text('ALTER TABLE restaurant ADD COLUMN avg_visit_duration INTEGER DEFAULT 0'))
                conn.commit()
                print('✅ Added avg_visit_duration column')
        
        if 'avg_audio_duration' not in restaurant_columns:
            with db.engine.connect() as conn:
                conn.execute(db.text('ALTER TABLE restaurant ADD COLUMN avg_audio_duration INTEGER DEFAULT 0'))
                conn.commit()
                print('✅ Added avg_audio_duration column')
        
        # Create LocationVisit table if it doesn't exist
        db.create_all()
        print('✅ Created LocationVisit table (if not exists)')
        
        print('\n🎉 Migration completed successfully!')

if __name__ == '__main__':
    run_migration()
