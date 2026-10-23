import { Capacitor, registerPlugin } from '@capacitor/core';
import { Share } from '@capacitor/share';

const Photos = registerPlugin('SaveToPhotos');

export async function exportMedia(blob, filename, kind) {
  if (!Capacitor.isNativePlatform()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return;
  }
  // Save and share the same real asset. Propagate permission/bridge failures
  // rather than misleadingly showing a success toast.
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  if (kind === 'video') await Photos.saveVideoToPhotos({ base64 });
  else await Photos.saveImageToPhotos({ base64 });
  const { fileUrl } = await Photos.writeTempFile({ base64, fileName: filename });
  await Share.share({ files: [fileUrl], dialogTitle: 'Share your Tartanism creation' });
}

export async function exportNativeVideo(path) {
  await Photos.saveVideoFileToPhotos({ path });
  await Share.share({ files: [path], dialogTitle: 'Share your Tartanism loop' });
}
