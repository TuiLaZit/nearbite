import os
import re
from supabase import create_client, Client
from dotenv import load_dotenv

# Load .env only in development (không ảnh hưởng production)
load_dotenv()

def extract_supabase_url_from_database_url(database_url):
    """
    Tự động lấy SUPABASE_URL từ DATABASE_URL
    VD: postgresql://postgres.frukwijesoibjwexwalm:pass@aws-1-ap-south-1.pooler.supabase.com:6543/postgres
    → https://frukwijesoibjwexwalm.supabase.co
    """
    if not database_url:
        return None
    
    # Tìm project reference (phần sau "postgres.")
    match = re.search(r'postgres\.([a-zA-Z0-9]+)', database_url)
    if match:
        project_ref = match.group(1)
        return f"https://{project_ref}.supabase.co"
    
    return None

# Lấy DATABASE_URL từ Railway (biến này đã có sẵn)
DATABASE_URL = os.getenv("DATABASE_URL")

# Tự động tạo SUPABASE_URL từ DATABASE_URL nếu chưa có
SUPABASE_URL = os.getenv("SUPABASE_URL")
if not SUPABASE_URL and DATABASE_URL:
    SUPABASE_URL = extract_supabase_url_from_database_url(DATABASE_URL)
    if SUPABASE_URL:
        print(f"✅ Tự động lấy SUPABASE_URL từ DATABASE_URL: {SUPABASE_URL}")

# Vẫn cần SUPABASE_SERVICE_KEY riêng (không thể lấy từ DATABASE_URL)
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Debug
print(f"🔍 SUPABASE_URL: {SUPABASE_URL[:40] if SUPABASE_URL else '❌ MISSING'}...")
print(f"🔍 SUPABASE_SERVICE_KEY: {'✅ SET (length: ' + str(len(SUPABASE_KEY)) + ')' if SUPABASE_KEY else '❌ MISSING - CẦN THÊM BIẾN NÀY TRÊN RAILWAY'}")

# Initialize Supabase client
supabase_client: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase Storage đã sẵn sàng - có thể upload ảnh")
    except Exception as e:
        print(f"❌ Lỗi khi kết nối Supabase Storage: {e}")
else:
    print("⚠️  Chưa thể upload ảnh - thiếu SUPABASE_SERVICE_KEY")
    if not SUPABASE_KEY:
        print("   📝 Cách fix: Thêm biến SUPABASE_SERVICE_KEY trên Railway")
        print("   → Vào https://supabase.com/dashboard → chọn project → Settings → API")
        print("   → Copy 'service_role' key (dạng eyJ...) → thêm vào Railway")


def upload_image(file_bytes, filename, bucket_name="restaurant-images"):
    """
    Upload image to Supabase Storage
    
    Args:
        file_bytes: Image file bytes
        filename: Name for the file
        bucket_name: Storage bucket name (default: restaurant-images)
    
    Returns:
        Public URL of the uploaded image or None if failed
    """
    if not supabase_client:
        raise Exception("Supabase client not initialized. Check your environment variables.")
    
    try:
        # Upload file to storage
        response = supabase_client.storage.from_(bucket_name).upload(
            filename,
            file_bytes,
            {"content-type": "image/jpeg"}  # Adjust based on actual file type
        )
        
        # Get public URL
        public_url = supabase_client.storage.from_(bucket_name).get_public_url(filename)
        
        return public_url
    
    except Exception as e:
        print(f"Error uploading image: {e}")
        raise e


def delete_image(filename, bucket_name="restaurant-images"):
    """
    Delete image from Supabase Storage
    
    Args:
        filename: Name of the file to delete
        bucket_name: Storage bucket name
    
    Returns:
        True if successful, False otherwise
    """
    if not supabase_client:
        return False
    
    try:
        supabase_client.storage.from_(bucket_name).remove([filename])
        return True
    except Exception as e:
        print(f"Error deleting image: {e}")
        return False
