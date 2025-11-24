const API_URL = "https://unbusily-unmoralistic-micki.ngrok-free.dev";

function dashboardApp() {
    return {
        // --- AUTH STATE ---
        isLoggedIn: false,
        isLoggingIn: false,
        token: localStorage.getItem('jwt_token') || '',
        loginForm: { username: '', password: '' },
        loginError: '',

        // --- DATA STATE ---
        summary: { total_income: 0, total_expense: 0, balance: 0 },
        transactions: [],
        categories: [],
        filterType: '',
        chartInstance: null,
        chartDataRaw: [],
        selectedChartDate: null,

        // --- POLLING STATE ---
        pollingId: null,

        // =========================
        // INIT
        // =========================
        init() {
            if (this.token) {
                this.isLoggedIn = true;
                this.fetchAllData();
                this.startPolling();
            }
        },

        startPolling() {
            if (this.pollingId) return; // jangan dobel interval

            this.pollingId = setInterval(() => {
                if (!this.isLoggedIn) return;

                // Refresh data rutin (read-only, tidak ganggu user)
                this.fetchSummary();
                this.fetchTransactions();
                this.fetchCategories();
                this.fetchChart();
            }, 5000);
        },

        stopPolling() {
            if (this.pollingId) {
                clearInterval(this.pollingId);
                this.pollingId = null;
            }
        },

        // =========================
        // AUTH
        // =========================
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

                let data = null;
                try {
                    data = await res.json();
                } catch (e) {
                    // Kalau respon bukan JSON, data tetap null
                }

                if (res.ok && data && data.token) {
                    this.token = data.token;
                    localStorage.setItem('jwt_token', data.token);
                    this.isLoggedIn = true;
                    this.loginError = '';

                    await this.fetchAllData();
                    this.startPolling();
                } else {
                    this.loginError = (data && data.error) || 'Login gagal';
                }
            } catch (e) {
                console.error('Login error:', e);
                this.loginError = 'Tidak bisa konek ke server';
            } finally {
                this.isLoggingIn = false;
            }
        },

        logout() {
            this.stopPolling();

            this.token = '';
            localStorage.removeItem('jwt_token');
            this.isLoggedIn = false;
            this.loginForm = { username: '', password: '' };
            this.transactions = [];
            this.categories = [];
            this.summary = { total_income: 0, total_expense: 0, balance: 0 };
            this.chartDataRaw = [];
            this.selectedChartDate = null;

            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }
        },

        // =========================
        // GENERIC AUTH FETCH
        // =========================
        async fetchWithAuth(endpoint) {
            if (!this.token) return null;

            try {
                const res = await fetch(`${API_URL}${endpoint}`, {
                    headers: { 
                        'Authorization': `Bearer ${this.token}`,
                        'ngrok-skip-browser-warning': 'true'
                    }
                });

                if (res.status === 401) {
                    // Token invalid/expired → paksa logout
                    this.logout();
                    return null;
                }

                // Kalau bukan 2xx tapi masih JSON, kita baca juga
                if (!res.ok) {
                    const text = await res.text();
                    console.error('HTTP error:', res.status, text);
                    try {
                        return JSON.parse(text);
                    } catch {
                        return null;
                    }
                }

                return await res.json();
            } catch (e) {
                console.error('Fetch error:', e);
                return null;
            }
        },

        // =========================
        // FETCH DATA UTAMA
        // =========================
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
            if (data && typeof data === 'object') {
                this.summary = {
                    total_income: data.total_income || 0,
                    total_expense: data.total_expense || 0,
                    balance: data.balance || 0
                };
            }
        },

        async fetchTransactions() {
            let url = '/api/transactions';
            if (this.filterType) url += `?type=${encodeURIComponent(this.filterType)}`;

            const res = await this.fetchWithAuth(url);
            this.transactions = (res && Array.isArray(res.data)) ? res.data : [];
        },

        async fetchCategories() {
            const res = await this.fetchWithAuth('/api/categories');

            if (res && Array.isArray(res.data)) {
                const totalAll = res.data.reduce((sum, c) => {
                    return sum + (Number(c.total) || 0);
                }, 0) || 1;

                this.categories = res.data
                    .map(c => {
                        const total = Number(c.total) || 0;
                        return {
                            ...c,
                            total,
                            share: (total / totalAll) * 100
                        };
                    })
                    .sort((a, b) => b.total - a.total);
            } else {
                this.categories = [];
            }
        },

        async fetchChart() {
            const res = await this.fetchWithAuth('/api/chart/daily');

            if (res && Array.isArray(res.data)) {
                // Sort by string date (asumsi format YYYY-MM-DD)
                const sortedData = [...res.data].sort((a, b) => {
                    if (!a.date || !b.date) return 0;
                    return String(a.date).localeCompare(String(b.date));
                });

                this.renderChart(sortedData);
            }
        },

        // =========================
        // FILTER
        // =========================
        async setFilter(type) {
            this.filterType = type;
            await this.fetchTransactions();
        },

        // =========================
        // HELPERS FORMAT
        // =========================
        formatRupiah(angka) {
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                maximumFractionDigits: 0
            }).format(Number(angka) || 0);
        },

        formatDate(dateString) {
            if (!dateString) return '-';
            const options = {
                year: 'numeric', month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            };
            const d = new Date(dateString);
            if (isNaN(d.getTime())) return dateString;
            return d.toLocaleDateString('id-ID', options);
        },

        // Format label tanggal untuk chart (hindari bug timezone)
        formatChartLabel(dateStr) {
            if (!dateStr) return '-';
            // Asumsi format backend: "YYYY-MM-DD"
            const parts = String(dateStr).split('-');
            if (parts.length !== 3) return dateStr;

            const year = Number(parts[0]);
            const month = Number(parts[1]) - 1; // 0-based
            const day = Number(parts[2]);

            const dt = new Date(year, month, day);
            if (isNaN(dt.getTime())) return dateStr;

            return dt.toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'short'
            });
        },

        // =========================
        // CHART LOGIC
        // =========================
        onChartPointClick(pointData) {
            // Simpan tanggal yang dipilih dari chart
            this.selectedChartDate = pointData.date || null;
            console.log('Chart point clicked:', pointData);

            // Di sini lu bisa kembangin:
            // - Misal fetch /api/transactions?date=...
            // - Atau filter transaksi lokal kalau datanya lengkap
        },

        renderChart(data) {
            const ctx = document.getElementById('dailyChart');
            if (!ctx) return;

            this.chartDataRaw = data || [];

            const labels = this.chartDataRaw.map(d => this.formatChartLabel(d.date));
            const incomeData = this.chartDataRaw.map(d => Number(d.income) || 0);
            const expenseData = this.chartDataRaw.map(d => Number(d.expense) || 0);

            // UPDATE EXISTING CHART
            if (this.chartInstance && document.body.contains(this.chartInstance.canvas)) {
                this.chartInstance.data.labels = labels;
                this.chartInstance.data.datasets[0].data = incomeData;
                this.chartInstance.data.datasets[1].data = expenseData;
                this.chartInstance.update('none');
                return;
            }

            // Kalau ada instance lama tapi canvas sudah nggak valid
            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }

            const self = this;

            // CREATE NEW CHART
            this.chartInstance = new Chart(ctx.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Pemasukan',
                            data: incomeData,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            borderWidth: 2,
                            tension: 0.4,
                            fill: true,
                            pointRadius: 3,
                            pointHoverRadius: 5
                        },
                        {
                            label: 'Pengeluaran',
                            data: expenseData,
                            borderColor: '#f43f5e',
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
                    animation: false,
                    interaction: {
                        intersect: false,
                        mode: 'index',
                    },
                    plugins: {
                        legend: {
                            labels: { 
                                color: '#94a3b8',
                                font: { size: 11, family: 'sans-serif' }
                            }
                        },
                        tooltip: {
                            backgroundColor: 'rgba(15, 23, 42, 0.9)',
                            titleColor: '#f8fafc',
                            bodyColor: '#e2e8f0',
                            borderColor: '#334155',
                            borderWidth: 1,
                            padding: 10,
                            displayColors: true,
                            callbacks: {
                                // Tooltip lebih informatif
                                label(context) {
                                    const value = context.raw || 0;
                                    const prefix = context.dataset.label === 'Pemasukan' ? '+ ' : '- ';
                                    const formatted = new Intl.NumberFormat('id-ID', {
                                        style: 'currency',
                                        currency: 'IDR',
                                        maximumFractionDigits: 0
                                    }).format(Math.abs(value));
                                    return `${prefix}${formatted}`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: { 
                                color: '#64748b',
                                font: { size: 10 }
                            },
                            grid: { display: false }
                        },
                        y: {
                            ticks: { 
                                color: '#64748b', 
                                font: { size: 10 },
                                callback: function(value) {
                                    if (value >= 1000000) return (value/1000000) + 'jt';
                                    if (value >= 1000) return (value/1000) + 'rb';
                                    if (value <= -1000000) return (value/1000000) + 'jt';
                                    if (value <= -1000) return (value/1000) + 'rb';
                                    return value;
                                }
                            },
                            grid: { 
                                color: 'rgba(51, 65, 85, 0.3)', 
                                borderDash: [4, 4]
                            },
                            beginAtZero: true
                        }
                    },
                    // CLICK HANDLER — BIAR "BISA DI KLIK"
                    onClick(evt, elements) {
                        if (!elements || !elements.length) return;
                        const first = elements[0];
                        const index = first.index;
                        const pointData = self.chartDataRaw[index];
                        if (!pointData) return;
                        self.onChartPointClick(pointData);
                    }
                }
            });
        }
    };
}

// PASTIKAN ALPINE BISA AKSES dashboardApp() SAAT JS DIPISAH
if (typeof window !== 'undefined') {
    window.dashboardApp = dashboardApp;
}
