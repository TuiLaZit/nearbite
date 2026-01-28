"""
Test script để verify endpoint /track-audio hoạt động đúng
"""
import requests
import json

# Test với local server
LOCAL_URL = "http://localhost:5000"
# Test với production server
PROD_URL = "https://nearbite.up.railway.app"

def test_track_audio(base_url):
    """Test endpoint /track-audio"""
    print(f"\n{'='*60}")
    print(f"🧪 Testing {base_url}/track-audio")
    print(f"{'='*60}")
    
    # Data để test
    test_data = {
        "restaurant_id": 10,
        "duration_seconds": 15
    }
    
    print(f"📤 Sending request with data: {json.dumps(test_data, indent=2)}")
    
    try:
        response = requests.post(
            f"{base_url}/track-audio",
            json=test_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        
        print(f"\n📥 Response:")
        print(f"   Status Code: {response.status_code}")
        print(f"   Headers: {dict(response.headers)}")
        
        try:
            json_response = response.json()
            print(f"   Body: {json.dumps(json_response, indent=2, ensure_ascii=False)}")
        except:
            print(f"   Body (raw): {response.text}")
        
        if response.status_code == 200:
            print(f"\n✅ Test PASSED - Endpoint hoạt động đúng!")
            return True
        elif response.status_code == 404:
            print(f"\n❌ Test FAILED - Endpoint không tồn tại (404)")
            print(f"   → Cần deploy code mới lên server!")
            return False
        else:
            print(f"\n⚠️ Test có vấn đề - Status {response.status_code}")
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"\n❌ Cannot connect to {base_url}")
        print(f"   → Server có thể chưa chạy!")
        return False
    except Exception as e:
        print(f"\n❌ Error: {e}")
        return False

if __name__ == "__main__":
    print("🔍 Testing /track-audio endpoint...")
    
    # Test local
    print("\n1️⃣ Test LOCAL server:")
    local_ok = test_track_audio(LOCAL_URL)
    
    # Test production
    print("\n2️⃣ Test PRODUCTION server:")
    prod_ok = test_track_audio(PROD_URL)
    
    # Summary
    print(f"\n{'='*60}")
    print("📊 SUMMARY:")
    print(f"{'='*60}")
    print(f"   Local:      {'✅ OK' if local_ok else '❌ FAIL'}")
    print(f"   Production: {'✅ OK' if prod_ok else '❌ FAIL'}")
    
    if not prod_ok:
        print(f"\n💡 HƯỚNG DẪN FIX:")
        print(f"   1. Commit code mới: git add . && git commit -m 'Add track-audio endpoint'")
        print(f"   2. Push lên Railway: git push")
        print(f"   3. Đợi Railway deploy xong (~2-3 phút)")
        print(f"   4. Test lại bằng script này")
