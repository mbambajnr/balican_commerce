import fs from "fs";
import path from "path";
import crypto from "crypto";
import net from "net";
import { URL } from "url";
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

export function validateDocumentFile(mimeType: string, originalName: string): string | null {
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
  return null;
}

export async function storePrivateDocument(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{ storageKey: string; filename: string; mimeType: string; sizeBytes: number }> {
  const baseDir = path.resolve(config.upload.dir, "private");
  const ext = path.extname(originalName).toLowerCase();
  const hash = crypto.randomBytes(16).toString("hex");
  const storageKey = `vetting/${hash}${ext}`;
  const fullPath = path.join(baseDir, storageKey);
  const dir = path.dirname(fullPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(fullPath, fileBuffer);
  return { storageKey, filename: originalName, mimeType, sizeBytes: fileBuffer.length };
}

export function getPrivateDocumentPath(storageKey: string): string {
  return path.resolve(config.upload.dir, "private", storageKey);
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
}

let driver: StorageDriver | null = null;

export function getStorageDriver(): StorageDriver {
  if (!driver) {
    switch (config.upload.driver) {
      case "local":
      default:
        driver = new LocalStorageDriver();
    }
  }
  return driver;
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
