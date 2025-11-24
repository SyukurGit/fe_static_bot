const API_URL = "https://unbusily-unmoralistic-micki.ngrok-free.dev"; // Pastikan domain Ngrok benar

function financeApp() {
    return {
        // --- STATE UTAMA ---
        token: localStorage.getItem('jwt_token') || '',
        isLoggedIn: false,
        currentView: 'dashboard', // Opsi: 'dashboard', 'transactions', 'reports'
        isLoading: false,
        
        // --- STATE DATA ---
        user: { username: '' },
        summary: { total_income: 0, total_expense: 0, balance: 0 },
        rawTransactions: [], // Data mentah semua transaksi
        
        // --- STATE LAPORAN & FILTER ---
        filterDate: new Date().toISOString().slice(0, 7), // Format YYYY-MM (Bulan ini)
        activeTransactionType: 'all', // 'all', 'income', 'expense'
        
        // --- STATE PAGINATION ---
        currentPage: 1,
        itemsPerPage: 10,
        
        // --- STATE FORM LOGIN ---
        loginForm: { username: '', password: '' },
        loginError: '',

        // --- INISIALISASI ---
        init() {
            if (this.token) {
                this.isLoggedIn = true;
                this.fetchInitialData();
                
                // Auto refresh ringan (hanya dashboard) setiap 10 detik
                setInterval(() => {
                    if (this.isLoggedIn && this.currentView === 'dashboard') {
                        this.fetchSummary();
                        this.fetchChart();
                    }
                }, 10000);
            }
        },

        // --- NAVIGASI ---
        navigateTo(view, type = 'all') {
            this.currentView = view;
            this.activeTransactionType = type;
            this.currentPage = 1; // Reset halaman ke 1
            
            // Logic khusus saat pindah halaman
            if (view === 'transactions') {
                this.fetchTransactionsByMonth(); // Ambil data detail bulan terpilih
            } else if (view === 'reports') {
                this.generateReport(); // Hitung laporan
            }
        },

        // --- AUTHENTICATION ---
        async login() {
            this.isLoading = true;
            this.loginError = '';
            try {
                const res = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                    body: JSON.stringify(this.loginForm)
                });
                const data = await res.json();
                
                if (res.ok) {
                    this.token = data.token;
                    localStorage.setItem('jwt_token', data.token);
                    this.isLoggedIn = true;
                    this.fetchInitialData();
                } else {
                    this.loginError = data.error || 'Login Gagal';
                }
            } catch (e) {
                this.loginError = 'Koneksi Server Bermasalah';
            } finally {
                this.isLoading = false;
            }
        },

        logout() {
            this.token = '';
            localStorage.removeItem('jwt_token');
            this.isLoggedIn = false;
            this.currentView = 'dashboard';
        },

        // --- DATA FETCHING CORE ---
        async fetchWithAuth(endpoint) {
            try {
                const res = await fetch(`${API_URL}${endpoint}`, {
                    headers: { 
                        'Authorization': `Bearer ${this.token}`,
                        'ngrok-skip-browser-warning': 'true'
                    }
                });
                if (res.status === 401) { this.logout(); return null; }
                return await res.json();
            } catch (e) {
                console.error(e); return null;
            }
        },

        async fetchInitialData() {
            this.isLoading = true;
            await Promise.all([
                this.fetchSummary(),
                this.fetchChart(),
                this.fetchCategories()
            ]);
            this.isLoading = false;
        },

        async fetchSummary() {
            const data = await this.fetchWithAuth('/api/summary');
            if (data) this.summary = data;
        },

        // Mengambil transaksi berdasarkan filter bulan & tahun di Frontend
        async fetchTransactionsByMonth() {
            this.isLoading = true;
            // Kita ambil range tanggal awal dan akhir bulan yang dipilih
            const [year, month] = this.filterDate.split('-');
            const startDate = `${year}-${month}-01`;
            const endDate = new Date(year, month, 0).toISOString().split('T')[0]; // Tanggal terakhir bulan itu

            // Request ke backend pakai filter date
            const data = await this.fetchWithAuth(`/api/transactions?from=${startDate}&to=${endDate}`);
            
            if (data && data.data) {
                // Sort dari yang terbaru
                this.rawTransactions = data.data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            } else {
                this.rawTransactions = [];
            }
            this.isLoading = false;
        },

        // --- LOGIC PAGINATION (CLIENT SIDE) ---
        get paginatedTransactions() {
            // 1. Filter by Type (Income/Expense/All)
            let filtered = this.rawTransactions;
            if (this.activeTransactionType !== 'all') {
                filtered = this.rawTransactions.filter(t => t.type === this.activeTransactionType);
            }

            // 2. Pagination Logic
            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage;
            return filtered.slice(start, end);
        },

        get totalPages() {
            let filtered = this.rawTransactions;
            if (this.activeTransactionType !== 'all') {
                filtered = this.rawTransactions.filter(t => t.type === this.activeTransactionType);
            }
            return Math.ceil(filtered.length / this.itemsPerPage) || 1;
        },

        // --- LOGIC LAPORAN (REPORT ENGINE) ---
        reportMetrics: {
            totalMonth: 0,
            highestDayDate: '-',
            highestDayAmount: 0,
            dailyAverage: 0,
            categoryRanking: []
        },

        async generateReport() {
            // Pastikan data bulan ini sudah diambil
            await this.fetchTransactionsByMonth(); 
            
            const txs = this.rawTransactions.filter(t => t.type === 'expense'); // Fokus laporan pengeluaran dulu
            
            if (txs.length === 0) {
                this.reportMetrics = { totalMonth: 0, highestDayDate: '-', highestDayAmount: 0, dailyAverage: 0, categoryRanking: [] };
                return;
            }

            // 1. Total Pengeluaran Bulan Ini
            const total = txs.reduce((sum, t) => sum + t.amount, 0);

            // 2. Cari Hari Paling Boros
            const dailyGroups = {};
            txs.forEach(t => {
                const date = t.created_at.split('T')[0];
                dailyGroups[date] = (dailyGroups[date] || 0) + t.amount;
            });
            
            let maxDate = '-';
            let maxAmount = 0;
            Object.entries(dailyGroups).forEach(([date, amount]) => {
                if (amount > maxAmount) {
                    maxAmount = amount;
                    maxDate = date;
                }
            });

            // 3. Kategori Terbesar
            const catGroups = {};
            txs.forEach(t => {
                catGroups[t.category] = (catGroups[t.category] || 0) + t.amount;
            });
            const sortedCats = Object.entries(catGroups)
                .sort(([,a], [,b]) => b - a)
                .map(([name, amount]) => ({ name, amount, percentage: ((amount/total)*100).toFixed(1) }));

            this.reportMetrics = {
                totalMonth: total,
                highestDayDate: this.formatDate(maxDate),
                highestDayAmount: maxAmount,
                dailyAverage: total / new Date().getDate(), // Dibagi tanggal hari ini (rata-rata berjalan)
                categoryRanking: sortedCats
            };
        },

        // --- CHARTING ---
        fetchChart() {
            this.fetchWithAuth('/api/chart/daily').then(res => {
                if(res && res.data) this.renderChart(res.data);
            });
        },
        
        renderChart(data) {
            const ctx = document.getElementById('mainChart');
            if(!ctx) return;
            
            // Sort data by date
            data.sort((a,b) => new Date(a.date) - new Date(b.date));
            
            if(this.chartInstance) this.chartInstance.destroy();
            
            this.chartInstance = new Chart(ctx, {
                type: 'bar', // Ganti jadi Bar chart biar lebih tegas
                data: {
                    labels: data.map(d => new Date(d.date).getDate()), // Tampilkan tanggal saja (1, 2, 3)
                    datasets: [
                        { label: 'Masuk', data: data.map(d=>d.income), backgroundColor: '#10b981', borderRadius: 4 },
                        { label: 'Keluar', data: data.map(d=>d.expense), backgroundColor: '#f43f5e', borderRadius: 4 }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { 
                        x: { grid: { display: false } },
                        y: { beginAtZero: true, grid: { color: '#334155' } }
                    }
                }
            });
        },
        
        // --- HELPERS ---
        formatRupiah(n) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n || 0); },
        formatDate(s) { if(!s || s==='-') return '-'; return new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); }
    };
}