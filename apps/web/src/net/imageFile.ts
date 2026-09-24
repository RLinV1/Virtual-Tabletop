/** Natural pixel size of an image — a local file before upload, or a URL after. */
export function imageSize(src: File | string) {
  const url = typeof src === "string" ? src : URL.createObjectURL(src);
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    const done = () => {
      if (typeof src !== "string") URL.revokeObjectURL(url);
    };
    img.onload = () => {
      done();
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      done();
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}

/** "goblin_archer.png" -> "goblin archer": a sensible default display name. */
export function nameFromFile(file: File) {
  return file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 80) || "Untitled";
}
