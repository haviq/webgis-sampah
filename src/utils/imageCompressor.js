/**
 * Mengkompresi file gambar (JPEG/PNG/dsb) menjadi string Base64 yang ringan
 * Cocok untuk disimpan langsung ke database (sebagai avatar_url).
 * Target ukuran hasil kompresi biasanya < 15KB.
 * 
 * @param {File} file - File gambar asli yang dipilih pengguna
 * @returns {Promise<string>} String Base64 dari gambar yang sudah dikompres
 */
export const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Set ukuran maksimal 200x200 pixel untuk avatar
        const MAX_WIDTH = 200;
        const MAX_HEIGHT = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        // Gambar ulang di canvas dengan ukuran baru
        ctx.drawImage(img, 0, 0, width, height);

        // Export ke Base64 format JPEG dengan kualitas 0.7 (kompresi tinggi tapi masih cukup bagus untuk foto kecil)
        const compressedBase64 = canvas.toDataURL("image/jpeg", 0.7);
        resolve(compressedBase64);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};
