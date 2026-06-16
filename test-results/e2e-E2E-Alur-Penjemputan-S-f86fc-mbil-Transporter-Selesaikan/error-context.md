# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e.spec.js >> E2E Alur Penjemputan Sampah >> Skenario: Warga Panggil Truk, Transporter Ambil, Transporter Selesaikan
- Location: tests\e2e.spec.js:10:3

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]:
        - img [ref=e7]
        - generic [ref=e9]: ECO WARGA
      - button "Tutup Sidebar" [ref=e10] [cursor=pointer]:
        - img [ref=e11]
    - list [ref=e13]:
      - listitem [ref=e14] [cursor=pointer]:
        - img [ref=e16]
        - generic [ref=e18]: Dashboard
      - listitem [ref=e19] [cursor=pointer]:
        - img [ref=e21]
        - generic [ref=e23]: Laporkan Sampah
      - listitem [ref=e24] [cursor=pointer]:
        - img [ref=e26]
        - generic [ref=e28]: Pembayaran
      - listitem [ref=e29] [cursor=pointer]:
        - img [ref=e31]
        - generic [ref=e33]: Jadwal Angkut
      - listitem [ref=e34] [cursor=pointer]:
        - img [ref=e36]
        - generic [ref=e38]: Tukar Poin
    - generic [ref=e39]:
      - generic [ref=e40]:
        - generic [ref=e41]: T
        - generic [ref=e42]:
          - generic [ref=e43]: tes
          - generic [ref=e44]: warga
      - button "Keluar" [ref=e45] [cursor=pointer]:
        - img [ref=e46]
        - generic [ref=e48]: Keluar
  - main [ref=e49]:
    - generic [ref=e50]:
      - generic [ref=e51]:
        - heading "Selamat Datang, tes!" [level=1] [ref=e52]
        - paragraph [ref=e53]: Kelola laporan sampah, pembayaran retribusi, dan eco poin Anda.
      - generic [ref=e54]: ECO CITIZEN
    - generic [ref=e55]:
      - generic [ref=e56]:
        - generic [ref=e57]:
          - generic [ref=e58]: Laporan Sampah
          - img [ref=e59]
        - generic [ref=e61]: 0 Laporan
      - generic [ref=e62]:
        - generic [ref=e63]:
          - generic [ref=e64]: Antrean Angkut
          - img [ref=e65]
        - generic [ref=e67]: 0 Menunggu
      - generic [ref=e68]:
        - generic [ref=e69]:
          - generic [ref=e70]: Eco Poin
          - img [ref=e71]
        - generic [ref=e73]: 0 Poin
      - generic [ref=e74] [cursor=pointer]:
        - generic [ref=e75]:
          - generic [ref=e76]: Status Iuran Bulan Ini
          - img [ref=e77]
        - generic [ref=e79]: ✗ Belum Bayar
    - generic [ref=e80]:
      - heading "Profil Spasial & Plotting Lokasi Rumah" [level=3] [ref=e81]
      - generic [ref=e82]:
        - generic [ref=e83]:
          - generic [ref=e84]:
            - generic [ref=e85]: Nama Lengkap
            - textbox "Masukkan nama" [ref=e86]: tes
          - generic [ref=e87]:
            - generic [ref=e88]: Alamat Rumah
            - textbox "Masukkan alamat" [ref=e89]
          - generic [ref=e90]: ⚠️ Klik peta untuk menandai lokasi rumah Anda
          - button "Simpan Profil & Lokasi" [ref=e91] [cursor=pointer]
        - generic [ref=e92]:
          - generic [ref=e93]: Peta Interaktif — Klik untuk Plot Koordinat
          - generic [ref=e94]:
            - generic [ref=e95]:
              - 'textbox "Cari nama lokasi/kota di peta... (misal: Malioboro)" [ref=e96]'
              - button "Cari Spasial" [ref=e97] [cursor=pointer]
            - generic [ref=e99]:
              - generic:
                - generic [ref=e100]:
                  - button "Zoom in" [ref=e101] [cursor=pointer]: +
                  - button "Zoom out" [ref=e102] [cursor=pointer]: −
                - link "Leaflet" [ref=e104] [cursor=pointer]:
                  - /url: https://leafletjs.com
                  - img [ref=e105]
                  - text: Leaflet
```