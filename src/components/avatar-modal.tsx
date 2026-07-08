"use client";

import { ChangeEvent, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Check, ImagePlus, X } from "lucide-react";

const MAX_INPUT_SIZE = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

async function renderCroppedWebp(source: string, crop: Area) {
  const image = new Image();
  image.src = source;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Browser tidak mendukung pemrosesan gambar.");
  context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, 512, 512);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  if (!blob) throw new Error("Gagal mengompres avatar.");
  return blob;
}

export function AvatarModal({ onClose, onSave }: { onClose: () => void; onSave: (avatar: Blob) => Promise<void> }) {
  const [source, setSource] = useState("");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixels, setPixels] = useState<Area>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => () => { if (source) URL.revokeObjectURL(source); }, [source]);

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setError("");
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) return setError("Gunakan file JPG, PNG, atau WebP.");
    if (file.size > MAX_INPUT_SIZE) return setError("Ukuran gambar maksimal 5 MB.");
    if (source) URL.revokeObjectURL(source);
    setSource(URL.createObjectURL(file));
    setCrop({ x: 0, y: 0 });
    setZoom(1);
  };

  const save = async () => {
    if (!source || !pixels) return setError("Pilih gambar terlebih dahulu.");
    setSaving(true);
    setError("");
    try {
      await onSave(await renderCroppedWebp(source, pixels));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gagal menyimpan avatar.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-card avatar-modal" role="dialog" aria-modal="true" aria-labelledby="avatar-title">
        <div className="modal-heading"><div><p>PROFIL</p><h2 id="avatar-title">Ganti avatar</h2></div><button type="button" onClick={onClose} aria-label="Tutup"><X size={20} /></button></div>
        <label className="avatar-file-button"><ImagePlus size={18} /><span>{source ? "Pilih gambar lain" : "Pilih gambar"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseFile} /></label>
        {source && <><div className="avatar-crop"><Cropper image={source} crop={crop} zoom={zoom} aspect={1} cropShape="round" showGrid={false} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, area) => setPixels(area)} /></div><label className="zoom-control"><span>Perbesar</span><input type="range" min={1} max={3} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label></>}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Batal</button><button type="button" className="primary-button" disabled={!source || saving} onClick={() => void save()}><Check size={17} />{saving ? "Menyimpan..." : "Simpan avatar"}</button></div>
      </section>
    </div>
  );
}
