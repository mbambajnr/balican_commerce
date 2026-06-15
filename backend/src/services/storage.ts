import fs from "fs";
import path from "path";
import crypto from "crypto";
import net from "net";
import { Readable } from "stream";
import { URL } from "url";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config";

export interface StoredFile {
  url: string;
  storageKey: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StorageDriver {
  store(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile>;
  delete(storageKey: string): Promise<void>;
  storePrivate(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile>;
  getPrivateAccess(
    storageKey: string,
    filename: string,
    mimeType: string
  ): Promise<PrivateFileAccess | null>;
  importExisting(
    storageKey: string,
    fileBuffer: Buffer,
    mimeType: string,
    isPrivate: boolean
  ): Promise<void>;
  checkReadiness(): Promise<void>;
}

export interface PrivateFileAccess {
  stream?: Readable;
  redirectUrl?: string;
}

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

export function validateImageFile(mimeType: string, originalName: string): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    return `Unsupported file type: ${mimeType}. Allowed: JPEG, PNG, WebP`;
  }
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return `Unsupported file extension: ${ext}. Allowed: .jpg, .jpeg, .png, .webp`;
  }
  const extToMime: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
  };
  if (extToMime[ext] !== mimeType) {
    return `MIME type mismatch: extension ${ext} does not match ${mimeType}`;
  }
  return null;
}

const ALLOWED_DOCUMENT_TYPES = ["image/jpeg", "image/png", "application/pdf"];
const ALLOWED_DOCUMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".pdf"];

export function validateDocumentFile(mimeType: string, originalName: string, buffer?: Buffer): string | null {
  if (!ALLOWED_DOCUMENT_TYPES.includes(mimeType)) {
    return `Unsupported file type: ${mimeType}. Allowed: PDF, JPG, PNG`;
  }
  const ext = path.extname(originalName).toLowerCase();
  if (!ALLOWED_DOCUMENT_EXTENSIONS.includes(ext)) {
    return `Unsupported file extension: ${ext}. Allowed: .pdf, .jpg, .jpeg, .png`;
  }
  const extToMime: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
  };
  if (extToMime[ext] !== mimeType) {
    return `MIME type mismatch: extension ${ext} does not match ${mimeType}`;
  }
  if (buffer && !hasValidDocumentSignature(mimeType, buffer)) {
    return `File content does not match declared type: ${mimeType}`;
  }
  return null;
}

function hasValidDocumentSignature(mimeType: string, buffer: Buffer): boolean {
  if (mimeType === "application/pdf") {
    return buffer.subarray(0, 1024).includes(Buffer.from("%PDF-", "ascii"));
  }
  if (mimeType === "image/png") {
    const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    return buffer.length >= pngSignature.length && buffer.subarray(0, pngSignature.length).equals(pngSignature);
  }
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff;
  }
  return false;
}

export async function storePrivateDocument(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{ storageKey: string; filename: string; mimeType: string; sizeBytes: number }> {
  return getStorageDriver().storePrivate(fileBuffer, originalName, mimeType);
}

export async function getPrivateDocumentAccess(
  storageKey: string,
  filename: string,
  mimeType: string
): Promise<PrivateFileAccess | null> {
  return getStorageDriver().getPrivateAccess(storageKey, filename, mimeType);
}

class LocalStorageDriver implements StorageDriver {
  private uploadDir: string;
  private publicBaseUrl: string;

  constructor() {
    this.uploadDir = path.resolve(config.upload.dir);
    this.publicBaseUrl = config.upload.publicBaseUrl.replace(/\/+$/, "");
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async store(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile> {
    const ext = path.extname(originalName).toLowerCase();
    const hash = crypto.randomBytes(16).toString("hex");
    const storageKey = `products/${hash}${ext}`;
    const fullPath = path.join(this.uploadDir, storageKey);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, fileBuffer);
    const url = `${this.publicBaseUrl}/${storageKey}`;
    return {
      url,
      storageKey,
      filename: originalName,
      mimeType,
      sizeBytes: fileBuffer.length,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = path.join(this.uploadDir, storageKey);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  async storePrivate(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile> {
    const ext = path.extname(originalName).toLowerCase();
    const hash = crypto.randomBytes(16).toString("hex");
    const storageKey = `vetting/${hash}${ext}`;
    const fullPath = path.resolve(this.uploadDir, "private", storageKey);
    await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.promises.writeFile(fullPath, fileBuffer);
    return {
      url: "",
      storageKey,
      filename: originalName,
      mimeType,
      sizeBytes: fileBuffer.length,
    };
  }

  async getPrivateAccess(storageKey: string): Promise<PrivateFileAccess | null> {
    const fullPath = path.resolve(this.uploadDir, "private", storageKey);
    try {
      await fs.promises.access(fullPath, fs.constants.R_OK);
      return { stream: fs.createReadStream(fullPath) };
    } catch {
      return null;
    }
  }

  async checkReadiness(): Promise<void> {
    await fs.promises.mkdir(this.uploadDir, { recursive: true });
    await fs.promises.access(this.uploadDir, fs.constants.R_OK | fs.constants.W_OK);
  }

  async importExisting(): Promise<void> {
    // Existing local files are already in place.
  }
}

class S3StorageDriver implements StorageDriver {
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl: string;

  constructor() {
    const s3 = config.upload.s3;
    this.bucket = s3.bucket;
    this.publicBaseUrl = config.upload.publicBaseUrl.replace(/\/+$/, "");
    this.client = new S3Client({
      region: s3.region,
      endpoint: s3.endpoint || undefined,
      forcePathStyle: s3.forcePathStyle,
      credentials: s3.accessKeyId
        ? {
            accessKeyId: s3.accessKeyId,
            secretAccessKey: s3.secretAccessKey,
          }
        : undefined,
    });
  }

  async store(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile> {
    const storageKey = createStorageKey("products", originalName);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: `public/${storageKey}`,
      Body: fileBuffer,
      ContentType: mimeType,
      CacheControl: "public, max-age=31536000, immutable",
      ServerSideEncryption: "AES256",
    }));
    return {
      url: `${this.publicBaseUrl}/${storageKey}`,
      storageKey,
      filename: originalName,
      mimeType,
      sizeBytes: fileBuffer.length,
    };
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: `public/${storageKey}`,
    }));
  }

  async storePrivate(fileBuffer: Buffer, originalName: string, mimeType: string): Promise<StoredFile> {
    const storageKey = createStorageKey("vetting", originalName);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: `private/${storageKey}`,
      Body: fileBuffer,
      ContentType: mimeType,
      ServerSideEncryption: "AES256",
    }));
    return {
      url: "",
      storageKey,
      filename: originalName,
      mimeType,
      sizeBytes: fileBuffer.length,
    };
  }

  async getPrivateAccess(
    storageKey: string,
    filename: string,
    mimeType: string
  ): Promise<PrivateFileAccess> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: `private/${storageKey}`,
      ResponseContentType: mimeType || "application/octet-stream",
      ResponseContentDisposition: `attachment; filename="${sanitizeFilename(filename)}"`,
    });
    return {
      redirectUrl: await getSignedUrl(this.client, command, {
        expiresIn: config.upload.signedUrlExpiresSeconds,
      }),
    };
  }

  async checkReadiness(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async importExisting(
    storageKey: string,
    fileBuffer: Buffer,
    mimeType: string,
    isPrivate: boolean
  ): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: `${isPrivate ? "private" : "public"}/${storageKey}`,
      Body: fileBuffer,
      ContentType: mimeType,
      CacheControl: isPrivate ? undefined : "public, max-age=31536000, immutable",
      ServerSideEncryption: "AES256",
    }));
  }
}

let driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (!driver) {
    switch (config.upload.driver) {
      case "s3":
        driver = new S3StorageDriver();
        break;
      case "local":
      default:
        driver = new LocalStorageDriver();
    }
  }
  return driver;
}

function createStorageKey(prefix: string, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase();
  return `${prefix}/${crypto.randomBytes(16).toString("hex")}${ext}`;
}

function sanitizeFilename(filename: string): string {
  return filename.split(/[\\/]/).pop()!.replace(/[\r\n"]/g, "_").slice(0, 200) || "document";
}

export function resetStorageDriverForTests(): void {
  driver = null;
}

export async function importExistingStorageObject(
  storageKey: string,
  fileBuffer: Buffer,
  mimeType: string,
  isPrivate: boolean
): Promise<void> {
  await getStorageDriver().importExisting(storageKey, fileBuffer, mimeType, isPrivate);
}

const PRIVATE_IP_PATTERNS = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/,
  /^fe80:/,
];

export function isValidVideoUrl(rawUrl: string): { valid: boolean; reason?: string } {
  const dangerous = ["javascript:", "data:", "file:", "vbscript:", "blob:"];
  for (const prefix of dangerous) {
    if (rawUrl.trim().toLowerCase().startsWith(prefix)) {
      return { valid: false, reason: `URLs with ${prefix} scheme are not allowed` };
    }
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: "Only http and https URLs are allowed" };
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0" || hostname === "[::1]") {
    return { valid: false, reason: "Localhost URLs are not allowed" };
  }
  if (net.isIP(hostname)) {
    for (const pattern of PRIVATE_IP_PATTERNS) {
      if (pattern.test(hostname)) {
        return { valid: false, reason: "Private IP URLs are not allowed" };
      }
    }
  }
  return { valid: true };
}

export interface YouTubeParseResult {
  embedUrl: string;
  videoId: string;
  thumbnailUrl: string;
}

export function parseYouTubeUrl(url: string): YouTubeParseResult | null {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]+)/,
    /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      const videoId = match[1];
      return {
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        videoId,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      };
    }
  }
  return null;
}

export interface VimeoParseResult {
  embedUrl: string;
  videoId: string;
  thumbnailUrl: null;
}

export function parseVimeoUrl(url: string): VimeoParseResult | null {
  const patterns = [
    /(?:https?:\/\/)?(?:www\.)?vimeo\.com\/(\d+)/,
    /(?:https?:\/\/)?player\.vimeo\.com\/video\/(\d+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) {
      return {
        embedUrl: `https://player.vimeo.com/video/${match[1]}`,
        videoId: match[1],
        thumbnailUrl: null,
      };
    }
  }
  return null;
}

export interface VideoParseResult {
  embedUrl: string;
  provider: "youtube" | "vimeo" | "external";
  thumbnailUrl: string | null;
}

export function parseVideoUrl(url: string): VideoParseResult | null {
  const security = isValidVideoUrl(url);
  if (!security.valid) return null;

  const youtube = parseYouTubeUrl(url);
  if (youtube) return { embedUrl: youtube.embedUrl, provider: "youtube", thumbnailUrl: youtube.thumbnailUrl };
  const vimeo = parseVimeoUrl(url);
  if (vimeo) return { embedUrl: vimeo.embedUrl, provider: "vimeo", thumbnailUrl: null };
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return { embedUrl: url, provider: "external", thumbnailUrl: null };
  }
  return null;
}
