"""
Local development test - Start backend and check if tracking works
Run this AFTER starting app.py
"""

from app import app
from db import db
from models import Restaurant, LocationVisit
import time

def reset_analytics():
    """Reset all analytics to 0 for testing"""
    with app.app_context():
        restaurants = Restaurant.query.filter_by(is_active=True).all()
        for r in restaurants:
            r.visit_count = 0
            r.avg_visit_duration = 0
            r.audio_play_count = 0
            r.avg_audio_duration = 0
        db.session.commit()
        print("✅ Reset all analytics to 0")

def show_before():
    """Show analytics before test"""
    with app.app_context():
        print("\n" + "=" * 70)
        print("📊 BEFORE TEST")
        print("=" * 70)
        restaurants = Restaurant.query.filter_by(is_active=True).all()
        for r in restaurants:
            print(f"📍 {r.name}:")
            print(f"   visit_count={r.visit_count}, avg_visit_duration={r.avg_visit_duration}s")
            print(f"   audio_play_count={r.audio_play_count}, avg_audio_duration={r.avg_audio_duration}s")

def simulate_tracking():
    """Simulate tracking calls"""
    import requests
    
    BASE_URL = "http://localhost:5000"
    
    print("\n" + "=" * 70)
    print("🧪 RUNNING TESTS")
    print("=" * 70)
    
    # Test 1: Track location visit
    print("\n1️⃣ Simulating location visit (15 seconds)...")
    response = requests.post(
        f"{BASE_URL}/track-location",
        json={
            "lat": 10.760426862777551,
            "lng": 106.68198430250096,
            "duration_seconds": 15
        }
    )
    print(f"   Response: {response.status_code} - {response.json()}")
    
    time.sleep(1)
    
    # Test 2: Track audio
    print("\n2️⃣ Simulating audio playback (30 seconds)...")
    response = requests.post(
        f"{BASE_URL}/track-audio",
        json={
            "restaurant_id": 1,
            "duration_seconds": 30
        }
    )
    print(f"   Response: {response.status_code} - {response.json()}")

def show_after():
    """Show analytics after test"""
    with app.app_context():
        print("\n" + "=" * 70)
        print("📊 AFTER TEST")
        print("=" * 70)
        restaurants = Restaurant.query.filter_by(is_active=True).all()
        for r in restaurants:
            print(f"📍 {r.name}:")
            print(f"   visit_count={r.visit_count} (expected: 1)")
            print(f"   avg_visit_duration={r.avg_visit_duration}s (expected: 15s)")
            print(f"   audio_play_count={r.audio_play_count} (expected: 1)")
            print(f"   avg_audio_duration={r.avg_audio_duration}s (expected: 30s)")
        
        # Check LocationVisit
        visit_count = LocationVisit.query.count()
        print(f"\n📍 LocationVisit records: {visit_count} (expected: 1)")

if __name__ == "__main__":
    print("🚀 LOCAL TRACKING TEST")
    print("=" * 70)
    print("⚠️  Make sure backend is running: python app.py")
    print("=" * 70)
    
    input("\nPress Enter to start test...")
    
    reset_analytics()
    show_before()
    
    try:
        simulate_tracking()
    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("Make sure backend is running!")
    
    time.sleep(2)
    show_after()
    
    print("\n" + "=" * 70)
    print("✅ TEST COMPLETED")
    print("=" * 70)
