"""
Manual test script to simulate tracking calls
"""

import requests
import json

BASE_URL = "http://localhost:5000"

def test_track_location():
    """Test location tracking endpoint"""
    print("🧪 Testing /track-location endpoint...")
    
    data = {
        "lat": 10.760426862777551,  # Near SGU
        "lng": 106.68198430250096,
        "duration_seconds": 15,  # 15 seconds
        "restaurant_id": 1  # Optional, will be detected automatically
    }
    
    response = requests.post(f"{BASE_URL}/track-location", json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    print()

def test_track_audio():
    """Test audio tracking endpoint"""
    print("🧪 Testing /track-audio endpoint...")
    
    data = {
        "restaurant_id": 1,
        "duration_seconds": 45  # 45 seconds
    }
    
    response = requests.post(f"{BASE_URL}/track-audio", json=data)
    print(f"Status: {response.status_code}")
    print(f"Response: {response.json()}")
    print()

if __name__ == '__main__':
    print("=" * 50)
    print("TESTING ANALYTICS ENDPOINTS")
    print("=" * 50)
    print()
    
    try:
        test_track_location()
        test_track_audio()
        
        print("=" * 50)
        print("✅ All tests completed!")
        print("Run 'python test_analytics.py' to check database values")
        print("=" * 50)
    except Exception as e:
        print(f"❌ Error: {e}")
