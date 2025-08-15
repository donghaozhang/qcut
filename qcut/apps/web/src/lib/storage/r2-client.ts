import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/env";

// Cloudflare R2 Client for transcription file storage
export class R2Client {
  private client: S3Client;
  
  constructor() {
    this.client = new S3Client({
      region: "auto", // Cloudflare R2 uses 'auto' region
      endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  /**
   * Upload file to R2 bucket
   */
  async uploadFile(key: string, file: ArrayBuffer | Uint8Array, contentType?: string): Promise<void> {
    const body = file instanceof ArrayBuffer ? new Uint8Array(file) : file;
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    });

    await this.client.send(command);
  }

  /**
   * Download file from R2 bucket
   */
  async downloadFile(key: string): Promise<ArrayBuffer> {
    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    });

    const response = await this.client.send(command);
    
    if (!response.Body) {
      throw new Error(`File not found: ${key}`);
    }

    // Convert stream to ArrayBuffer
    const byteArray = await response.Body.transformToByteArray();
    // Create a new ArrayBuffer from the Uint8Array to ensure proper type
    const buffer = new ArrayBuffer(byteArray.byteLength);
    new Uint8Array(buffer).set(byteArray);
    return buffer;
  }

  /**
   * Delete file from R2 bucket
   */
  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    });

    await this.client.send(command);
  }

  /**
   * Generate unique filename for transcription
   */
  generateTranscriptionKey(originalFilename: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const extension = originalFilename.split('.').pop() || 'bin';
    return `transcription/${timestamp}-${random}.${extension}`;
  }

  /**
   * Check if transcription service is properly configured
   */
  static isConfigured(): boolean {
    return !!(
      env.CLOUDFLARE_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET_NAME
    );
  }
}

// Export singleton instance
export const r2Client = new R2Client();