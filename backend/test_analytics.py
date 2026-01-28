"""
Test script to verify analytics tracking is working
"""

from app import app
from db import db
from models import Restaurant, LocationVisit

def test_analytics():
    with app.app_context():
        print("=" * 70)
        print("RESTAURANT ANALYTICS STATUS")
        print("=" * 70)
        
        restaurants = Restaurant.query.filter_by(is_active=True).all()
        
        if not restaurants:
            print("❌ No active restaurants found!")
            return
        
        total_visits = 0
        total_audio_plays = 0
        
        for r in restaurants:
            print(f"\n📍 {r.name} (ID: {r.id})")
            print(f"   POI Radius: {r.poi_radius_km} km ({r.poi_radius_km * 1000}m)")
            print(f"   Visit Count: {r.visit_count}")
            print(f"   Avg Visit Duration: {r.avg_visit_duration}s ({r.avg_visit_duration / 60:.1f} minutes)")
            print(f"   Audio Play Count: {r.audio_play_count}")
            print(f"   Avg Audio Duration: {r.avg_audio_duration}s")
            
            total_visits += r.visit_count
            total_audio_plays += r.audio_play_count
        
        print("\n" + "=" * 70)
        print(f"📊 TOTALS:")
        print(f"   Total Visits: {total_visits}")
        print(f"   Total Audio Plays: {total_audio_plays}")
        print("=" * 70)
        
        # Check LocationVisit table
        print(f"\n📍 LocationVisit Records:")
        visits = LocationVisit.query.limit(5).all()
        if visits:
            for v in visits:
                print(f"   - ID: {v.id}, Restaurant: {v.restaurant_id}, Duration: {v.duration_seconds}s")
            total_records = LocationVisit.query.count()
            print(f"   Total records: {total_records}")
        else:
            print("   ❌ No LocationVisit records found")
        
        print("\n" + "=" * 70)
        print("✅ Analytics query completed")
        print("=" * 70)

if __name__ == '__main__':
    test_analytics()
