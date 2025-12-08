const API_URL = "https://unbusily-unmoralistic-micki.ngrok-free.dev";

function mainDashboard() {
    return {
        isLoggedIn: false,
        token: localStorage.getItem('jwt_token') || '',
        username: localStorage.getItem('username') || 'User', // <-- TAMBAHAN 1: State Username
        loginForm: { username: '', password: '' },
        loginError: '',
        summary: { total_income: 0, total_expense: 0, balance: 0 },
        chartInstance: null,
        pollingInterval: null, // Variable untuk menyimpan interval

        init() {
            if (this.token) {
                this.isLoggedIn = true;
                this.username = localStorage.getItem('username') || 'User'; // <-- TAMBAHAN 2: Baca saat init
                this.startRealtimeUpdates(); // Mulai mesin update otomatis
            }
        },

        // --- SISTEM REALTIME (POLLING) ---
        startRealtimeUpdates() {
            // 1. Ambil data pertama kali langsung
            this.fetchAllData();

            // 2. Pasang timer setiap 3 detik (3000ms)
            // Menggunakan arrow function agar 'this' tetap mengacu ke Alpine component
            this.pollingInterval = setInterval(() => {
                if (this.isLoggedIn) {
                    // Fetch silent (tanpa loading spinner yang mengganggu)
                    this.fetchSummary();
                    this.fetchChart();
                }
            }, 3000);
        },

        stopRealtimeUpdates() {
            if (this.pollingInterval) clearInterval(this.pollingInterval);
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
                    
                    // <-- TAMBAHAN 3: Simpan Username dari Respon Login
                    this.username = data.username;
                    localStorage.setItem('username', data.username);

                    this.isLoggedIn = true;
                    this.startRealtimeUpdates(); // Mulai update saat login sukses
                } else {
                    this.loginError = data.error || 'Login gagal';
                }
            } catch (e) { this.loginError = 'Koneksi error'; }
        },

        logout() {
            this.stopRealtimeUpdates(); // Matikan update saat logout
            localStorage.removeItem('jwt_token');
            localStorage.removeItem('username'); // <-- TAMBAHAN 4: Hapus Username
            this.username = '';
            window.location.reload();
        },

        // --- FETCH DATA ---
        async fetchWithAuth(endpoint) {
            try {
                const res = await fetch(`${API_URL}${endpoint}`, {
                    headers: { 'Authorization': `Bearer ${this.token}`, 'ngrok-skip-browser-warning': 'true' }
                });
                if (res.status === 401) { this.logout(); return null; }
                return await res.json();
            } catch (e) { return null; }
        },

        async fetchAllData() {
            await Promise.all([this.fetchSummary(), this.fetchChart()]);
        },

        async fetchSummary() {
            const sum = await this.fetchWithAuth('/api/summary');
            // Alpine.js akan otomatis update angka di HTML jika nilai variable berubah
            if (sum) this.summary = sum;
        },

      

        // --- HELPERS ---
        formatRupiah(num) {
            return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(num || 0);
        },

async fetchChart() {
                    const chartRes = await this.fetchWithAuth('/api/chart/daily');
                    if (chartRes && chartRes.data) {
                        // 1. Urutkan data berdasarkan tanggal
                        const sorted = chartRes.data.sort((a, b) => new Date(a.date) - new Date(b.date));
                        
                        // 2. CEK PERUBAHAN DATA (LOGIKA BARU)
                        // Kita ubah data jadi string JSON untuk dibandingkan
                        const currentDataJson = JSON.stringify(sorted);
                        
                        // Jika data persis sama dengan yang terakhir, BERHENTI DI SINI.
                        // Jangan ganggu chart yang sedang dilihat user.
                        if (this.lastChartDataJson === currentDataJson) {
                            return; 
                        }

                        // Jika beda, simpan data baru dan update chart
                        this.lastChartDataJson = currentDataJson;
                        this.updateChart(sorted);
                    }
                },


                

                // --- CHART LOGIC (OPTIMIZED) ---
                updateChart(data) {
                    const ctx = document.getElementById('mainChart');
                    if (!ctx) return;

                    const labels = data.map(d => new Date(d.date).toLocaleDateString('id-ID', {day: 'numeric', month: 'short'}));
                    const incomeData = data.map(d => d.income);
                    const expenseData = data.map(d => d.expense);

                    // Update Existing Chart
                    if (this.chartInstance) {
                        this.chartInstance.data.labels = labels;
                        this.chartInstance.data.datasets[0].data = incomeData;
                        this.chartInstance.data.datasets[1].data = expenseData;
                        
                        // Update tanpa animasi agar mulus
                        this.chartInstance.update('none'); 
                    } else {
                        // Create New Chart
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
                                        enabled: true, // Pastikan tooltip nyala
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