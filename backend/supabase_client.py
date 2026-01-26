import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Service key for server-side operations

# Initialize Supabase client (will be None if env vars not set)
supabase_client: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase client initialized successfully")
    except Exception as e:
        print(f"❌ Failed to initialize Supabase client: {e}")
else:
    print("⚠️  Supabase credentials not found. Image upload will not work.")
    print("   Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env file")


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
