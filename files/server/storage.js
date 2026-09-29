import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Supabase Storage configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ CRITICAL: Supabase credentials not found for storage.');
  console.error('❌ Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.');
  throw new Error('Supabase credentials are required for storage.');
}

// Create Supabase client with service role key
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

class StorageProvider {
  constructor() {
    this.buckets = {
      profilePictures: 'profile-pictures',
      banners: 'banners',
      proofs: 'proofs',
      uploads: 'uploads'
    };
    console.log('[Storage] Initialized with Supabase Storage');
  }

  async uploadFile(file, key, bucket = 'uploads') {
    console.log('[Storage] Starting file upload', { key, mimetype: file.mimetype, size: file.size, bucket });
    
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const fileName = key;
      
      const { data, error } = await supabase
        .storage
        .from(bucket)
        .upload(fileName, buffer, {
          contentType: file.mimetype,
          upsert: true
        });
      
      if (error) {
        console.error('[Storage] Supabase upload failed:', error);
        throw new Error(`Upload failed: ${error.message}`);
      }
      
      // Get public URL
      const { data: { publicUrl } } = supabase
        .storage
        .from(bucket)
        .getPublicUrl(fileName);
      
      console.log('[Storage] File uploaded to Supabase Storage', { key, size: buffer.length, publicUrl });
      return publicUrl;
    } catch (error) {
      console.error('[Storage] Upload failed:', error);
      throw error;
    }
  }

  async deleteFile(key, bucket = 'uploads') {
    try {
      const { error } = await supabase
        .storage
        .from(bucket)
        .remove([key]);
      
      if (error) {
        console.error('[Storage] Supabase deletion failed:', error);
      } else {
        console.log('[Storage] File deleted from Supabase Storage', { key });
      }
    } catch (error) {
      console.error('[Storage] Failed to delete file:', error);
    }
  }

  generateKey(filename) {
    const ext = filename.split('.').pop();
    const randomName = crypto.randomBytes(16).toString('hex');
    return `${randomName}.${ext}`;
  }

  getPublicUrl(key, bucket = 'uploads') {
    const { data } = supabase
      .storage
      .from(bucket)
      .getPublicUrl(key);
    return data.publicUrl;
  }

  // Ensure buckets exist
  async ensureBuckets() {
    const requiredBuckets = Object.values(this.buckets);
    
    for (const bucket of requiredBuckets) {
      try {
        const { data, error } = await supabase
          .storage
          .getBucket(bucket);
        
        if (error) {
          console.log(`[Storage] Creating bucket: ${bucket}`);
          const { error: createError } = await supabase
            .storage
            .createBucket(bucket, {
              public: true,
              fileSizeLimit: 10485760 // 10MB
            });
          
          if (createError) {
            console.error(`[Storage] Failed to create bucket ${bucket}:`, createError);
          } else {
            console.log(`[Storage] Created bucket: ${bucket}`);
          }
        }
      } catch (error) {
        console.error(`[Storage] Error checking bucket ${bucket}:`, error);
      }
    }
  }
}

export const storage = new StorageProvider();
