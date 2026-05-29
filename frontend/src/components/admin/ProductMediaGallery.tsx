"use client";

import { useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import toast from "react-hot-toast";
import { Upload, LinkSimple, Trash, Star, ArrowUp, ArrowDown, VideoCamera, PencilSimple, Image as ImageIcon } from "@phosphor-icons/react";

interface MediaItem {
  id: string;
  media_type: "image" | "video";
  url: string;
  embed_url: string | null;
  provider: string | null;
  filename: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  alt_text: string | null;
  title: string | null;
  thumbnail_url: string | null;
  sort_order: number;
  is_primary: boolean;
  created_at: string;
}

interface EditModal {
  item: MediaItem;
  alt_text: string;
  title: string;
}

export default function ProductMediaGallery({ productId }: { productId: string }) {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoTitle, setVideoTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingVideo, setSavingVideo] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settingPrimaryId, setSettingPrimaryId] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);
  const [edit, setEdit] = useState<EditModal | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const images = media.filter((m) => m.media_type === "image");
  const videos = media.filter((m) => m.media_type === "video");

  const fetchMedia = () => {
    api.adminGetProductMedia(productId).then((res) => {
      setMedia(res.media);
    }).catch(() => {
      toast.error("Failed to load media");
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchMedia(); }, [productId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || uploading) return;
    setUploading(true);
    try {
      const fileArray = Array.from(files);
      await api.adminUploadProductImages(productId, fileArray);
      toast.success(`${fileArray.length} image(s) uploaded`);
      fetchMedia();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleAddVideo = async () => {
    if (!videoUrl.trim() || savingVideo) return;
    setSavingVideo(true);
    try {
      await api.adminAddProductVideo(productId, { url: videoUrl.trim(), title: videoTitle.trim() || undefined });
      toast.success("Video added");
      setVideoUrl("");
      setVideoTitle("");
      fetchMedia();
    } catch (err: any) {
      toast.error(err.message || "Failed to add video");
    } finally {
      setSavingVideo(false);
    }
  };

  const handleSetPrimary = async (mediaId: string) => {
    if (settingPrimaryId) return;
    setSettingPrimaryId(mediaId);
    try {
      await api.adminSetPrimaryMedia(productId, mediaId);
      toast.success("Primary image updated");
      fetchMedia();
    } catch (err: any) {
      toast.error(err.message || "Failed to set primary");
    } finally {
      setSettingPrimaryId(null);
    }
  };

  const handleDelete = async (item: MediaItem) => {
    if (deletingId) return;
    if (!confirm(`Delete this ${item.media_type === "image" ? "image" : "video"}?`)) return;
    setDeletingId(item.id);
    try {
      await api.adminDeleteMedia(productId, item.id);
      toast.success(`${item.media_type === "image" ? "Image" : "Video"} deleted`);
      fetchMedia();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeletingId(null);
    }
  };

  const handleMoveUp = async (index: number) => {
    if (index === 0 || reordering) return;
    setReordering(true);
    const ids = media.map((m) => m.id);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    try {
      await api.adminReorderMedia(productId, ids);
      fetchMedia();
    } catch (err: any) {
      toast.error(err.message || "Failed to reorder");
    } finally {
      setReordering(false);
    }
  };

  const handleMoveDown = async (index: number) => {
    if (index === media.length - 1 || reordering) return;
    setReordering(true);
    const ids = media.map((m) => m.id);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    try {
      await api.adminReorderMedia(productId, ids);
      fetchMedia();
    } catch (err: any) {
      toast.error(err.message || "Failed to reorder");
    } finally {
      setReordering(false);
    }
  };

  const openEdit = (item: MediaItem) => {
    setEdit({ item, alt_text: item.alt_text || "", title: item.title || "" });
  };

  const handleSaveEdit = async () => {
    if (!edit || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.adminUpdateMedia(productId, edit.item.id, {
        alt_text: edit.alt_text || null as any,
        title: edit.title || null as any,
      });
      toast.success("Media updated");
      setEdit(null);
      fetchMedia();
    } catch (err: any) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSavingEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-6 space-y-6">
        <h2 className="font-display text-base font-semibold text-ink">Media Gallery</h2>
        <div className="h-32 flex items-center justify-center text-sm text-muted">Loading media...</div>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-6">
      <h2 className="font-display text-base font-semibold text-ink">Media Gallery</h2>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-3">
          <label className={`btn btn-sm gap-1.5 cursor-pointer ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            <Upload size={14} weight="bold" />
            {uploading ? "Uploading..." : "Upload Images"}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
              onChange={handleUpload} className="hidden" disabled={uploading} />
          </label>
          <details className="relative">
            <summary className="btn btn-sm gap-1.5 cursor-pointer list-none">
              <LinkSimple size={14} /> Add Video Link
            </summary>
            <div className="absolute top-full left-0 mt-2 w-80 bg-white border border-border rounded-xl p-4 shadow-lg z-10 space-y-3">
              <p className="text-xs text-muted">Paste a YouTube or Vimeo URL</p>
              <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..." className="input text-sm" />
              <input value={videoTitle} onChange={(e) => setVideoTitle(e.target.value)}
                placeholder="Video title (optional)" className="input text-sm" />
              <button onClick={handleAddVideo} disabled={savingVideo || !videoUrl.trim()}
                className="btn btn-primary btn-sm w-full gap-1.5 disabled:opacity-50">
                <LinkSimple size={14} /> {savingVideo ? "Adding..." : "Add Video"}
              </button>
            </div>
          </details>
        </div>
        <p className="text-xs text-muted">Images appear on product cards and galleries. Videos must be YouTube or Vimeo links.</p>
      </div>

      {images.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2">
          <ImageIcon size={36} className="mx-auto text-muted" />
          <p className="text-sm font-medium text-ink">No product images yet</p>
          <p className="text-xs text-muted">Upload JPEG, PNG, or WebP images above. The first image becomes the primary thumbnail shown on product cards.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">Images ({images.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {images.map((item, index) => {
              const isBusy = deletingId === item.id || settingPrimaryId === item.id;
              return (
                <div key={item.id} className={`relative group rounded-xl border border-border overflow-hidden bg-zinc-50 ${isBusy ? "opacity-50" : ""}`}>
                  <div className="aspect-square">
                    <img src={item.url} alt={item.alt_text || ""}
                      className="h-full w-full object-cover" loading="lazy" />
                  </div>

                  {item.is_primary && (
                    <span className="absolute top-1.5 left-1.5 bg-yellow-400 text-yellow-900 text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                      <Star size={10} weight="fill" /> Primary
                    </span>
                  )}

                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                    <button onClick={() => openEdit(item)}
                      className="btn-icon bg-white/90 hover:bg-white text-ink rounded-full p-1.5" title="Edit alt text or title">
                      <PencilSimple size={14} />
                    </button>
                    {!item.is_primary && (
                      <button onClick={() => handleSetPrimary(item.id)}
                        className="btn-icon bg-white/90 hover:bg-white text-ink rounded-full p-1.5" title="Set as primary image">
                        <Star size={14} />
                      </button>
                    )}
                    <button onClick={() => handleMoveUp(index)}
                      disabled={index === 0 || reordering}
                      className="btn-icon bg-white/90 hover:bg-white text-ink rounded-full p-1.5 disabled:opacity-30" title="Move left">
                      <ArrowUp size={14} />
                    </button>
                    <button onClick={() => handleMoveDown(index)}
                      disabled={index === images.length - 1 || reordering}
                      className="btn-icon bg-white/90 hover:bg-white text-ink rounded-full p-1.5 disabled:opacity-30" title="Move right">
                      <ArrowDown size={14} />
                    </button>
                    <button onClick={() => handleDelete(item)}
                      className="btn-icon bg-red-500/90 hover:bg-red-500 text-white rounded-full p-1.5" title="Delete image">
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {videos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center space-y-2">
          <VideoCamera size={36} className="mx-auto text-muted" />
          <p className="text-sm font-medium text-ink">No product videos yet</p>
          <p className="text-xs text-muted">Add YouTube or Vimeo links above. Videos are embedded on the product detail page.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-ink uppercase tracking-wider">Videos ({videos.length})</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {videos.map((item) => {
              const isBusy = deletingId === item.id;
              return (
                <div key={item.id} className={`relative group rounded-xl border border-border overflow-hidden bg-zinc-50 ${isBusy ? "opacity-50" : ""}`}>
                  {item.thumbnail_url ? (
                    <div className="aspect-square relative">
                      <img src={item.thumbnail_url} alt={item.title || ""}
                        className="h-full w-full object-cover" loading="lazy" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                        <VideoCamera size={28} weight="fill" className="text-white" />
                      </div>
                    </div>
                  ) : (
                    <div className="aspect-square flex flex-col items-center justify-center bg-zinc-900 text-white p-2">
                      <VideoCamera size={32} weight="fill" />
                      <span className="mt-1 text-xs text-center line-clamp-2">{item.title || item.provider || "Video"}</span>
                    </div>
                  )}

                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5 p-1">
                    <button onClick={() => openEdit(item)}
                      className="btn-icon bg-white/90 hover:bg-white text-ink rounded-full p-1.5" title="Edit title">
                      <PencilSimple size={14} />
                    </button>
                    <button onClick={() => handleDelete(item)}
                      className="btn-icon bg-red-500/90 hover:bg-red-500 text-white rounded-full p-1.5" title="Delete video">
                      <Trash size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setEdit(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-ink">Edit {edit.item.media_type === "image" ? "Image" : "Video"}</h3>
            <div>
              <label className="input-label">Alt Text</label>
              <p className="text-xs text-muted mb-1">Descriptive text for accessibility and SEO</p>
              <input value={edit.alt_text} onChange={(e) => setEdit({ ...edit, alt_text: e.target.value })}
                className="input" placeholder="e.g. Solar panel installed on rooftop" />
            </div>
            <div>
              <label className="input-label">Title</label>
              <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })}
                className="input" placeholder="Display title" />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEdit(null)} className="btn btn-ghost">Cancel</button>
              <button onClick={handleSaveEdit} disabled={savingEdit} className="btn btn-primary disabled:opacity-50">
                {savingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
