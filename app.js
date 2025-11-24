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
            }
        },

        // AUTH
        async login() {
            this.loginError = '';
            this.isLoggingIn = true;
            try {
                const res = await fetch(`${API_URL}/login`, {
                    method: 'POST',
                    headers: { 
                'Content-Type': 'application/json',
                'ngrok-skip-browser-warning': 'true' // <--- TAMBAHAN PENTING 1
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
        },

        // GENERIC FETCH
        async fetchWithAuth(endpoint) {
            try {
                const res = await fetch(`${API_URL}${endpoint}`, {
                    headers: { 
            'Authorization': `Bearer ${this.token}`,
            'ngrok-skip-browser-warning': 'true' // <--- TAMBAHAN PENTING 2
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
            if (res && res.data) {
                this.transactions = res.data;
            } else {
                this.transactions = [];
            }
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
                this.renderChart(res.data);
            }
        },

        // FILTER HANDLER
        async setFilter(type) {
            this.filterType = type;
            await this.fetchTransactions();
        },

        // HELPERS
        formatRupiah(angka) {
            return new Intl.NumberFormat('id-ID', {
                style: 'currency',
                currency: 'IDR',
                maximumFractionDigits: 0
            }).format(angka || 0);
        },

        formatDate(dateString) {
            const options = {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            };
            return new Date(dateString).toLocaleDateString('id-ID', options);
        },

        // CHART
        renderChart(data) {
            const ctx = document.getElementById('dailyChart').getContext('2d');

            const labels = data.map(d => {
                const dt = new Date(d.date);
                return dt.toLocaleDateString('id-ID', {
                    day: '2-digit',
                    month: 'short'
                });
            });

            const incomeData = data.map(d => d.income);
            const expenseData = data.map(d => d.expense);

            if (this.chartInstance) {
                this.chartInstance.destroy();
            }

            this.chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Pemasukan',
                            data: incomeData,
                            borderColor: '#22c55e',
                            backgroundColor: 'rgba(34, 197, 94, 0.12)',
                            tension: 0.35,
                            fill: true,
                            pointRadius: 2
                        },
                        {
                            label: 'Pengeluaran',
                            data: expenseData,
                            borderColor: '#f97373',
                            backgroundColor: 'rgba(248, 113, 113, 0.12)',
                            tension: 0.35,
                            fill: true,
                            pointRadius: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            labels: {
                                color: '#cbd5f5',
                                font: { size: 10 }
                            }
                        }
                    },
                    scales: {
                        x: {
                            ticks: {
                                color: '#94a3b8',
                                maxRotation: 0,
                                font: { size: 10 }
                            },
                            grid: { display: false }
                        },
                        y: {
                            ticks: {
                                color: '#94a3b8',
                                font: { size: 10 }
                            },
                            grid: {
                                color: 'rgba(148, 163, 184, 0.2)'
                            },
                            beginAtZero: true
                        }
                    }
                }
            });
        }
    }
}