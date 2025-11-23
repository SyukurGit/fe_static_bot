

---

# 📊 Dashboard Keuangan Syukur — Frontend Statik

Dashboard dari telegram Keuangan Syukur adalah **frontend statik modern** berbasis HTML + Tailwind + Alpine.js yang terhubung ke backend API ( Gin Golang) menggunakan **JWT Authentication**.

Dashboard ini menampilkan:

* Total pemasukan
* Total pengeluaran
* Saldo akhir
* Grafik pemasukan/pengeluaran 30 hari
* Riwayat transaksi (dengan filter)
* Kategori transaksi terbesar

---

## 🚀 Tech Stack

| Teknologi              | Fungsi                      |
| ---------------------- | --------------------------- |
| **HTML statik**        | Struktur UI                 |
| **Tailwind CSS (CDN)** | Styling modern              |
| **Alpine.js**          | Reactive frontend minimalis |
| **Chart.js**           | Grafik aktivitas keuangan   |
| **Fetch API**          | Komunikasi dengan backend   |
| **JWT**                | Autentikasi                 |

---

## 📁 Struktur Folder

```
project-root/
│
├── index.html      # UI halaman login + dashboard
├── app.js          # Logic Alpine.js: auth, fetch API, chart
└── styles.css      # Style tambahan
```

---

## 🔐 Autentikasi JWT — Cara Kerjanya

1. User login ke `/login`
2. Backend mengembalikan:

```json
{
  "token": "<JWT_TOKEN>"
}
```

3. Frontend menyimpannya ke:

```js
localStorage.setItem("jwt_token", token)
```

4. Setiap request berikutnya memakai header:

```
Authorization: Bearer <JWT_TOKEN>
```

5. Jika token invalid / expired → backend mengembalikan `401`
   → frontend otomatis `logout()`.

---

## 🧩 Alur Kerja Aplikasi

### 1. User membuka halaman → `index.html`

* Alpine booting → cek apakah ada `jwt_token`
* Jika ada → langsung masuk dashboard
* Jika tidak ada → tampilkan form login

---

### 2. Login → POST `/login`

**Request:**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response berhasil:**

```json
{
  "token": "JWT_TOKEN"
}
```

Frontend menyimpan token dan menjalankan:

```js
fetchAllData()
```

---

### 3. Dashboard mengambil semua data

`fetchAllData()` memanggil paralel:

* `GET /api/summary`
* `GET /api/transactions`
* `GET /api/categories`
* `GET /api/chart/daily`

---

### 4. Fitur Dashboard

#### ✔ Ringkasan keuangan

Data dari `/api/summary`:

```json
{
  "total_income": 5000000,
  "total_expense": 1500000,
  "balance": 3500000
}
```

#### ✔ Riwayat transaksi

Dari `/api/transactions` atau dengan filter:

```
/api/transactions?type=income
/api/transactions?type=expense
```

**Contoh response:**

```json
{
  "data": [
    {
      "id": 1,
      "type": "income",
      "category": "Gaji",
      "note": "Gaji bulanan",
      "amount": 5000000,
      "created_at": "2025-11-20T15:30:00Z"
    }
  ]
}
```

#### ✔ Kategori terbesar

Dari `/api/categories`:

```json
{
  "data": [
    { "category": "Makan", "type": "expense", "total": 450000 },
    { "category": "Gaji", "type": "income", "total": 5000000 }
  ]
}
```

Frontend menambahkan:

```js
share = (c.total / totalAll) * 100
```

#### ✔ Grafik Chart.js

Dari `/api/chart/daily`:

```json
{
  "data": [
    { "date": "2025-11-01", "income": 200000, "expense": 50000 },
    { "date": "2025-11-02", "income": 0, "expense": 80000 }
  ]
}
```

---

### 5. Logout

Proses logout:

```js
localStorage.removeItem("jwt_token")
isLoggedIn = false
```

Backend tidak terlibat.
Semua state dibersihkan di frontend.

---

## 📡 Daftar Endpoint API (Versi Rapi & Lengkap)

### 🔓 1. `POST /login`

**Body JSON:**

```json
{
  "username": "admin",
  "password": "admin123"
}
```

**Response sukses:**

```json
{
  "token": "JWT_TOKEN"
}
```

---

### 🔐 Endpoint lain harus memakai header:

```
Authorization: Bearer <JWT_TOKEN>
```

---

### 📘 2. `GET /api/summary`

**Response:**

```json
{
  "total_income": 5000000,
  "total_expense": 1500000,
  "balance": 3500000
}
```

---

### 📗 3. `GET /api/transactions`

Tanpa filter:

```
GET /api/transactions
```

Dengan filter:

```
GET /api/transactions?type=income
GET /api/transactions?type=expense
```

**Response:**

```json
{
  "data": [
    {
      "id": 1,
      "type": "expense",
      "category": "Makan",
      "note": "Nasi goreng",
      "amount": 20000,
      "created_at": "2025-11-21T10:00:00Z"
    }
  ]
}
```

---

### 📙 4. `GET /api/categories`

**Response:**

```json
{
  "data": [
    { "category": "Gaji", "type": "income", "total": 5000000 },
    { "category": "Makan", "type": "expense", "total": 450000 }
  ]
}
```

---

### 📈 5. `GET /api/chart/daily`

**Response:**

```json
{
  "data": [
    { "date": "2025-11-01", "income": 200000, "expense": 50000 },
    { "date": "2025-11-02", "income": 0, "expense": 80000 }
  ]
}
```

---

# 🔄 Diagram Sequence (Login → Dashboard)

```
User
 │
 │ buka index.html
 ▼
Browser (Alpine.js)
 │ cek localStorage untuk jwt_token
 ├── ada token? → lanjut ke dashboard
 │
 └── tidak ada → tampil login
 │
 ▼
User → POST /login → Backend
 │
Backend verifikasi kredensial
 │
Backend → token JWT → Browser
 │
Browser simpan token → localStorage
 │
Browser → GET /api/summary
Browser → GET /api/transactions
Browser → GET /api/categories
Browser → GET /api/chart/daily
 │
Backend mengirim data
 │
Browser render dashboard
```

---

# 🔥 Flowchart Login & Autentikasi

```
         +---------------------+
         |  Buka index.html    |
         +---------------------+
                    |
                    v
      +----------------------------+
      |  Cek localStorage token?   |
      +----------------------------+
           | YES          | NO
           v              v
+------------------+   +--------------------+
| fetchAllData()   |   | Tampilkan Login UI |
+------------------+   +--------------------+
           |                  |
           |                  v
           |        User klik "Login"
           |                  |
           |      POST /login (username/pass)
           |                  |
           |         Token valid?
           |          | YES       | NO
           |          v           v
           |    Simpan token   Tampilkan error
           |          |
           |          v
           |   fetchAllData()
           v
 +-------------------------+
 | Render Dashboard Full   |
 +-------------------------+
```

---

# 🧪 Cara Test Manual

1. Jalankan backend Gin / server API kamu
2. Pastikan endpoint sesuai daftar di README ini
3. Buka `index.html` via Live Server atau browser langsung
4. Login pakai:

   * **username:** admin
   * **password:** admin123
5. Dashboard akan memuat:

   * summary
   * transactions
   * categories
   * chart

---

