"""
Script to add sample location visit data for testing heatmap
"""

from app import app
from db import db
from models import LocationVisit, Restaurant
from datetime import datetime, timedelta
import random

def add_sample_visits():
    with app.app_context():
        # Get some restaurants
        restaurants = Restaurant.query.filter_by(is_active=True).limit(5).all()
        
        if not restaurants:
            print('⚠️  No active restaurants found. Please add restaurants first.')
            return
        
        print(f'🍽️  Found {len(restaurants)} restaurants')
        
        # Generate random visits around each restaurant
        for restaurant in restaurants:
            base_lat = restaurant.lat
            base_lng = restaurant.lng
            
            # Create 10-30 visits around each restaurant
            num_visits = random.randint(10, 30)
            
            for _ in range(num_visits):
                # Random offset within ~100m
                lat_offset = random.uniform(-0.001, 0.001)
                lng_offset = random.uniform(-0.001, 0.001)
                
                # Random duration between 60-300 seconds
                duration = random.randint(60, 300)
                
                # Random time in the past week
                days_ago = random.randint(0, 7)
                hours_ago = random.randint(0, 23)
                timestamp = datetime.utcnow() - timedelta(days=days_ago, hours=hours_ago)
                
                visit = LocationVisit(
                    lat=base_lat + lat_offset,
                    lng=base_lng + lng_offset,
                    duration_seconds=duration,
                    restaurant_id=restaurant.id,
                    timestamp=timestamp
                )
                
                db.session.add(visit)
                
                # Update restaurant analytics
                restaurant.visit_count += 1
                if restaurant.avg_visit_duration == 0:
                    restaurant.avg_visit_duration = duration // 60
                else:
                    restaurant.avg_visit_duration = (restaurant.avg_visit_duration + duration // 60) // 2
            
            print(f'✅ Added {num_visits} visits for {restaurant.name}')
        
        db.session.commit()
        print('\n🎉 Sample data added successfully!')
        print(f'📊 Total visits: {LocationVisit.query.count()}')

if __name__ == '__main__':
    add_sample_visits()
