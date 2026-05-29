"use client";

import { useState } from "react";
import { Play, Image as ImageIcon } from "@phosphor-icons/react";

interface MediaItem {
  id: string;
  media_type: "image" | "video";
  url: string;
  embed_url: string | null;
  provider: string | null;
  alt_text: string | null;
  title: string | null;
  thumbnail_url: string | null;
  is_primary: boolean;
}

export default function ProductMediaGallery({ media, productName }: { media: MediaItem[]; productName: string }) {
  const images = media.filter((m) => m.media_type === "image");
  const videos = media.filter((m) => m.media_type === "video");

  const defaultImage = images.find((m) => m.is_primary) || images[0] || null;
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(defaultImage);

  const hasNoImages = images.length === 0;

  return (
    <div className="space-y-4">
      <div className="aspect-[4/3] rounded-2xl bg-zinc-100 flex items-center justify-center overflow-hidden">
        {activeMedia?.media_type === "video" && activeMedia.embed_url ? (
          <iframe
            src={activeMedia.embed_url}
            title={activeMedia.title || productName}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : activeMedia?.media_type === "video" ? (
          <div className="flex flex-col items-center gap-2 text-muted">
            <Play size={48} weight="fill" />
            <span className="text-sm">{activeMedia.title || "Video"}</span>
          </div>
        ) : activeMedia ? (
          <img src={activeMedia.url} alt={activeMedia.alt_text || productName}
            width={600} height={450} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-3 text-muted">
            <div className="flex items-center gap-1.5">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-zinc-400">
                <rect width="32" height="32" rx="4" fill="currentColor"/>
                <path d="M8 22L14 12L18 18L22 10L26 22H8Z" fill="#fff" fillOpacity="0.2"/>
                <circle cx="11" cy="11" r="2" fill="#fff" fillOpacity="0.3"/>
              </svg>
              <span className="text-xs font-semibold tracking-wider text-zinc-400">SILENT STAR</span>
            </div>
            <span className="text-xs text-zinc-400">No product images available</span>
          </div>
        )}
      </div>

      {(images.length > 1 || videos.length > 0) && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {images.map((img) => (
            <button key={img.id} onClick={() => setActiveMedia(img)}
              aria-label={img.alt_text || `View image ${img.id}`}
              className={`shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 transition-all ${
                activeMedia?.id === img.id ? "border-accent ring-1 ring-accent" : "border-transparent hover:border-zinc-300"
              }`}>
              <img src={img.url} alt={img.alt_text || ""}
                className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
          {videos.map((vid) => (
            <button key={vid.id} onClick={() => setActiveMedia(vid)}
              aria-label={vid.title || `Play video`}
              className={`shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden border-2 flex items-center justify-center bg-zinc-900 transition-all ${
                activeMedia?.id === vid.id ? "border-accent ring-1 ring-accent" : "border-transparent hover:border-zinc-600"
              }`}>
              <Play size={18} weight="fill" className="text-white" />
            </button>
          ))}
        </div>
      )}

      {hasNoImages && videos.length > 0 && (
        <div className="pt-2">
          <button onClick={() => setActiveMedia(videos[0])}
            className="btn btn-sm gap-2 w-full sm:w-auto">
            <Play size={16} weight="fill" />
            Watch Product Video{videos.length > 1 ? ` (${videos.length})` : ""}
          </button>
        </div>
      )}

      {videos.length > 0 && images.length > 0 && (
        <div className="border-t border-border pt-3">
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">Product Videos</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {videos.map((vid) => (
              <button key={vid.id} onClick={() => setActiveMedia(vid)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-all ${
                  activeMedia?.id === vid.id
                    ? "bg-accent text-white"
                    : "bg-zinc-100 text-soft hover:bg-zinc-200"
                }`}>
                <Play size={14} weight="fill" />
                {vid.title || vid.provider || "Video"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
