import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Storage abstraction for uploads
// Supports both local filesystem (dev) and S3-compatible storage (production)

class StorageProvider {
  constructor() {
    // Default to local filesystem for development
    this.provider = process.env.STORAGE_PROVIDER || 'local';
    this.bucket = process.env.S3_BUCKET || 'capitol-uploads';
    this.region = process.env.S3_REGION || 'us-east-1';
    this.accessKeyId = process.env.S3_ACCESS_KEY_ID;
    this.secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    this.endpoint = process.env.S3_ENDPOINT;
    
    // Initialize S3 client if credentials are available
    this.s3Client = null;
    if (this.provider === 's3' && this.accessKeyId && this.secretAccessKey && this.accessKeyId !== 'placeholder') {
      try {
        const s3Config = {
          region: this.region,
          credentials: {
            accessKeyId: this.accessKeyId,
            secretAccessKey: this.secretAccessKey,
          },
        };
        
        // Add custom endpoint if provided (for S3-compatible services)
        if (this.endpoint) {
          s3Config.endpoint = this.endpoint;
        }
        
        this.s3Client = new S3Client(s3Config);
        console.log('[Storage] S3 client initialized');
      } catch (error) {
        console.error('[Storage] Failed to initialize S3 client:', error);
        console.warn('[Storage] Falling back to local filesystem storage');
        this.provider = 'local';
      }
    } else if (this.provider === 's3') {
      console.warn('[Storage] S3 credentials not properly configured, using local filesystem storage');
      this.provider = 'local';
    }
    
    // Ensure upload directory exists for local storage
    this.uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
    if (this.provider === 'local') {
      try {
        if (!fs.existsSync(this.uploadDir)) {
          fs.mkdirSync(this.uploadDir, { recursive: true });
          console.log('[Storage] Created upload directory:', this.uploadDir);
        }
      } catch (error) {
        console.error('[Storage] Failed to create upload directory:', error);
      }
    }
    
    console.log('[Storage] Initialized with provider:', this.provider, 'uploadDir:', this.uploadDir);
  }

  async uploadFile(file, key) {
    console.log('[Storage] Starting file upload', { key, mimetype: file.mimetype, size: file.size });
    
    if (this.provider === 's3' && this.s3Client) {
      return this.uploadToS3(file, key);
    } else {
      return this.uploadToLocal(file, key);
    }
  }

  async uploadToS3(file, key) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: file.mimetype,
      });
      
      await this.s3Client.send(command);
      
      // Return S3 public URL
      const publicUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
      console.log('[Storage] File uploaded to S3', { key, size: buffer.length, publicUrl });
      return publicUrl;
    } catch (error) {
      console.error('[Storage] S3 upload failed:', error);
      console.warn('[Storage] Falling back to local filesystem storage');
      return this.uploadToLocal(file, key);
    }
  }

  async uploadToLocal(file, key) {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const filePath = path.join(this.uploadDir, key);
      
      // Write file to disk
      fs.writeFileSync(filePath, buffer);
      
      // Return the relative path that can be served via Express static files
      const publicUrl = `/uploads/${key}`;
      console.log('[Storage] File saved to filesystem', { filePath, size: buffer.length, publicUrl });
      return publicUrl;
    } catch (error) {
      console.error('[Storage] Failed to save file to filesystem:', error);
      throw new Error('Failed to save file: ' + error.message);
    }
  }

  async deleteFile(key) {
    if (this.provider === 's3' && this.s3Client) {
      return this.deleteFromS3(key);
    } else {
      return this.deleteFromLocal(key);
    }
  }

  async deleteFromS3(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });
      
      await this.s3Client.send(command);
      console.log('[Storage] File deleted from S3', { key });
    } catch (error) {
      console.error('[Storage] S3 deletion failed:', error);
    }
  }

  async deleteFromLocal(key) {
    try {
      const filePath = path.join(this.uploadDir, key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log('[Storage] Deleted file from filesystem', { key });
      }
    } catch (error) {
      console.error('[Storage] Failed to delete file from filesystem:', error);
    }
  }

  generateKey(filename) {
    const ext = path.extname(filename);
    const randomName = crypto.randomBytes(16).toString('hex');
    return `${randomName}${ext}`;
  }

  getPublicUrl(key) {
    if (this.provider === 's3') {
      // Return S3 public URL
      return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
    } else {
      // For local filesystem storage, return the path
      return `/uploads/${key}`;
    }
  }
}

export const storage = new StorageProvider();