import { useState } from "react";
import { FileUpload } from "./FileUpload";

export function ImageUpload({ onFiles, ...props }) {
  const [previews, setPreviews] = useState([]);

  const handleFiles = (files) => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews((prev) => [...prev, ...urls]);
    onFiles?.(files);
  };

  return (
    <div className="space-y-4">
      <FileUpload
        accept="image/*"
        multiple
        onFiles={handleFiles}
        label="Sube imágenes"
        hint="JPG, PNG o WEBP"
        {...props}
      />
      {previews.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {previews.map((src, i) => (
            <img
              key={`${src}-${i}`}
              src={src}
              alt={`preview-${i}`}
              className="aspect-square rounded-md border object-cover"
            />
          ))}
        </div>
      )}
    </div>
  );
}
