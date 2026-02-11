# Correções a serem aplicadas no script.js

## 1. Adicionar suporte a JWT

No início do arquivo, após as configurações:

```javascript
// ✅ CORREÇÃO CRÍTICO-002: Suporte a JWT
let authToken = null;

// Função para obter token do sessionStorage
function getAuthToken() {
    const session = sessionStorage.getItem('mm_user');
    if (session) {
        const user = JSON.parse(session);
        return user.token;
    }
    return null;
}

// Função para fazer requisições autenticadas
async function fetchWithAuth(url, options = {}) {
    const token = getAuthToken();
    if (!token) {
        window.location.replace('login.html');
        return;
    }

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    try {
        const response = await fetch(`${API_URL}${url}`, {
            ...options,
            headers
        });

        if (response.status === 401 || response.status === 403) {
            alert('Sessão expirada. Faça login novamente.');
            sessionStorage.removeItem('mm_user');
            window.location.replace('login.html');
            return null;
        }

        return response;
    } catch (error) {
        console.error('Erro na requisição:', error);
        throw error;
    }
}
```

## 2. Atualizar loadDataFromAPI para usar autenticação

```javascript
async function loadDataFromAPI() {
    try {
        const response = await fetchWithAuth('/api/movimentacoes');
        if (!response) return;
        
        const data = await response.json();

        if(Array.isArray(data)) {
            appData.transactions = data.map(item => ({
                id: item.id,
                desc: item.descricao || "Sem Descrição",
                productType: item.produto, 
                qty: Number(item.quantidade || 0),
                value: Number(item.valor || 0),
                date: item.data,
                type: item.tipo
            }));

            if (currentSectionId === 'dashboard') updateDashboard();
            
            const loading = document.getElementById('loading-screen');
            if(loading) {
                loading.style.opacity = '0';
                setTimeout(() => {
                    loading.style.display = 'none';
                }, 500);
            }
        }
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}
```

## 3. Corrigir gráfico financeiro (ALTO-002)

Substituir a função renderCharts:

```javascript
function renderCharts(grouped) {
    const ctxFinance = document.getElementById('financeChart');
    if (ctxFinance) {
        if (financeChart) financeChart.destroy();
        
        // ✅ CORREÇÃO ALTO-002: Calcular dados reais por mês
        const monthlyData = calculateMonthlyRevenue();
        
        financeChart = new Chart(ctxFinance, {
            type: 'line',
            data: {
                labels: monthlyData.labels,
                datasets: [{
                    label: 'Receita',
                    data: monthlyData.values,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true },
                    tooltip: {
                        callbacks: {
                            label: (context) => `R$ ${context.parsed.y.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`
                        }
                    }
                }
            }
        });
    }

    const ctxStock = document.getElementById('stockChart');
    if (ctxStock) {
        if (stockChart) stockChart.destroy();
        const labels = Object.keys(grouped);
        const data = labels.map(l => grouped[l].netQty);
        
        // ✅ CORREÇÃO ALTO-001: Verificar se há dados antes de renderizar
        if (labels.length === 0 || data.every(v => v === 0)) {
            ctxStock.parentElement.innerHTML = '<p style="text-align:center; padding:40px; color:#64748b;">Nenhum dado de estoque disponível</p>';
            return;
        }
        
        stockChart = new Chart(ctxStock, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: ['#E89C31', '#7c3aed', '#94a3b8', '#ef4444', '#3b82f6']
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }
}

// Nova função para calcular receita mensal
function calculateMonthlyRevenue() {
    const monthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const currentMonth = new Date().getMonth();
    const monthlyRevenue = new Array(6).fill(0);
    const labels = [];

    // Últimos 6 meses
    for (let i = 5; i >= 0; i--) {
        const monthIndex = (currentMonth - i + 12) % 12;
        labels.push(monthNames[monthIndex]);
    }

    // Calcular receita por mês
    appData.transactions.filter(t => t.type === 'saida').forEach(t => {
        const transactionDate = new Date(t.date);
        const transactionMonth = transactionDate.getMonth();
        const monthDiff = (currentMonth - transactionMonth + 12) % 12;
        
        if (monthDiff < 6) {
            monthlyRevenue[5 - monthDiff] += t.value;
        }
    });

    return { labels, values: monthlyRevenue };
}
```

## 4. Atualizar todas as requisições para usar fetchWithAuth

Substituir todas as chamadas `fetch(\`\${API_URL}/api/...` por `fetchWithAuth('/api/...`

Exemplos:
- `loadCadastros()` 
- `saveCadastro()`
- `saveEntry()`
- `saveExit()`
- `saveDespesa()`
- Etc.

## 5. Adicionar feedback visual em ações (ALTO-006)

Adicionar funções auxiliares:

```javascript
// ✅ CORREÇÃO ALTO-006: Feedback visual
function showLoading(buttonElement) {
    if (buttonElement) {
        buttonElement.disabled = true;
        buttonElement.dataset.originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
    }
}

function hideLoading(buttonElement) {
    if (buttonElement && buttonElement.dataset.originalText) {
        buttonElement.disabled = false;
        buttonElement.innerHTML = buttonElement.dataset.originalText;
    }
}

function showSuccess(message) {
    // Criar toast de sucesso
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function showError(message) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
```

## 6. Adicionar CSS para toasts

Adicionar no estilo_geral.css:

```css
/* ✅ Toasts de notificação */
.toast {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 16px 24px;
    border-radius: 12px;
    color: white;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    opacity: 0;
    transform: translateX(400px);
    transition: all 0.3s ease;
    z-index: 10000;
}

.toast.show {
    opacity: 1;
    transform: translateX(0);
}

.toast-success {
    background: linear-gradient(135deg, #10b981, #059669);
}

.toast-error {
    background: linear-gradient(135deg, #ef4444, #dc2626);
}

.toast i {
    font-size: 1.2rem;
}
```

---

**Nota:** Estas correções devem ser aplicadas manualmente no arquivo script.js original, ou o arquivo pode ser reescrito completamente.
