// Unsigned Cloudinary upload (same approach as the portfolio).
// Set PUBLIC_CLOUDINARY_CLOUD_NAME and PUBLIC_CLOUDINARY_UPLOAD_PRESET
// in Netlify. If they are missing, uploadImage throws a friendly error and the
// admin can still paste an image URL by hand.
//
// NOTE: Astro exposes browser env vars prefixed PUBLIC_ (CRA used REACT_APP_).

const CLOUD_NAME = import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.PUBLIC_CLOUDINARY_UPLOAD_PRESET;

export function cloudinaryConfigured() {
  return Boolean(CLOUD_NAME && UPLOAD_PRESET);
}

export async function uploadImage(file) {
  if (!cloudinaryConfigured()) {
    throw new Error(
      "Cloudinary is not configured. Add PUBLIC_CLOUDINARY_CLOUD_NAME and PUBLIC_CLOUDINARY_UPLOAD_PRESET, or paste an image URL instead."
    );
  }
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body: form }
  );
  const data = await res.json();
  if (!res.ok || !data.secure_url) {
    throw new Error(data.error?.message || "Upload failed");
  }
  return data.secure_url;
}
