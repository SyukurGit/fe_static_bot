const API_URL = "https://unbusily-unmoralistic-micki.ngrok-free.dev";

function dashboardApp() {
    return {
        // Auth state
        isLoggedIn: false,
        isLoggingIn: false,
        token: localStorage.getItem('jwt_token') || '',
        loginForm: { username: '', password: '' },
        loginError: '',

        // Data state
        summary: { total_income: 0, total_expense: 0, balance: 0 },
        transactions: [],
        categories: [],
        filterType: '',
        chartInstance: null,

        init() {
            if (this.token) {
                this.isLoggedIn = true;
                this.fetchAllData();

                // --- AUTO REFRESH (POLLING) ---
                setInterval(() => {
                    if (this.isLoggedIn) {
                        // Refresh data tanpa mengganggu user
                        this.fetchSummary();
                        this.fetchTransactions();
                        this.fetchCategories();
                        this.fetchChart();
                    }
                }, 5000); 
            }
        },

        // --- AUTH ---
        async login() {
            this.loginError = '';
            this.isLoggingIn = true;
            try {
                const res = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'ngrok-skip-browser-warning': 'true'
                    },
                    body: JSON.stringify(this.loginForm)
                });
                const data = await res.json();

                if (res.ok) {
                    this.token = data.token;
                    localStorage.setItem('jwt_token', data.token);
                    this.isLoggedIn = true;
                    this.loginError = '';
                    this.fetchAllData();
                } else {
                    this.loginError = data.error || 'Login gagal';
                }
            } catch (e) {
                this.loginError = 'Tidak bisa konek ke server';
            } finally {
                this.isLoggingIn = false;
            }
        },

        logout() {
            this.token = '';
            localStorage.removeItem('jwt_token');
            this.isLoggedIn = false;
            this.loginForm = { username: '', password: '' };
            this.transactions = [];
            this.categories = [];
            this.summary = { total_income: 0, total_expense: 0, balance: 0 };
            
            // Hapus chart saat logout
            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }
        },

        // --- GENERIC FETCH ---
        async fetchWithAuth(endpoint) {
            try {
                const res = await fetch(`${API_URL}${endpoint}`, {
                    headers: { 
                        'Authorization': `Bearer ${this.token}`,
                        'ngrok-skip-browser-warning': 'true'
                    }
                });

                if (res.status === 401) {
                    this.logout();
                    return null;
                }
                return await res.json();
            } catch (e) {
                console.error('Fetch error:', e);
                return null;
            }
        },

        async fetchAllData() {
            await Promise.all([
                this.fetchSummary(),
                this.fetchTransactions(),
                this.fetchCategories(),
                this.fetchChart()
            ]);
        },

        async fetchSummary() {
            const data = await this.fetchWithAuth('/api/summary');
            if (data) this.summary = data;
        },

        async fetchTransactions() {
            let url = '/api/transactions';
            if (this.filterType) url += `?type=${this.filterType}`;
            const res = await this.fetchWithAuth(url);
            this.transactions = (res && res.data) ? res.data : [];
        },

        async fetchCategories() {
            const res = await this.fetchWithAuth('/api/categories');
            if (res && res.data) {
                const totalAll = res.data.reduce((sum, c) => sum + (c.total || 0), 0) || 1;
                this.categories = res.data
                    .map(c => ({
                        ...c,
                        share: (c.total / totalAll) * 100
                    }))
                    .sort((a, b) => b.total - a.total);
            } else {
                this.categories = [];
            }
        },

        async fetchChart() {
            const res = await this.fetchWithAuth('/api/chart/daily');
            if (res && res.data) {
                // PERBAIKAN 1: SORTING DATA
                // Kita harus urutkan data berdasarkan tanggal (Ascending)
                // Supaya garis grafik tidak zigzag (maju mundur)
                const sortedData = res.data.sort((a, b) => new Date(a.date) - new Date(b.date));
                
                this.renderChart(sortedData);
            }
        },

        

        // --- FILTER HANDLER ---
        async setFilter(type) {
            this.filterType = type;
            await this.fetchTransactions();
        },

        // --- HELPERS ---
        formatRupiah(angka) {
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                maximumFractionDigits: 0
            }).format(angka || 0);
        },

        formatDate(dateString) {
            const options = {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            };
            return new Date(dateString).toLocaleDateString('id-ID', options);
        },

        // --- CHART LOGIC (DIPERBAIKI) ---
        renderChart(data) {
            const ctx = document.getElementById('dailyChart');
            
            // Safety check: Jika elemen canvas tidak ada (misal user pindah halaman), stop.
            if (!ctx) return; 

            // Siapkan Data
            const labels = data.map(d => {
                const dt = new Date(d.date);
                return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            });
            const incomeData = data.map(d => d.income);
            const expenseData = data.map(d => d.expense);

            // PERBAIKAN 2: HANDLING INSTANCE YANG LEBIH KUAT
            // Cek apakah chartInstance ada DAN canvas-nya masih terhubung ke DOM
            if (this.chartInstance && document.body.contains(this.chartInstance.canvas)) {
                // Update Data
                this.chartInstance.data.labels = labels;
                this.chartInstance.data.datasets[0].data = incomeData;
                this.chartInstance.data.datasets[1].data = expenseData;
                
                // Update tampilan tanpa animasi supaya tidak 'kedip'
                this.chartInstance.update('none'); 
            } else {
                // Jika instance ada tapi canvasnya error/ilang, hancurkan dulu
                if (this.chartInstance) {
                    this.chartInstance.destroy();
                }

                // Buat Baru
                this.chartInstance = new Chart(ctx.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Pemasukan',
                                data: incomeData,
                                borderColor: '#10b981', // emerald-500
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                borderWidth: 2,
                                tension: 0.4, // Lebih smooth (kurva)
                                fill: true,
                                pointRadius: 3,
                                pointHoverRadius: 5
                            },
                            {
                                label: 'Pengeluaran',
                                data: expenseData,
                                borderColor: '#f43f5e', // rose-500
                                backgroundColor: 'rgba(244, 63, 94, 0.1)',
                                borderWidth: 2,
                                tension: 0.4,
                                fill: true,
                                pointRadius: 3,
                                pointHoverRadius: 5
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: false, // Matikan animasi saat inisialisasi awal agar cepat
                        interaction: {
                            intersect: false,
                            mode: 'index',
                        },
                        plugins: {
                            legend: {
                                labels: { color: '#94a3b8', font: { size: 11, family: 'sans-serif' } }
                            },
                            tooltip: {
                                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                titleColor: '#f8fafc',
                                bodyColor: '#e2e8f0',
                                borderColor: '#334155',
                                borderWidth: 1,
                                padding: 10,
                                displayColors: true
                            }
                        },
                        scales: {
                            x: {
                                ticks: { color: '#64748b', font: { size: 10 } },
                                grid: { display: false }
                            },
                            y: {
                                ticks: { 
                                    color: '#64748b', 
                                    font: { size: 10 },
                                    callback: function(value) {
                                        // Format sumbu Y jadi "5jt", "100rb" agar rapi
                                        if(value >= 1000000) return (value/1000000) + 'jt';
                                        if(value >= 1000) return (value/1000) + 'rb';
                                        return value;
                                    }
                                },
                                grid: { color: 'rgba(51, 65, 85, 0.3)', borderDash: [4, 4] }, // Garis putus-putus halus
                                beginAtZero: true
                            }
                        }
                    }
                });
            }
        }
    }
}