import crypto from 'crypto';
import path from 'path';

// Storage abstraction for uploads
// Supports both local filesystem (dev) and S3-compatible storage (production)

class StorageProvider {
  constructor() {
    // Default to local (data URL) for serverless environments
    this.provider = process.env.STORAGE_PROVIDER || 'local';
    this.bucket = process.env.S3_BUCKET || 'capitol-uploads';
    this.region = process.env.S3_REGION || 'us-east-1';
    this.accessKeyId = process.env.S3_ACCESS_KEY_ID;
    this.secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    this.endpoint = process.env.S3_ENDPOINT;
    
    // Force local storage if S3 credentials are not properly configured
    if (this.provider === 's3' && (!this.accessKeyId || !this.secretAccessKey || this.accessKeyId === 'placeholder')) {
      console.warn('S3 credentials not properly configured, using local storage');
      this.provider = 'local';
    }
  }

  async uploadFile(file, key) {
    if (this.provider === 's3') {
      return this.uploadToS3(file, key);
    } else {
      return this.uploadToLocal(file, key);
    }
  }

  async uploadToS3(file, key) {
    // For production, this would use AWS SDK or similar
    // For now, we'll implement a simple version that can be extended
    // This is a placeholder - actual S3 implementation would require aws-sdk package
    
    if (!this.accessKeyId || !this.secretAccessKey || this.accessKeyId === 'placeholder') {
      console.warn('S3 credentials not configured, falling back to data URL');
      return this.uploadToLocal(file, key);
    }

    // Placeholder: In production, use AWS SDK
    // const AWS = require('aws-sdk');
    // const s3 = new AWS.S3({ ... });
    // await s3.putObject({ Bucket: this.bucket, Key: key, Body: file }).promise();
    
    // For now, fall back to local
    console.warn('S3 upload not fully implemented, falling back to data URL');
    return this.uploadToLocal(file, key);
  }

  async uploadToLocal(file, key) {
    // In Vercel serverless functions, we can't use persistent filesystem
    // Instead, we'll convert to base64 and return a data URL
    // For production, this should be replaced with proper cloud storage (S3, Cloudinary, etc.)
    
    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');
    const mimeType = file.mimetype || 'image/jpeg';
    
    // Return a data URL - this works for small images but has limitations
    // For production, implement proper cloud storage
    return `data:${mimeType};base64,${base64}`;
  }

  async deleteFile(key) {
    if (this.provider === 's3') {
      return this.deleteFromS3(key);
    } else {
      return this.deleteFromLocal(key);
    }
  }

  async deleteFromS3(key) {
    // Placeholder for S3 deletion
    console.warn('S3 deletion not fully implemented');
  }

  async deleteFromLocal(key) {
    // Data URLs don't need deletion - they're stored in the database
    // For filesystem-based storage, this would delete the file
    console.log('Delete operation for data URL not needed');
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
      // For local storage with data URLs, we return the key as-is since it's already a full URL
      // For filesystem paths, this would return the path
      return key.startsWith('data:') ? key : `/uploads/${key}`;
    }
  }
}

export const storage = new StorageProvider();