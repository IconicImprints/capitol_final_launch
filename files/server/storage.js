import crypto from 'crypto';
import path from 'path';

// Storage abstraction for uploads
// Supports both local filesystem (dev) and S3-compatible storage (production)

class StorageProvider {
  constructor() {
    this.provider = process.env.STORAGE_PROVIDER || 'local';
    this.bucket = process.env.S3_BUCKET || 'capitol-uploads';
    this.region = process.env.S3_REGION || 'us-east-1';
    this.accessKeyId = process.env.S3_ACCESS_KEY_ID;
    this.secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    this.endpoint = process.env.S3_ENDPOINT;
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
    
    if (!this.accessKeyId || !this.secretAccessKey) {
      throw new Error('S3 credentials not configured');
    }

    // Placeholder: In production, use AWS SDK
    // const AWS = require('aws-sdk');
    // const s3 = new AWS.S3({ ... });
    // await s3.putObject({ Bucket: this.bucket, Key: key, Body: file }).promise();
    
    // For now, fall back to local
    console.warn('S3 upload not fully implemented, falling back to local');
    return this.uploadToLocal(file, key);
  }

  async uploadToLocal(file, key) {
    const fs = await import('fs');
    const path = await import('path');
    
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    
    // Ensure upload directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    
    const filePath = path.join(uploadDir, key);
    const buffer = Buffer.from(await file.arrayBuffer());
    
    fs.writeFileSync(filePath, buffer);
    
    return `/uploads/${key}`;
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
    const fs = await import('fs');
    const path = await import('path');
    
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, key);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
      return `/uploads/${key}`;
    }
  }
}

export const storage = new StorageProvider();