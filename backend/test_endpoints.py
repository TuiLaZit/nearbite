"""
Quick test to verify tracking endpoints work correctly
Run this after starting the backend
"""

import requests
import json

BASE_URL = "https://nearbite.up.railway.app"  # Change to your Railway URL
# BASE_URL = "http://localhost:5000"  # Uncomment for local testing

def test_endpoints():
    print("=" * 60)
    print("TESTING TRACKING ENDPOINTS")
    print("=" * 60)
    print(f"Base URL: {BASE_URL}\n")
    
    # Test 1: Track location visit
    print("1️⃣ Testing /track-location...")
    try:
        response = requests.post(
            f"{BASE_URL}/track-location",
            json={
                "lat": 10.760426862777551,
                "lng": 106.68198430250096,
                "duration_seconds": 15
            },
            headers={"Content-Type": "application/json"}
        )
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        if response.status_code == 200:
            print("   ✅ PASS")
        else:
            print("   ❌ FAIL")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    print()
    
    # Test 2: Track audio duration
    print("2️⃣ Testing /track-audio...")
    try:
        response = requests.post(
            f"{BASE_URL}/track-audio",
            json={
                "restaurant_id": 1,
                "duration_seconds": 30
            },
            headers={"Content-Type": "application/json"}
        )
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.json()}")
        if response.status_code == 200:
            print("   ✅ PASS")
        else:
            print("   ❌ FAIL")
    except Exception as e:
        print(f"   ❌ ERROR: {e}")
    
    print()
    print("=" * 60)
    print("Check Railway logs for detailed server-side output")
    print("=" * 60)

if __name__ == "__main__":
    test_endpoints()
