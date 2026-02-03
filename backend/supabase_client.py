import os
import re
from supabase import create_client, Client # type: ignore
from dotenv import load_dotenv # type: ignore

# Load .env only in development (không ảnh hưởng production)
load_dotenv()

def extract_supabase_url_from_database_url(database_url):
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

# Vẫn cần SUPABASE_SERVICE_KEY riêng (không thể lấy từ DATABASE_URL)
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Initialize Supabase client
supabase_client: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Tự động tạo bucket nếu chưa có
        try:
            buckets = supabase_client.storage.list_buckets()
            bucket_names = [b['name'] for b in buckets]
            
            if 'restaurant-images' not in bucket_names:
                supabase_client.storage.create_bucket(
                    'restaurant-images',
                    options={'public': True}
                )
        except Exception as bucket_error:
            pass
            
    except Exception as e:
        pass


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
