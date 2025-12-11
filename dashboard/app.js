// CONFIG: Ganti sesuai URL Ngrok kamu jika perlu
const API_URL = CONFIG.API_URL;

function mainDashboard() {
    return {
        isLoggedIn: false,
        token: localStorage.getItem('jwt_token') || '',
        username: localStorage.getItem('username') || 'User',
        loginForm: { username: '', password: '' },
        loginError: '',
        summary: { total_income: 0, total_expense: 0, balance: 0 },
        chartInstance: null,
        pollingInterval: null, 
        lastChartDataJson: null, 

        // --- TAMBAHAN: State untuk Countdown & Status ---
        userStatus: '',       // 'active' atau 'trial'
        trialEndsAt: null,    // Tanggal expired
        trialCountdown: '',   // String hitung mundur
        countdownInterval: null,

        init() {
            // 1. Cek Token dulu
            if (!this.token) {
                window.location.href = 'user-login.html';
                return;
            }

            // 2. Cek Status User & Load Data untuk Countdown
           const userStr = localStorage.getItem('user');
    if (userStr) {
        try {
            const user = JSON.parse(userStr);
            
            // --- LOGIC BARU ---
            // 1. Jika Suspended -> ke suspended.html (Kecuali kita memang sedang di page itu)
            if (user.status === 'suspended' && !window.location.href.includes('suspended.html')) {
                window.location.href = 'suspended.html';
                return;
            }

            // 2. Jika Pending -> ke waiting.html (Kecuali kita sedang di page itu)
            if (user.status === 'pending' && !window.location.href.includes('waiting.html')) {
                window.location.href = 'waiting.html';
                return;
            }
            // ------------------

            this.userStatus = user.status;
            this.trialEndsAt = user.user_trial_ends_at; // sesuaikan key json

        } catch (e) {
            console.error("Gagal parse user", e);
        }
    }

            // 3. Jika aman, lanjut load data dashboard
            this.isLoggedIn = true;
            this.username = localStorage.getItem('username') || 'User'; 
            
            this.startRealtimeUpdates(); 
            this.startTrialCountdown(); // <-- Jalankan hitung mundur
        },

        // --- LOGIC COUNTDOWN TRIAL ---
        startTrialCountdown() {
            // Jika akun active, tidak perlu hitung mundur
            if (this.userStatus === 'active') return;

            this.updateCountdown(); // Jalankan segera sekali
            this.countdownInterval = setInterval(() => {
                this.updateCountdown();
            }, 1000);
        },

        updateCountdown() {
            if (!this.trialEndsAt) return;
            
            const now = new Date().getTime();
            const end = new Date(this.trialEndsAt).getTime();
            const distance = end - now;

            if (distance < 0) {
                this.trialCountdown = "00:00:00";
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);

            // Format: 36 hari 23:01:01
            this.trialCountdown = `${days} hari ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        },

        // --- SISTEM REALTIME (POLLING) ---
        startRealtimeUpdates() {
            this.fetchAllData();
            this.pollingInterval = setInterval(() => {
                if (this.isLoggedIn) {
                    this.fetchSummary();
                    this.fetchChart();
                }
            }, 3000);
        },

        stopRealtimeUpdates() {
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
            }
            if (this.countdownInterval) {
                clearInterval(this.countdownInterval);
                this.countdownInterval = null;
            }
        },

        // --- AUTH ---
        async login() {
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
                    
                    this.username = data.username || (data.user && data.user.username) || 'User';
                    localStorage.setItem('username', this.username);

                    // Update user object di localstorage juga biar sinkron
                    if (data.user) {
                        localStorage.setItem('user', JSON.stringify(data.user));
                        this.userStatus = data.user.status;
                        this.trialEndsAt = data.user.trial_ends_at;
                    }

                    this.isLoggedIn = true;
                    this.startRealtimeUpdates();
                    this.startTrialCountdown();
                } else {
                    this.loginError = data.error || 'Login gagal';
                }
            } catch (e) { this.loginError = 'Koneksi error'; console.error(e); }
        },

        logout() {
            this.stopRealtimeUpdates();
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('username');
            localStorage.removeItem('user');
            this.token = '';
            this.username = '';
            this.isLoggedIn = false;
            window.location.href = 'user-login.html'; 
        },

        // --- FETCH DATA ---
        async fetchWithAuth(endpoint) {
            try {
                const res = await fetch(`${API_URL}${endpoint}`, {
                    headers: { 'Authorization': `Bearer ${this.token}`, 'ngrok-skip-browser-warning': 'true' }
                });
                if (res.status === 401) { this.logout(); return null; }
                return await res.json();
            } catch (e) { console.error('fetchWithAuth error', e); return null; }
        },

        async fetchAllData() {
            await Promise.all([this.fetchSummary(), this.fetchChart()]);
        },

        async fetchSummary() {
            const sum = await this.fetchWithAuth('/api/summary');
            if (sum) this.summary = sum;
        },

        async fetchChart() {
            const chartRes = await this.fetchWithAuth('/api/chart/daily');
            if (chartRes && chartRes.data) {
                const sorted = chartRes.data.sort((a, b) => new Date(a.date) - new Date(b.date));
                const currentDataJson = JSON.stringify(sorted);
                
                if (this.lastChartDataJson === currentDataJson) return; 

                this.lastChartDataJson = currentDataJson;
                this.updateChart(sorted);
            }
        },

        formatRupiah(num) {
            return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num || 0);
        },

        // --- CHART LOGIC ---
        updateChart(data) {
            const ctx = document.getElementById('mainChart');
            if (!ctx) return;

            const labels = data.map(d => new Date(d.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}));
            const incomeData = data.map(d => d.income || 0);
            const expenseData = data.map(d => d.expense || 0);

            if (this.chartInstance) {
                this.chartInstance.data.labels = labels;
                this.chartInstance.data.datasets[0].data = incomeData;
                this.chartInstance.data.datasets[1].data = expenseData;
                this.chartInstance.update('none'); 
            } else {
                this.chartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Pemasukan',
                                data: incomeData,
                                borderColor: '#10b981',
                                backgroundColor: (context) => {
                                    const ctx = context.chart.ctx;
                                    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                                    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.4)');
                                    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');
                                    return gradient;
                                },
                                fill: true,
                                tension: 0.4,
                                pointRadius: 0,
                                pointHoverRadius: 6,
                                borderWidth: 2
                            },
                            {
                                label: 'Pengeluaran',
                                data: expenseData,
                                borderColor: '#f43f5e',
                                backgroundColor: 'transparent',
                                borderDash: [4, 4],
                                tension: 0.4,
                                pointRadius: 0,
                                pointHoverRadius: 6,
                                borderWidth: 2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: false,
                        interaction: { mode: 'index', intersect: false },
                        plugins: { 
                            legend: { display: false },
                            tooltip: {
                                enabled: true,
                                backgroundColor: 'rgba(15, 23, 42, 0.9)',
                                titleColor: '#f8fafc',
                                bodyColor: '#e2e8f0',
                                borderColor: '#334155',
                                borderWidth: 1,
                                padding: 10,
                                displayColors: true,
                                callbacks: {
                                    label: function(context) {
                                        let label = context.dataset.label || '';
                                        if (label) label += ': ';
                                        if (context.parsed.y !== null) {
                                            label += new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits:0 }).format(context.parsed.y);
                                        }
                                        return label;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: { grid: { display: false }, ticks: { color: '#64748b', font: {size: 10} } },
                            y: { 
                                grid: { color: '#1e293b' }, 
                                ticks: { 
                                    color: '#64748b', 
                                    font: {size: 10},
                                    callback: function(value) {
                                        if(value >= 1000000) return (value/1000000) + 'jt';
                                        if(value >= 1000) return (value/1000) + 'rb';
                                        return value;
                                    }
                                }, 
                                beginAtZero: true 
                            }
                        }
                    }
                });
            }
        }       
    }
}