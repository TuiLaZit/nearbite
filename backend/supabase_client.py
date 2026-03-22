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

# Avoid repeated bucket checks on every upload.
_checked_buckets = set()

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)

    except Exception as e:
        pass


def ensure_bucket_exists(bucket_name="restaurant-images"):
    """Ensure storage bucket exists, but only when storage operations are used."""
    if bucket_name in _checked_buckets or not supabase_client:
        return

    try:
        buckets = supabase_client.storage.list_buckets()
        bucket_names = [b["name"] for b in buckets]

        if bucket_name not in bucket_names:
            supabase_client.storage.create_bucket(
                bucket_name,
                options={"public": True}
            )
    except Exception:
        # Do not block app startup or request handling if storage bootstrap fails.
        pass
    finally:
        _checked_buckets.add(bucket_name)


def get_public_url_for_path(path, bucket_name="restaurant-images"):
    if not supabase_client or not path:
        return None

    try:
        value = supabase_client.storage.from_(bucket_name).get_public_url(path)
        if isinstance(value, str):
            return value
        if isinstance(value, dict):
            return value.get("publicUrl") or value.get("publicURL")
    except Exception:
        return None

    return None


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

    ensure_bucket_exists(bucket_name)
    
    try:
        # Upload file to storage
        response = supabase_client.storage.from_(bucket_name).upload(
            filename,
            file_bytes,
            {"content-type": "image/jpeg"}  # Adjust based on actual file type
        )
        
        # Get public URL
        public_url = get_public_url_for_path(filename, bucket_name=bucket_name)
        
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
