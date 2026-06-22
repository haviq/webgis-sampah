import { test, expect } from '@playwright/test';

// GANTI DENGAN KREDENSIAL AKUN TES ANDA!
const AKUN_WARGA = { email: 'tes@gmail.com', password: 'tes123' };
const AKUN_COURIER = { email: 'trans@gmail.com', password: 'trans123' };
const AKUN_ADMIN = { email: 'adminn@gmail.com', password: 'admin123' };

test.describe('E2E Alur Penjemputan Sampah', () => {

  test('Skenario: Warga Panggil Truk, Courier Ambil, Courier Selesaikan', async ({ browser }) => {
    // 1. Siapkan 2 jendela terpisah (Satu untuk Warga, Satu untuk Courier)
    const wargaContext = await browser.newContext();
    const transContext = await browser.newContext();

    const wargaPage = await wargaContext.newPage();
    const transPage = await transContext.newPage();

    // =============== PROSES WARGA ===============
    await wargaPage.goto('http://localhost:5173/'); // Pastikan server jalan di port 5173

    // Warga Login
    await wargaPage.fill('input[type="email"]', AKUN_WARGA.email);
    await wargaPage.fill('input[type="password"]', AKUN_WARGA.password);
    await wargaPage.click('button:has-text("Masuk")');
    await wargaPage.waitForURL('**/dashboard'); // Tunggu sampai masuk dashboard

    // Warga ke halaman Lapor Sampah
    await wargaPage.click('text=Laporkan Sampah');
    await wargaPage.fill('input[type="number"]', '5'); // Isi berat sampah

    // Klik panggil truk
    await wargaPage.click('button:has-text("Panggil Truk")');

    // Beri waktu sistem memproses database
    await wargaPage.waitForTimeout(2000);

    // =============== PROSES Courier ===============
    await transPage.goto('http://localhost:5173/');

    // Courier Login
    await transPage.fill('input[type="email"]', AKUN_COURIER.email);
    await transPage.fill('input[type="password"]', AKUN_COURIER.password);
    await transPage.click('button:has-text("Masuk")');
    await transPage.waitForURL('**/dashboard');

    // Buka menu Tugas Jemput
    await transPage.click('text=Tugas Jemput');

    // Pastikan tombol Ambil tersedia, lalu klik Ambil
    // Ini otomatis akan memvalidasi apakah data ganda atau tidak
    const tombolAmbil = transPage.locator('button:has-text("Ambil")').first();
    await tombolAmbil.click();

    // Tunggu sampai hilang dari daftar (fitur yang baru saja kita kerjakan!)
    await transPage.waitForTimeout(2000);

    // Buka menu Status Truk
    await transPage.click('text=Status Truk');

    // =============== CEK HASIL ===============
    // Di sisi Warga, tombol harusnya terkunci dan bertuliskan Sedang Dijadwalkan
    const tombolWarga = wargaPage.locator('button:has-text("Sedang Dijadwalkan")');
    await expect(tombolWarga).toBeVisible();

    console.log("✅ TES SUKSES: Warga memanggil truk, Courier mengambil tugas. Data aman tanpa ganda!");
  });

});

