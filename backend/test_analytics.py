"""
Test script to verify analytics tracking is working
"""

from app import app
from db import db
from models import Restaurant

def test_analytics():
    with app.app_context():
        print("=" * 50)
        print("RESTAURANT ANALYTICS STATUS")
        print("=" * 50)
        
        restaurants = Restaurant.query.filter_by(is_active=True).all()
        
        if not restaurants:
            print("❌ No active restaurants found!")
            return
        
        for r in restaurants:
            print(f"\n📍 {r.name} (ID: {r.id})")
            print(f"   POI Radius: {r.poi_radius_km} km ({r.poi_radius_km * 1000}m)")
            print(f"   Visit Count: {r.visit_count}")
            print(f"   Avg Visit Duration: {r.avg_visit_duration}s")
            print(f"   Audio Play Count: {r.audio_play_count}")
            print(f"   Avg Audio Duration: {r.avg_audio_duration}s")
        
        print("\n" + "=" * 50)
        print("✅ Analytics query completed")
        print("=" * 50)

if __name__ == '__main__':
    test_analytics()
