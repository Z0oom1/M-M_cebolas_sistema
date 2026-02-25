// M&M Cebolas - Core Script (v2.0 - kg/cx, dashboard completo)

let appData = {
    transactions: [],
    products: [],
    clients: [],
    suppliers: [],
    users: [],
    configs: {}
};

let currentSectionId = 'dashboard';
let financeChart = null;
let stockChart = null;
let dashboardChartMode = 'financeiro';
let dashboardData = null;

const API_URL = (function () {
    const host = window.location.hostname;
    const isElectron = window.location.protocol === 'file:' ||
        (typeof process !== 'undefined' && process.versions && process.versions.electron);
    if (isElectron) return 'https://portalmmcebolas.com/api';
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api';
    return 'https://portalmmcebolas.com/api';
})();

/** Redirecionamento para login */
function getLoginUrl() {
    if (window.location.protocol === 'file:') return 'login.html';
    if (window.location.pathname.includes('/pages/')) return 'login.html';
    return '/pages/login.html';
}

window.onload = function () {
    checkLogin();
    checkEnvironment();
    loadDataFromAPI();
    setupSelectors();
    setTimeout(() => { playSystemSound('startup'); }, 1000);
};

function checkEnvironment() {
    const isElectron = window.location.protocol === 'file:' ||
        (typeof process !== 'undefined' && process.versions && process.versions.electron);
    const titlebar = document.getElementById('titlebar');
    const windowControls = document.querySelector('.window-controls');
    if (titlebar) titlebar.style.display = 'flex';
    if (isElectron) {
        if (windowControls) windowControls.style.display = 'flex';
        try {
            const { ipcRenderer } = require('electron');
            document.getElementById('closeBtn')?.addEventListener('click', () => ipcRenderer.send('close-app'));
            document.getElementById('minBtn')?.addEventListener('click', () => ipcRenderer.send('minimize-app'));
            document.getElementById('maxBtn')?.addEventListener('click', () => ipcRenderer.send('maximize-app'));
        } catch (e) { console.warn("Electron IPC não disponível:", e); }
    } else {
        if (windowControls) windowControls.style.display = 'none';
    }
}

function setupSelectors() { /* mantido para compatibilidade */ }

function playLoginSound() {
    const audio = new Audio('../sounds/mac-startup.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.log("Interação necessária para tocar áudio:", err));
}

function finalizarLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    const mainContent = document.getElementById('main-layout');
    if (loadingScreen) {
        loadingScreen.style.opacity = '0';
        loadingScreen.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            const audio = new Audio('../sounds/mac-startup.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log("Áudio aguardando interação"));
            if (mainContent) {
                mainContent.style.display = 'block';
                mainContent.classList.add('fade-in-system');
            }
        }, 500);
    }
}

async function loadDataFromAPI() {
    try {
        const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
        const userRole = userData.role || (userData.user ? userData.user.role : null);
        const isAdmin = userRole === 'admin';

        const promises = [
            fetchWithAuth('/movimentacoes').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/produtos').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/clientes').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/fornecedores').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/configs').then(r => r && r.ok ? r.json() : {})
        ];

        if (isAdmin) {
            promises.push(fetchWithAuth('/usuarios').then(r => r && r.ok ? r.json() : []));
        } else {
            promises.push(Promise.resolve([]));
        }

        const [trans, prods, clis, sups, configs, usrs] = await Promise.all(promises);
        appData = { transactions: trans, products: prods, clients: clis, suppliers: sups, users: usrs, configs: configs || {} };
        initSection(currentSectionId);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

function showSection(id) {
    currentSectionId = id;
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-item[onclick*="${id}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="apple-loader-modern"></div></div>';

    fetch(`sections/${id}.html`)
        .then(res => res.text())
        .then(html => {
            mainContent.innerHTML = html;
            initSection(id);
        })
        .catch(err => {
            mainContent.innerHTML = '<div class="panel" style="padding:24px;text-align:center;"><i class="fas fa-exclamation-triangle fa-3x" style="color:var(--danger);margin-bottom:16px;"></i><h3>Erro ao carregar seção</h3><p>Verifique sua conexão ou tente novamente.</p></div>';
        });
}

function initSection(id) {
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || (userData.user ? userData.user.role : null);
    const isAdmin = userRole === 'admin';

    if (id === 'dashboard') {
        loadDashboard();
    }
    if (id === 'entrada' || id === 'saida') {
        renderProductShowcase(id);
        // Inicializar modo de quantidade
        setTimeout(() => {
            const prefix = id === 'entrada' ? 'entry' : 'exit';
            toggleQuantityMode(prefix);
        }, 50);
    }
    if (id === 'cadastro') loadCadastros();
    if (id === 'financeiro') {
        updateFinanceKPIs();
        renderFinanceChart();
        renderFinanceTable();
    }
    if (id === 'estoque') {
        renderStockTable();
        renderEstoqueResumo();
    }
    if (id === 'nfe') loadNFeTable();
    if (id === 'config') {
        loadConfigData();
        if (isAdmin) {
            loadLogs();
        } else {
            ['#admin-users-panel', '#admin-logs-panel', '#admin-entities-panel', '#admin-products-panel', '#admin-danger-panel'].forEach(selector => {
                document.querySelectorAll(selector).forEach(el => el.style.display = 'none');
            });
        }
    }
}

// =============================================
// DASHBOARD COMPLETO
// =============================================

async function loadDashboard() {
    try {
        const res = await fetchWithAuth('/dashboard');
        if (res && res.ok) {
            dashboardData = await res.json();
        } else {
            // Fallback: calcular localmente
            dashboardData = calcularDashboardLocal();
        }
    } catch (e) {
        dashboardData = calcularDashboardLocal();
    }
    renderDashboard(dashboardData);
}

function calcularDashboardLocal() {
    const pesoPorCaixa = parseFloat(appData.configs.peso_por_caixa_padrao || 20);
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let totalCaixas = 0, totalKg = 0;
    let receitaMes = 0, despesasMes = 0, receitaTotal = 0, despesasTotal = 0;
    const stockByCaixas = {}, stockByKg = {};
    const monthlyData = {};

    for (let i = 5; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[key] = { receita: 0, despesa: 0, caixas_entrada: 0, caixas_saida: 0, kg_entrada: 0, kg_saida: 0 };
    }

    appData.transactions.forEach(t => {
        const tDate = new Date(t.data);
        const monthKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, '0')}`;
        const isCurrentMonth = tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear;

        let caixas = t.qtd_caixas || 0;
        let kg = t.peso_kg || 0;

        if (caixas === 0 && kg === 0) {
            if (t.unidade === 'KG') {
                kg = t.quantidade;
                caixas = t.quantidade / pesoPorCaixa;
            } else {
                caixas = t.quantidade;
                kg = t.quantidade * pesoPorCaixa;
            }
        }

        if (t.tipo === 'entrada') {
            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
            stockByCaixas[t.produto] += caixas;
            stockByKg[t.produto] += kg;
            totalCaixas += caixas;
            totalKg += kg;
            despesasTotal += t.valor;
            if (isCurrentMonth) despesasMes += t.valor;
            if (monthlyData[monthKey]) {
                monthlyData[monthKey].despesa += t.valor;
                monthlyData[monthKey].caixas_entrada += caixas;
                monthlyData[monthKey].kg_entrada += kg;
            }
        } else if (t.tipo === 'saida') {
            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
            stockByCaixas[t.produto] -= caixas;
            stockByKg[t.produto] -= kg;
            totalCaixas -= caixas;
            totalKg -= kg;
            receitaTotal += t.valor;
            if (isCurrentMonth) receitaMes += t.valor;
            if (monthlyData[monthKey]) {
                monthlyData[monthKey].receita += t.valor;
                monthlyData[monthKey].caixas_saida += caixas;
                monthlyData[monthKey].kg_saida += kg;
            }
        } else if (t.tipo === 'despesa') {
            despesasTotal += t.valor;
            if (isCurrentMonth) despesasMes += t.valor;
            if (monthlyData[monthKey]) monthlyData[monthKey].despesa += t.valor;
        }
    });

    const topProdutos = Object.entries(stockByCaixas)
        .map(([nome, caixas]) => ({ nome, caixas: Math.round(caixas * 10) / 10, kg: Math.round((stockByKg[nome] || 0) * 10) / 10 }))
        .filter(p => p.caixas > 0)
        .sort((a, b) => b.caixas - a.caixas)
        .slice(0, 5);

    return {
        estoque: {
            totalCaixas: Math.round(totalCaixas * 10) / 10,
            totalKg: Math.round(totalKg * 10) / 10,
            porProduto: topProdutos
        },
        financeiro: {
            receitaMes, despesasMes, lucroMes: receitaMes - despesasMes,
            receitaTotal, despesasTotal, lucroTotal: receitaTotal - despesasTotal
        },
        mensal: monthlyData,
        ultimasMovimentacoes: appData.transactions.slice(0, 10),
        pesoPorCaixa: parseFloat(appData.configs.peso_por_caixa_padrao || 20)
    };
}

function renderDashboard(data) {
    if (!data) return;

    // Data atual
    const dDate = document.getElementById('current-date');
    if (dDate) dDate.innerText = new Date().toLocaleDateString('pt-BR');

    // KPIs de estoque
    const dStockCx = document.getElementById('dash-stock-cx');
    const dStockKg = document.getElementById('dash-stock-kg');
    const dStockTipos = document.getElementById('dash-stock-tipos');
    const dPesoCx = document.getElementById('dash-peso-cx');

    if (dStockCx) dStockCx.innerText = `${data.estoque.totalCaixas.toLocaleString('pt-BR')} Cx`;
    if (dStockKg) dStockKg.innerText = `${data.estoque.totalKg.toLocaleString('pt-BR')} Kg`;
    if (dStockTipos) dStockTipos.innerText = data.estoque.porProduto.length;
    if (dPesoCx) dPesoCx.innerText = `${data.pesoPorCaixa} Kg`;

    // KPIs financeiros
    const dRev = document.getElementById('dash-revenue');
    const dExp = document.getElementById('dash-expenses');
    const dPro = document.getElementById('dash-profit');
    const dProTotal = document.getElementById('dash-profit-total');

    if (dRev) dRev.innerText = `R$ ${data.financeiro.receitaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (dExp) dExp.innerText = `R$ ${data.financeiro.despesasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (dPro) {
        const lucro = data.financeiro.lucroMes;
        dPro.innerText = `R$ ${lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        dPro.style.color = lucro >= 0 ? '#065f46' : '#991b1b';
    }
    if (dProTotal) {
        const lucroTotal = data.financeiro.lucroTotal;
        dProTotal.innerText = `R$ ${lucroTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
        dProTotal.style.color = lucroTotal >= 0 ? '#4338ca' : '#991b1b';
    }

    // Tabela de estoque por produto
    renderDashStockTable(data.estoque.porProduto);

    // Gráficos
    renderDashCharts(data);

    // Últimas movimentações
    renderRecentTransactions(data.ultimasMovimentacoes);
}

function renderDashStockTable(produtos) {
    const tbody = document.getElementById('dash-stock-table');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (!produtos || produtos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: var(--text-muted);">Nenhum produto em estoque</td></tr>';
        return;
    }

    produtos.forEach(p => {
        const tr = document.createElement('tr');
        let statusBadge = '';
        if (p.caixas > 50) statusBadge = '<span style="background:#dcfce7;color:#166534;padding:3px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">OK</span>';
        else if (p.caixas > 10) statusBadge = '<span style="background:#fef3c7;color:#92400e;padding:3px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">BAIXO</span>';
        else statusBadge = '<span style="background:#fee2e2;color:#991b1b;padding:3px 8px;border-radius:20px;font-size:0.75rem;font-weight:700;">CRÍTICO</span>';

        tr.innerHTML = `
            <td><strong>${p.nome}</strong></td>
            <td style="text-align:center; font-weight:700; color:#166534;">${p.caixas.toLocaleString('pt-BR')}</td>
            <td style="text-align:center; font-weight:700; color:#1e40af;">${p.kg.toLocaleString('pt-BR')}</td>
            <td style="text-align:center;">${statusBadge}</td>
        `;
        tbody.appendChild(tr);
    });
}

function switchChartMode(mode) {
    dashboardChartMode = mode;
    const btnFin = document.getElementById('btn-chart-fin');
    const btnEst = document.getElementById('btn-chart-est');
    if (btnFin && btnEst) {
        if (mode === 'financeiro') {
            btnFin.className = 'btn-primary';
            btnEst.className = 'btn-icon';
            btnFin.style.cssText = 'padding: 6px 12px; font-size: 0.75rem;';
            btnEst.style.cssText = 'padding: 6px 12px; font-size: 0.75rem;';
        } else {
            btnEst.className = 'btn-primary';
            btnFin.className = 'btn-icon';
            btnFin.style.cssText = 'padding: 6px 12px; font-size: 0.75rem;';
            btnEst.style.cssText = 'padding: 6px 12px; font-size: 0.75rem;';
        }
    }
    if (dashboardData) renderDashCharts(dashboardData);
}

function renderDashCharts(data) {
    const ctx = document.getElementById('financeChart');
    if (!ctx) return;
    if (financeChart) financeChart.destroy();

    const labels = Object.keys(data.mensal).map(k => {
        const [year, month] = k.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    });
    const values = Object.values(data.mensal);

    if (dashboardChartMode === 'financeiro') {
        financeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Receita (R$)',
                        data: values.map(v => v.receita),
                        backgroundColor: '#22c55e',
                        borderRadius: 6
                    },
                    {
                        label: 'Despesas (R$)',
                        data: values.map(v => v.despesa),
                        backgroundColor: '#ef4444',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    } else {
        financeChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Entrada (Cx)',
                        data: values.map(v => v.caixas_entrada),
                        backgroundColor: '#1A5632',
                        borderRadius: 6
                    },
                    {
                        label: 'Saída (Cx)',
                        data: values.map(v => v.caixas_saida),
                        backgroundColor: '#dc2626',
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }

    // Gráfico de pizza de estoque por produto
    const ctxStock = document.getElementById('stockChart');
    if (!ctxStock) return;
    if (stockChart) stockChart.destroy();

    if (data.estoque.porProduto.length === 0) {
        stockChart = new Chart(ctxStock, {
            type: 'doughnut',
            data: { labels: ['Sem estoque'], datasets: [{ data: [1], backgroundColor: ['#e2e8f0'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
        return;
    }

    const colors = ['#1A5632', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    stockChart = new Chart(ctxStock, {
        type: 'doughnut',
        data: {
            labels: data.estoque.porProduto.map(p => p.nome),
            datasets: [{
                data: data.estoque.porProduto.map(p => p.caixas),
                backgroundColor: colors.slice(0, data.estoque.porProduto.length),
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const p = data.estoque.porProduto[context.dataIndex];
                            return ` ${p.caixas} Cx / ${p.kg} Kg`;
                        }
                    }
                }
            }
        }
    });
}

function renderRecentTransactions(transactions) {
    const tbody = document.getElementById('recent-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const list = transactions || appData.transactions.slice(0, 10);
    const pesoPorCaixa = parseFloat(appData.configs.peso_por_caixa_padrao || 20);

    if (list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">Nenhuma movimentação registrada</td></tr>';
        return;
    }

    list.slice(0, 10).forEach(t => {
        let caixas = t.qtd_caixas || 0;
        let kg = t.peso_kg || 0;
        if (caixas === 0 && kg === 0) {
            if (t.unidade === 'KG') { kg = t.quantidade; caixas = Math.round(t.quantidade / pesoPorCaixa * 10) / 10; }
            else { caixas = t.quantidade; kg = t.quantidade * pesoPorCaixa; }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge ${t.tipo}">${t.tipo === 'entrada' ? 'COMPRA' : (t.tipo === 'saida' ? 'VENDA' : t.tipo.toUpperCase())}</span></td>
            <td>${t.produto}</td>
            <td>${t.descricao || '-'}</td>
            <td style="font-weight:700; color:#166534;">${caixas.toLocaleString('pt-BR')} Cx</td>
            <td style="font-weight:700; color:#1e40af;">${kg.toLocaleString('pt-BR')} Kg</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
        `;
        tbody.appendChild(tr);
    });
}

async function refreshDashboard() {
    await loadDataFromAPI();
}

// =============================================
// CÁLCULO DE ESTOQUE (compatibilidade)
// =============================================

function calculateStock() {
    const pesoPorCaixa = parseFloat(appData.configs.peso_por_caixa_padrao || 20);
    const stockMap = {};
    appData.transactions.forEach(t => {
        if (!stockMap[t.produto]) stockMap[t.produto] = 0;
        let caixas = t.qtd_caixas || 0;
        if (caixas === 0) {
            if (t.unidade === 'KG') caixas = t.quantidade / pesoPorCaixa;
            else caixas = t.quantidade;
        }
        if (t.tipo === 'entrada') stockMap[t.produto] += caixas;
        if (t.tipo === 'saida') stockMap[t.produto] -= caixas;
    });
    return stockMap;
}

function updateDashboardKPIs(stockMap) {
    // Mantido para compatibilidade — agora usa renderDashboard
    if (dashboardData) renderDashboard(dashboardData);
}

// =============================================
// ESTOQUE - TABELA E RESUMO
// =============================================

function renderEstoqueResumo() {
    const container = document.getElementById('estoque-resumo');
    if (!container) return;

    const pesoPorCaixa = parseFloat(appData.configs.peso_por_caixa_padrao || 20);
    const stockByCaixas = {}, stockByKg = {};
    let totalCaixas = 0, totalKg = 0;

    appData.transactions.forEach(t => {
        if (t.tipo !== 'entrada' && t.tipo !== 'saida') return;
        let caixas = t.qtd_caixas || 0;
        let kg = t.peso_kg || 0;
        if (caixas === 0 && kg === 0) {
            if (t.unidade === 'KG') { kg = t.quantidade; caixas = t.quantidade / pesoPorCaixa; }
            else { caixas = t.quantidade; kg = t.quantidade * pesoPorCaixa; }
        }
        if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
        if (t.tipo === 'entrada') { stockByCaixas[t.produto] += caixas; stockByKg[t.produto] += kg; totalCaixas += caixas; totalKg += kg; }
        else { stockByCaixas[t.produto] -= caixas; stockByKg[t.produto] -= kg; totalCaixas -= caixas; totalKg -= kg; }
    });

    container.innerHTML = `
        <div class="panel" style="padding: 16px; display: flex; align-items: center; gap: 12px; border-left: 4px solid #1A5632;">
            <div style="width: 40px; height: 40px; background: #dcfce7; color: #166534; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-boxes"></i>
            </div>
            <div>
                <p style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Total Caixas</p>
                <h4 style="font-size: 1.3rem; font-weight: 800; color: #166534;">${Math.round(totalCaixas * 10) / 10} Cx</h4>
            </div>
        </div>
        <div class="panel" style="padding: 16px; display: flex; align-items: center; gap: 12px; border-left: 4px solid #0369a1;">
            <div style="width: 40px; height: 40px; background: #dbeafe; color: #1e40af; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-weight-hanging"></i>
            </div>
            <div>
                <p style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">Total Kg</p>
                <h4 style="font-size: 1.3rem; font-weight: 800; color: #1e40af;">${Math.round(totalKg * 10) / 10} Kg</h4>
            </div>
        </div>
    `;

    // Adicionar cards por produto
    Object.entries(stockByCaixas).forEach(([nome, caixas]) => {
        if (caixas <= 0) return;
        const kg = Math.round((stockByKg[nome] || 0) * 10) / 10;
        const cx = Math.round(caixas * 10) / 10;
        const card = document.createElement('div');
        card.className = 'panel';
        card.style.cssText = 'padding: 16px; display: flex; align-items: center; gap: 12px; border-left: 4px solid #7c3aed;';
        card.innerHTML = `
            <div style="width: 40px; height: 40px; background: #ede9fe; color: #7c3aed; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <i class="fas fa-seedling"></i>
            </div>
            <div>
                <p style="font-size: 0.7rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 120px;">${nome}</p>
                <h4 style="font-size: 1rem; font-weight: 800; color: #7c3aed;">${cx} Cx / ${kg} Kg</h4>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderStockTable() {
    const tbody = document.getElementById('full-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    const pesoPorCaixa = parseFloat(appData.configs.peso_por_caixa_padrao || 20);

    if (appData.transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted);">Nenhum registro de movimentação encontrado</td></tr>';
        return;
    }

    appData.transactions.forEach(t => {
        let caixas = t.qtd_caixas || 0;
        let kg = t.peso_kg || 0;
        if (caixas === 0 && kg === 0) {
            if (t.unidade === 'KG') { kg = t.quantidade; caixas = Math.round(t.quantidade / pesoPorCaixa * 10) / 10; }
            else { caixas = t.quantidade; kg = Math.round(t.quantidade * pesoPorCaixa * 10) / 10; }
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo === 'entrada' ? 'COMPRA' : (t.tipo === 'saida' ? 'VENDA' : t.tipo.toUpperCase())}</span></td>
            <td>${t.produto}</td>
            <td>${t.descricao || '-'}</td>
            <td style="font-weight:700; color:#166534;">${(Math.round(caixas * 10) / 10).toLocaleString('pt-BR')} Cx</td>
            <td style="font-weight:700; color:#1e40af;">${(Math.round(kg * 10) / 10).toLocaleString('pt-BR')} Kg</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="text-align: right;"><button class="btn-icon text-danger" onclick="deleteMovimentacao(${t.id})"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================================
// VITRINE DE PRODUTOS
// =============================================

function renderProductShowcase(section) {
    const container = document.getElementById('product-showcase');
    if (!container) return;
    container.innerHTML = '';

    if (appData.products.length === 0) {
        container.innerHTML = '<div style="grid-column:span 4;text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-info-circle fa-2x"></i><p style="margin-top:10px;">Nenhum produto cadastrado no sistema.</p></div>';
        return;
    }

    const pesoPorCaixa = parseFloat(appData.configs.peso_por_caixa_padrao || 20);
    const stockMap = calculateStock();

    appData.products.forEach(p => {
        const qty = stockMap[p.nome] || 0;
        const kgEstoque = Math.round(qty * (p.peso_por_caixa || pesoPorCaixa) * 10) / 10;
        const card = document.createElement('div');
        card.className = `product-card ${qty <= 0 && section === 'saida' ? 'disabled' : ''}`;

        let iconHTML = '';
        if (p.icone === 'onion') {
            iconHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="currentColor"><path d="M12.74 2.458c0-1.333 1.658-1.981 2.553-.959l1.182 1.354L17.657 1.5c.895-1.023 2.553-.375 2.553.958v1.83c0 .738.44 1.405 1.136 1.712c4.464 1.892 7.604 6.325 7.604 11.488c0 6.076-4.349 11.146-10.11 12.25v.01c0 .69-.56 1.25-1.25 1.25h-2.16c-.69 0-1.25-.56-1.25-1.25v-.005C8.458 28.632 4 23.438 4 17.478c0-5.166 3.143-9.589 7.608-11.48a1.86 1.86 0 0 0 1.132-1.7v-1.84Zm2 1.449v.39a3.86 3.86 0 0 1-2.346 3.54l-.004.002c-.184.077-.364.16-.542.248c-1.96 2.085-3.118 5.341-3.118 8.84c0 5.31 2.645 9.753 6.153 10.805c-1.346-2.014-2.063-6.514-2.063-10.814c0-3.76.5-7.21 1.37-9.44l.75.29c-.82 2.11-1.31 5.53-1.31 9.15c0 3.03.33 5.88.94 8.02c.552 1.949 1.2 2.82 1.69 3.022c.147.003.295.003.441 0c.489-.203 1.137-1.074 1.689-3.022c.6-2.14.94-4.98.94-8.02c0-3.61-.49-7.03-1.31-9.15l.75-.29c.87 2.24 1.37 5.68 1.37 9.44c-.007 4.3-.72 8.801-2.064 10.814c3.508-1.05 6.154-5.494 6.154-10.804c0-3.495-1.155-6.746-3.109-8.832a10.358 10.358 0 0 0-.56-.257l-.012-.005a3.874 3.874 0 0 1-2.339-3.546v-.381l-.635.726a1.456 1.456 0 0 1-2.186.016l-.006-.007l-.643-.735ZM9.67 9.52A10.437 10.437 0 0 0 6 17.478c0 3.797 2.18 7.24 5.335 9.08c-.365-.372-.71-.786-1.035-1.24c-1.61-2.25-2.49-5.23-2.49-8.39c0-2.728.67-5.326 1.86-7.407Zm11.817 17.167a10.474 10.474 0 0 0 5.463-9.2c0-3.176-1.416-6.025-3.649-7.947c1.184 2.078 1.849 4.668 1.849 7.387c0 3.16-.88 6.14-2.49 8.39a10.42 10.42 0 0 1-1.173 1.37Z"/></svg>`;
        } else {
            iconHTML = `<i class="fas ${p.icone || 'fa-box'}"></i>`;
        }

        card.innerHTML = `
            <div class="product-icon-circle" style="background: ${p.cor}20; color: ${p.cor}">${iconHTML}</div>
            <div class="product-name">${p.nome}</div>
            <div class="product-stock" style="font-size: 0.75rem;">
                <span style="color:#166534; font-weight:700;">${Math.round(qty * 10) / 10} Cx</span>
                <span style="color:#94a3b8;"> / </span>
                <span style="color:#1e40af; font-weight:700;">${kgEstoque} Kg</span>
            </div>
        `;

        if (!(qty <= 0 && section === 'saida')) {
            card.onclick = (event) => selectProduct(p, section, event);
        }
        container.appendChild(card);
    });
}

function selectProduct(p, section, event) {
    const prefix = section === 'entrada' ? 'entry' : 'exit';
    const input = document.getElementById(`${prefix}-product`);
    if (input) input.value = p.nome;

    const priceInput = document.getElementById(`${prefix}-value`);
    if (priceInput && p.preco_venda) priceInput.value = p.preco_venda;

    // Armazenar peso por caixa do produto selecionado
    const pesoPorCaixaProduto = p.peso_por_caixa || parseFloat(appData.configs.peso_por_caixa_padrao || 20);
    const unitSelect = document.getElementById(`${prefix}-unit`);
    if (unitSelect) unitSelect.dataset.pesoCx = pesoPorCaixaProduto;

    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
    event.currentTarget.classList.add('active');

    // Atualizar cálculo de peso se já houver quantidade
    updatePesoCalc(prefix);
}

// =============================================
// MODO DE QUANTIDADE (CX / KG / AMBOS)
// =============================================

function getPesoPorCaixa(prefix) {
    const unitSelect = document.getElementById(`${prefix}-unit`);
    if (unitSelect && unitSelect.dataset.pesoCx) return parseFloat(unitSelect.dataset.pesoCx);
    return parseFloat(appData.configs.peso_por_caixa_padrao || 20);
}

function toggleQuantityMode(prefix) {
    const unitSelect = document.getElementById(`${prefix}-unit`);
    if (!unitSelect) return;
    const mode = unitSelect.value;

    const simpleDiv = document.getElementById(`${prefix}-qty-simple`);
    const ambosQty = document.getElementById(`${prefix}-qty-ambos`);
    const ambosPeso = document.getElementById(`${prefix}-peso-ambos`);
    const qtyLabel = document.getElementById(`${prefix}-qty-label`);
    const unitBadge = document.getElementById(`${prefix}-unit-badge`);
    const pesoCalc = document.getElementById(`${prefix}-peso-calc`);

    if (mode === 'AMBOS') {
        if (simpleDiv) simpleDiv.style.display = 'none';
        if (ambosQty) ambosQty.style.display = '';
        if (ambosPeso) ambosPeso.style.display = '';
    } else {
        if (simpleDiv) simpleDiv.style.display = '';
        if (ambosQty) ambosQty.style.display = 'none';
        if (ambosPeso) ambosPeso.style.display = 'none';

        if (mode === 'CX') {
            if (qtyLabel) qtyLabel.innerText = 'Quantidade (Caixas)';
            if (unitBadge) { unitBadge.innerText = 'CX'; unitBadge.style.background = '#dcfce7'; unitBadge.style.color = '#166534'; }
        } else if (mode === 'KG') {
            if (qtyLabel) qtyLabel.innerText = 'Quantidade (Kg)';
            if (unitBadge) { unitBadge.innerText = 'KG'; unitBadge.style.background = '#dbeafe'; unitBadge.style.color = '#1e40af'; }
        }
    }

    updatePesoCalc(prefix);
}

function updatePesoCalc(prefix) {
    const unitSelect = document.getElementById(`${prefix}-unit`);
    if (!unitSelect) return;
    const mode = unitSelect.value;
    const pesoCalcSpan = document.getElementById(`${prefix}-peso-calc`);
    const infoBox = document.getElementById(`${prefix}-info-box`);
    const infoText = document.getElementById(`${prefix}-info-text`);
    const pesoPorCaixa = getPesoPorCaixa(prefix);

    if (mode === 'CX') {
        const qty = parseFloat(document.getElementById(`${prefix}-qty`)?.value || 0);
        if (qty > 0 && pesoCalcSpan) {
            const kg = Math.round(qty * pesoPorCaixa * 10) / 10;
            pesoCalcSpan.innerText = `≈ ${kg} Kg`;
            if (infoBox) infoBox.style.display = '';
            if (infoText) infoText.innerText = `${qty} caixas × ${pesoPorCaixa} kg/cx = ${kg} kg estimados`;
        } else {
            if (pesoCalcSpan) pesoCalcSpan.innerText = '';
            if (infoBox) infoBox.style.display = 'none';
        }
    } else if (mode === 'KG') {
        const qty = parseFloat(document.getElementById(`${prefix}-qty`)?.value || 0);
        if (qty > 0 && pesoCalcSpan) {
            const cx = Math.round(qty / pesoPorCaixa * 10) / 10;
            pesoCalcSpan.innerText = `≈ ${cx} Cx`;
            if (infoBox) infoBox.style.display = '';
            if (infoText) infoText.innerText = `${qty} kg ÷ ${pesoPorCaixa} kg/cx = ${cx} caixas estimadas`;
        } else {
            if (pesoCalcSpan) pesoCalcSpan.innerText = '';
            if (infoBox) infoBox.style.display = 'none';
        }
    }
}

function calcPesoFromCaixas(prefix) {
    const caixasInput = document.getElementById(`${prefix}-qtd-caixas`);
    const pesoInput = document.getElementById(`${prefix}-peso-kg`);
    if (!caixasInput || !pesoInput) return;

    const caixas = parseFloat(caixasInput.value || 0);
    const pesoPorCaixa = getPesoPorCaixa(prefix);
    if (caixas > 0) {
        pesoInput.value = Math.round(caixas * pesoPorCaixa * 10) / 10;
    }
}

// =============================================
// SALVAR MOVIMENTAÇÕES
// =============================================

async function saveEntrada(event) { await saveMovimentacao('entrada', event); }
async function saveSaida(event) { await saveMovimentacao('saida', event); }

async function saveMovimentacao(type, event) {
    event.preventDefault();
    const prefix = type === 'entrada' ? 'entry' : 'exit';

    const unitSelect = document.getElementById(`${prefix}-unit`);
    const unidade = unitSelect ? unitSelect.value : 'CX';
    const pesoPorCaixa = getPesoPorCaixa(prefix);

    let quantidade = 0, peso_kg = 0, qtd_caixas = 0;

    if (unidade === 'AMBOS') {
        qtd_caixas = parseFloat(document.getElementById(`${prefix}-qtd-caixas`)?.value || 0);
        peso_kg = parseFloat(document.getElementById(`${prefix}-peso-kg`)?.value || 0);
        quantidade = qtd_caixas;
    } else if (unidade === 'CX') {
        quantidade = parseFloat(document.getElementById(`${prefix}-qty`)?.value || 0);
        qtd_caixas = quantidade;
        peso_kg = Math.round(quantidade * pesoPorCaixa * 10) / 10;
    } else if (unidade === 'KG') {
        quantidade = parseFloat(document.getElementById(`${prefix}-qty`)?.value || 0);
        peso_kg = quantidade;
        qtd_caixas = Math.round(quantidade / pesoPorCaixa * 10) / 10;
    }

    if (quantidade <= 0 && unidade !== 'AMBOS') {
        showError("Informe uma quantidade válida.");
        return;
    }
    if (unidade === 'AMBOS' && qtd_caixas <= 0) {
        showError("Informe a quantidade de caixas.");
        return;
    }

    const produto = document.getElementById(`${prefix}-product`)?.value;
    if (!produto) {
        showError("Selecione um produto na vitrine.");
        return;
    }

    const data = {
        tipo: type,
        produto,
        quantidade,
        unidade,
        peso_kg,
        qtd_caixas,
        valor: parseFloat(document.getElementById(`${prefix}-value`)?.value || 0),
        descricao: document.getElementById(`${prefix}-desc`)?.value || '',
        data: document.getElementById(`${prefix}-date`)?.value || new Date().toISOString()
    };

    const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess("Movimentação registrada com sucesso!");
        await loadDataFromAPI();
        event.target.reset();
        // Resetar data para hoje
        const dateInput = document.getElementById(`${prefix}-date`);
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        // Resetar modo
        toggleQuantityMode(prefix);

        if (type === 'saida' && confirm("Deseja emitir NF-e para esta venda?")) {
            const result = await res.json();
            gerarNFe(result.id, data.descricao, [{
                produto: data.produto,
                qtd: data.quantidade,
                valor: data.valor,
                unidade: data.unidade
            }]);
        }
    } else {
        const err = await res.json();
        showError("Erro ao salvar: " + (err.error || "Erro desconhecido"));
    }
}

// =============================================
// CONFIGURAÇÕES
// =============================================

async function loadConfigData() {
    // Carregar configs
    const res = await fetchWithAuth('/configs');
    if (res && res.ok) {
        const configs = await res.json();
        appData.configs = configs;

        // Preencher peso por caixa
        const pesoCxInput = document.getElementById('config-peso-cx');
        if (pesoCxInput) pesoCxInput.value = configs.peso_por_caixa_padrao || 20;

        // Preencher modo NF-e
        const nfeModo = configs.nfe_modo || 'homologacao';
        const radioEl = document.querySelector(`input[name="nfe_modo"][value="${nfeModo}"]`);
        if (radioEl) radioEl.checked = true;
    }

    // Carregar usuários
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || (userData.user ? userData.user.role : null);
    const isAdmin = userRole === 'admin';

    const listUsuarios = document.getElementById('list-usuarios');
    if (listUsuarios) {
        listUsuarios.innerHTML = '';
        appData.users.forEach(u => {
            const tr = document.createElement('tr');
            const roleLabel = { admin: 'Administrador', chefe: 'Chefe', funcionario: 'Funcionário' }[u.role] || u.role;
            const actions = isAdmin ? `
                <button class="btn-icon" onclick='openUsuarioModal(${JSON.stringify(u)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteUsuario(${u.id})"><i class="fas fa-trash"></i></button>
            ` : '-';
            tr.innerHTML = `<td>${u.label}</td><td>${u.username}</td><td><span class="badge">${roleLabel}</span></td><td style="text-align:right;">${actions}</td>`;
            listUsuarios.appendChild(tr);
        });
    }

    // Listas de clientes/fornecedores/produtos
    const listCli = document.getElementById('config-list-clientes');
    if (listCli) {
        listCli.innerHTML = '';
        appData.clients.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c.nome}</td><td style="text-align:right;">
                <button class="btn-icon" onclick='openEditModal("cliente", ${JSON.stringify(c)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('cliente', ${c.id})"><i class="fas fa-trash"></i></button>
            </td>`;
            listCli.appendChild(tr);
        });
    }

    const listForn = document.getElementById('config-list-fornecedores');
    if (listForn) {
        listForn.innerHTML = '';
        appData.suppliers.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${f.nome}</td><td style="text-align:right;">
                <button class="btn-icon" onclick='openEditModal("fornecedor", ${JSON.stringify(f)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('fornecedor', ${f.id})"><i class="fas fa-trash"></i></button>
            </td>`;
            listForn.appendChild(tr);
        });
    }

    const listProdConfig = document.getElementById('config-list-produtos');
    if (listProdConfig) {
        listProdConfig.innerHTML = '';
        appData.products.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><i class="fas ${p.icone || 'fa-box'}" style="color: ${p.cor}"></i> ${p.nome}</td>
                <td>${p.ncm}</td>
                <td>R$ ${p.preco_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td style="font-weight:700; color:#1e40af;">${p.peso_por_caixa || 20} Kg</td>
                <td style="text-align: right;">
                    <button class="btn-icon" onclick='openProdutoModal(${JSON.stringify(p)})'><i class="fas fa-edit"></i></button>
                    <button class="btn-icon text-danger" onclick="deleteCadastro('produto', ${p.id})"><i class="fas fa-trash"></i></button>
                </td>`;
            listProdConfig.appendChild(tr);
        });
    }
}

async function savePesoPorCaixa() {
    const input = document.getElementById('config-peso-cx');
    if (!input) return;
    const valor = parseFloat(input.value);
    if (!valor || valor <= 0) { showError("Informe um peso válido."); return; }
    const res = await fetchWithAuth('/configs', {
        method: 'POST',
        body: JSON.stringify({ chave: 'peso_por_caixa_padrao', valor: String(valor) })
    });
    if (res && res.ok) {
        appData.configs.peso_por_caixa_padrao = String(valor);
        showSuccess(`Peso por caixa atualizado: ${valor} Kg/Cx`);
    } else {
        showError("Erro ao salvar configuração.");
    }
}

// =============================================
// FINANCEIRO
// =============================================

function updateFinanceKPIs() {
    let totalRevenue = 0, totalExpenses = 0;
    appData.transactions.forEach(t => {
        if (t.tipo === 'saida') totalRevenue += t.valor;
        if (t.tipo === 'entrada' || t.tipo === 'despesa') totalExpenses += t.valor;
    });
    const finIn = document.getElementById('fin-total-in');
    const finOut = document.getElementById('fin-total-out');
    const finBal = document.getElementById('fin-balance');
    if (finIn) finIn.innerText = `R$ ${totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (finOut) finOut.innerText = `R$ ${totalExpenses.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (finBal) finBal.innerText = `R$ ${(totalRevenue - totalExpenses).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

async function saveDespesa(event) {
    event.preventDefault();
    const data = {
        tipo: 'despesa',
        produto: 'DESPESA GERAL',
        quantidade: 1,
        valor: parseFloat(document.getElementById('desp-valor').value),
        descricao: document.getElementById('desp-desc').value,
        data: document.getElementById('desp-data').value || new Date().toISOString()
    };
    const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess("Despesa lançada!");
        await loadDataFromAPI();
        event.target.reset();
    }
}

function renderFinanceTable() {
    const tbody = document.getElementById('finance-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    const financeData = appData.transactions.filter(t => t.tipo === 'saida' || t.tipo === 'entrada' || t.tipo === 'despesa');
    if (financeData.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--text-muted);">Nenhum lançamento financeiro</td></tr>';
        return;
    }
    financeData.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo === 'entrada' ? 'COMPRA' : (t.tipo === 'saida' ? 'VENDA' : t.tipo.toUpperCase())}</span></td>
            <td>${t.descricao || '-'}</td>
            <td style="color: ${t.tipo === 'saida' ? 'var(--primary)' : 'var(--danger)'}">R$ ${t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderFinanceChart() {
    const ctx = document.getElementById('financeChart');
    if (!ctx) return;
    // Implementado no renderDashCharts
}

// =============================================
// EXCLUSÃO
// =============================================

async function deleteMovimentacao(id) {
    if (!confirm("Excluir este registro permanentemente?")) return;
    animateTrash(`deleteMovimentacao(${id})`);
    const res = await fetchWithAuth(`/movimentacoes/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess("Registro excluído!");
        await loadDataFromAPI();
        if (currentSectionId === 'estoque') { renderStockTable(); renderEstoqueResumo(); }
        if (currentSectionId === 'dashboard') loadDashboard();
    }
}

// =============================================
// NF-E
// =============================================

let nfeSearchTimeout = null;
function debounceSearchNFe() {
    clearTimeout(nfeSearchTimeout);
    nfeSearchTimeout = setTimeout(() => { loadNFeTable(); }, 500);
}

async function loadNFeTable() {
    const tbody = document.getElementById('nfe-table-body');
    if (!tbody) return;
    const searchInput = document.getElementById('nfe-search');
    const searchTerm = searchInput ? searchInput.value : '';
    const res = await fetchWithAuth(`/nfe${searchTerm ? '?search=' + encodeURIComponent(searchTerm) : ''}`);
    if (!res) return;
    const data = await res.json();
    tbody.innerHTML = '';
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || (userData.user ? userData.user.role : null);
    const isAdmin = userRole === 'admin';
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 6 : 5}" style="text-align:center;padding:30px;color:var(--text-muted);">Nenhuma nota fiscal encontrada</td></tr>`;
        return;
    }
    data.forEach(n => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(n.data_emissao).toLocaleDateString('pt-BR')}</td><td>#${n.venda_id}</td>
            <td style="font-family: monospace; font-size: 0.8rem;">${n.chave_acesso}</td>
            <td><span class="badge entrada">${n.status.toUpperCase()}</span></td>
            <td style="text-align: right;">
                <button class="btn-icon" onclick="downloadXML(${n.id})" title="Baixar XML"><i class="fas fa-file-code"></i> XML</button>
                <button class="btn-icon" onclick="downloadPDF(${n.id})" title="Imprimir DANFE"><i class="fas fa-file-pdf"></i> PDF</button>
                ${isAdmin ? `<button class="btn-icon text-danger" onclick="deleteNFe(${n.id})" title="Remover NFe"><i class="fas fa-trash"></i></button>` : ''}
            </td>`;
        tbody.appendChild(tr);
    });
}

async function deleteNFe(id) {
    if (!confirm("Deseja realmente remover esta NFe?")) return;
    animateTrash(`deleteNFe(${id})`);
    const res = await fetchWithAuth(`/nfe/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showSuccess("NFe removida com sucesso!"); loadNFeTable(); }
    else showError("Erro ao remover NFe.");
}

async function gerarNFe(vendaId, destinatario, itens) {
    showSuccess("Gerando NF-e...");
    const res = await fetchWithAuth('/nfe/gerar', {
        method: 'POST',
        body: JSON.stringify({ venda_id: vendaId, destinatario, itens })
    });
    if (res && res.ok) {
        showAnimatedCheck();
        showSuccess("NF-e gerada com sucesso!");
        showSection('nfe');
    } else {
        const err = await res.json();
        showError("Erro ao gerar NF-e: " + (err.error || "Erro desconhecido"));
    }
}

async function updateNFeModo(modo) {
    const res = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'nfe_modo', valor: modo }) });
    if (res && res.ok) showSuccess(`Ambiente alterado para ${modo.toUpperCase()}!`);
    else showError("Erro ao alterar ambiente.");
}

async function saveCertPassword() {
    const password = document.getElementById('cert-password').value;
    const res = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'cert_password', valor: password }) });
    if (res && res.ok) showSuccess("Senha do certificado salva!");
}

async function downloadXML(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/nfe/${id}/xml`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error("Erro ao baixar XML");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `NFe_${id}.xml`; a.click();
    } catch (err) { showError(err.message); }
}

async function downloadPDF(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/nfe/${id}/pdf`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) throw new Error("Erro ao baixar PDF");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = url; a.download = `DANFE_${id}.pdf`;
        document.body.appendChild(a); a.click();
        setTimeout(() => { window.URL.revokeObjectURL(url); a.remove(); }, 1000);
    } catch (err) { showError(err.message); }
}

// =============================================
// CADASTROS
// =============================================

function loadCadastros() {
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || (userData.user ? userData.user.role : null);
    const isAdmin = userRole === 'admin';
    const listCli = document.getElementById('list-clientes');
    const listForn = document.getElementById('list-fornecedores');
    const listProd = document.getElementById('list-produtos');

    if (listCli) {
        listCli.innerHTML = '';
        appData.clients.forEach(c => {
            const tr = document.createElement('tr');
            const actions = isAdmin ? `<td><button class="btn-icon" onclick='openEditModal("cliente", ${JSON.stringify(c)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('cliente', ${c.id})"><i class="fas fa-trash"></i></button></td>` : '<td>-</td>';
            tr.innerHTML = `<td>${c.nome}</td><td>${c.documento}</td><td>${c.telefone}</td>${actions}`;
            listCli.appendChild(tr);
        });
    }
    if (listForn) {
        listForn.innerHTML = '';
        appData.suppliers.forEach(f => {
            const tr = document.createElement('tr');
            const actions = isAdmin ? `<td><button class="btn-icon" onclick='openEditModal("fornecedor", ${JSON.stringify(f)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('fornecedor', ${f.id})"><i class="fas fa-trash"></i></button></td>` : '<td>-</td>';
            tr.innerHTML = `<td>${f.nome}</td><td>${f.documento}</td><td>${f.telefone}</td>${actions}`;
            listForn.appendChild(tr);
        });
    }
    if (listProd) {
        listProd.innerHTML = '';
        appData.products.forEach(p => {
            const tr = document.createElement('tr');
            const actions = isAdmin ? `<td><button class="btn-icon" onclick='openProdutoModal(${JSON.stringify(p)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('produto', ${p.id})"><i class="fas fa-trash"></i></button></td>` : '<td>-</td>';
            tr.innerHTML = `<td><i class="fas ${p.icone || 'fa-box'}" style="color: ${p.cor}"></i> ${p.nome}</td><td>${p.ncm}</td>
                <td>R$ ${p.preco_venda.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>${actions}`;
            listProd.appendChild(tr);
        });
    }
}

function openEditModal(type, data = null) {
    const modal = document.getElementById('modal-edit');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('edit-type').value = type;
    document.getElementById('modal-title').innerText = data ? `Editar ${type}` : `Novo ${type}`;
    if (data) {
        document.getElementById('edit-id').value = data.id;
        document.getElementById('edit-nome').value = data.nome;
        document.getElementById('edit-doc').value = data.documento;
        document.getElementById('edit-tel').value = data.telefone;
        document.getElementById('edit-ie').value = data.ie || '';
        document.getElementById('edit-email').value = data.email || '';
        document.getElementById('edit-end').value = data.endereco || '';
    } else {
        document.getElementById('edit-id').value = '';
        document.querySelector('#modal-edit form').reset();
        document.getElementById('edit-type').value = type;
    }
}

function closeEditModal() {
    const modal = document.getElementById('modal-edit');
    if (modal) modal.classList.remove('active');
}

async function saveCadastro(event) {
    event.preventDefault();
    const type = document.getElementById('edit-type').value;
    const id = document.getElementById('edit-id').value;
    const data = {
        id: id || null,
        nome: document.getElementById('edit-nome').value,
        documento: document.getElementById('edit-doc').value,
        telefone: document.getElementById('edit-tel').value,
        ie: document.getElementById('edit-ie').value,
        email: document.getElementById('edit-email').value,
        endereco: document.getElementById('edit-end').value
    };
    const endpoint = type === 'cliente' ? '/clientes' : '/fornecedores';
    try {
        const res = await fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify(data) });
        if (res && res.ok) {
            showSuccess(`${type === 'cliente' ? 'Cliente' : 'Fornecedor'} salvo com sucesso!`);
            closeEditModal();
            await loadDataFromAPI();
            if (currentSectionId === 'config') loadConfigData();
            if (currentSectionId === 'cadastro') loadCadastros();
        } else {
            const errData = await res.json();
            showError("Erro ao salvar: " + (errData.error || "Erro desconhecido"));
        }
    } catch (err) { showError("Erro na conexão com o servidor."); }
}

async function deleteCadastro(type, id) {
    if (!confirm(`Excluir este ${type} permanentemente?`)) return;
    animateTrash(`deleteCadastro('${type}', ${id})`);
    const res = await fetchWithAuth(`/cadastros/${type}/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess("Cadastro removido!");
        await loadDataFromAPI();
        if (currentSectionId === 'cadastro') loadCadastros();
        if (currentSectionId === 'config') loadConfigData();
    } else {
        const err = await res.json();
        showError("Erro ao excluir: " + (err.error || "Erro desconhecido"));
    }
}

function openProdutoModal(data = null) {
    const modal = document.getElementById('modal-produto');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('produto-modal-title').innerText = data ? "Editar Produto" : "Novo Produto";
    if (data) {
        document.getElementById('prod-id').value = data.id;
        document.getElementById('prod-nome').value = data.nome;
        document.getElementById('prod-ncm').value = data.ncm;
        document.getElementById('prod-preco').value = data.preco_venda;
        document.getElementById('prod-icone').value = data.icone;
        document.getElementById('prod-cor').value = data.cor;
        const pesoCxInput = document.getElementById('prod-peso-cx');
        if (pesoCxInput) pesoCxInput.value = data.peso_por_caixa || 20;
        document.querySelectorAll('.icon-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('onclick').includes(`'${data.icone}'`));
        });
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('onclick').includes(`'${data.cor}'`));
        });
    } else {
        document.getElementById('prod-id').value = '';
        document.querySelector('#modal-produto form').reset();
        const pesoCxInput = document.getElementById('prod-peso-cx');
        if (pesoCxInput) pesoCxInput.value = appData.configs.peso_por_caixa_padrao || 20;
        const firstIcon = document.querySelector('.icon-option');
        const firstColor = document.querySelector('.color-option');
        if (firstIcon) selectIcon(firstIcon, 'fa-circle');
        if (firstColor) selectColor(firstColor, '#1A5632');
    }
}

function closeProdutoModal() {
    const modal = document.getElementById('modal-produto');
    if (modal) modal.classList.remove('active');
}

async function saveProduto(event) {
    event.preventDefault();
    const id = document.getElementById('prod-id').value;
    const pesoCxInput = document.getElementById('prod-peso-cx');
    const data = {
        id: id || null,
        nome: document.getElementById('prod-nome').value,
        ncm: document.getElementById('prod-ncm').value,
        preco_venda: parseFloat(document.getElementById('prod-preco').value),
        icone: document.getElementById('prod-icone').value,
        cor: document.getElementById('prod-cor').value,
        peso_por_caixa: pesoCxInput ? parseFloat(pesoCxInput.value || 20) : 20
    };
    try {
        const res = await fetchWithAuth('/produtos', { method: 'POST', body: JSON.stringify(data) });
        if (res && res.ok) {
            showSuccess("Produto salvo!");
            closeProdutoModal();
            await loadDataFromAPI();
            if (currentSectionId === 'cadastro') loadCadastros();
            if (currentSectionId === 'config') loadConfigData();
        } else {
            const errData = await res.json();
            showError("Erro ao salvar: " + (errData.error || "Erro desconhecido"));
        }
    } catch (err) { showError("Erro na conexão."); }
}

function selectColor(el, color) {
    document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('prod-cor').value = color;
}

function selectIcon(el, icon) {
    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('prod-icone').value = icon;
}

// =============================================
// BUSCA / MODAL DE PESQUISA
// =============================================

function openSearchModal(type) {
    const modal = document.getElementById('modal-search');
    if (!modal) return;
    modal.classList.add('active');
    const list = type === 'cliente' ? appData.clients : appData.suppliers;
    const tbody = document.getElementById('search-results');
    if (tbody) {
        tbody.innerHTML = '';
        list.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.cursor = 'pointer';
            tr.innerHTML = `<td>${item.nome}</td><td>${item.documento}</td><td>${item.telefone}</td>`;
            tr.onclick = () => {
                const prefix = currentSectionId === 'entrada' ? 'entry' : 'exit';
                const descInput = document.getElementById(`${prefix}-desc`);
                if (descInput) descInput.value = item.nome;
                closeSearchModal();
            };
            tbody.appendChild(tr);
        });
    }
}

function closeSearchModal() {
    const modal = document.getElementById('modal-search');
    if (modal) modal.classList.remove('active');
}

// =============================================
// USUÁRIOS
// =============================================

function openUsuarioModal(data = null) {
    const modal = document.getElementById('modal-usuario');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('user-modal-title').innerText = data ? "Editar Usuário" : "Novo Usuário";
    if (data) {
        document.getElementById('user-id').value = data.id;
        document.getElementById('user-label').value = data.label;
        document.getElementById('user-username').value = data.username;
        document.getElementById('user-role').value = data.role;
        document.getElementById('user-password').value = '';
    } else {
        document.getElementById('user-id').value = '';
        document.querySelector('#modal-usuario form').reset();
    }
}

function closeUsuarioModal() {
    const modal = document.getElementById('modal-usuario');
    if (modal) modal.classList.remove('active');
}

async function saveUsuario(event) {
    event.preventDefault();
    const id = document.getElementById('user-id').value;
    const data = {
        id: id || null,
        label: document.getElementById('user-label').value,
        username: document.getElementById('user-username').value,
        password: document.getElementById('user-password').value || null,
        role: document.getElementById('user-role').value
    };
    const res = await fetchWithAuth('/usuarios', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess("Usuário salvo!");
        closeUsuarioModal();
        await loadDataFromAPI();
        loadConfigData();
    } else {
        const err = await res.json();
        showError("Erro ao salvar usuário: " + (err.error || "Erro desconhecido"));
    }
}

async function deleteUsuario(id) {
    if (!confirm("Excluir este usuário permanentemente?")) return;
    const res = await fetchWithAuth(`/usuarios/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess("Usuário excluído!");
        await loadDataFromAPI();
        loadConfigData();
    }
}

async function loadLogs() {
    const listLogs = document.getElementById('list-logs');
    if (!listLogs) return;
    const res = await fetchWithAuth('/logs');
    if (res && res.ok) {
        const logs = await res.json();
        listLogs.innerHTML = '';
        logs.forEach(l => {
            const tr = document.createElement('tr');
            const date = new Date(l.data).toLocaleString('pt-BR');
            tr.innerHTML = `<td>${date}</td><td><strong>${l.username}</strong></td><td><span class="badge">${l.acao}</span></td><td>${l.detalhes}</td>`;
            listLogs.appendChild(tr);
        });
    }
}

// =============================================
// CONSULTA DE DOCUMENTO
// =============================================

function updateDocMask() {
    const type = document.getElementById('edit-doc-type').value;
    const input = document.getElementById('edit-doc');
    const label = document.getElementById('label-doc');
    if (type === 'CNPJ') { label.innerText = 'CNPJ'; input.placeholder = '00.000.000/0000-00'; }
    else { label.innerText = 'CPF'; input.placeholder = '000.000.000-00'; }
}

async function consultarDocumento() {
    const doc = document.getElementById('edit-doc').value.replace(/\D/g, '');
    const type = document.getElementById('edit-doc-type').value;
    if (!doc) { showError("Digite um documento para consultar."); return; }
    showSuccess("Consultando documento...");
    try {
        const res = await fetchWithAuth(`/consultar/${type}/${doc}`);
        if (res && res.ok) {
            const data = await res.json();
            if (type === 'CNPJ') {
                document.getElementById('edit-nome').value = data.razao_social || data.nome || '';
                document.getElementById('edit-end').value = `${data.logradouro}, ${data.numero}, ${data.bairro}, ${data.municipio} - ${data.uf}`;
                document.getElementById('edit-email').value = data.email || '';
                document.getElementById('edit-tel').value = data.telefone || '';
            } else {
                document.getElementById('edit-nome').value = data.nome || '';
            }
            showSuccess("Dados preenchidos!");
        } else {
            const err = await res.json();
            showError("Erro na consulta: " + (err.error || "Documento não encontrado"));
        }
    } catch (err) { showError("Erro ao conectar com o serviço de consulta."); }
}

// =============================================
// SISTEMA
// =============================================

async function resetSystem() {
    if (!confirm("TEM CERTEZA? Esta ação é irreversível e apagará todos os dados de movimentações, clientes e fornecedores.")) return;
    const res = await fetchWithAuth('/reset', { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Sistema resetado com sucesso!"); window.location.reload(); }
}

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    const mmUser = localStorage.getItem('mm_user');
    if (!token || !mmUser) { window.location.href = getLoginUrl(); return; }
    options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
    if (options.body && !options.headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
    try {
        const res = await fetch(API_URL + url, options);
        if (res.status === 401 || res.status === 403) { logout(); return; }
        return res;
    } catch (err) { console.error("Erro na requisição:", err); return null; }
}

function checkLogin() {
    const token = localStorage.getItem('token');
    const userDataRaw = localStorage.getItem('mm_user');
    if (!token || !userDataRaw) { window.location.href = getLoginUrl(); return; }
    try {
        const userData = JSON.parse(userDataRaw);
        if (!userData || typeof userData !== 'object') throw new Error("Dados de sessão corrompidos");
    } catch (e) { logout(); }
}

function logout() {
    localStorage.clear();
    window.location.href = getLoginUrl();
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

// =============================================
// NOTIFICAÇÕES
// =============================================

function showSuccess(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
    if (msg.toLowerCase().includes('nf-e') || msg.toLowerCase().includes('venda')) showAnimatedCheck();
}

function showError(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// =============================================
// ANIMAÇÕES E SOM
// =============================================

function playSystemSound(id) {
    const sound = document.getElementById(`sound-${id}`);
    if (sound) { sound.currentTime = 0; sound.play().catch(err => console.warn("Som bloqueado:", err)); }
}

function showAnimatedCheck() {
    const overlay = document.getElementById('confirmation-overlay');
    if (!overlay) return;
    overlay.classList.add('active');
    playSystemSound('success');
    setTimeout(() => { overlay.classList.remove('active'); }, 2500);
}

function animateTrash(elementId) {
    const trash = document.getElementById('trash-container');
    const sourceEl = document.querySelector(`[onclick*="${elementId}"]`) || document.getElementById(elementId);
    if (!trash) return;
    trash.classList.add('active');
    if (sourceEl) {
        const rect = sourceEl.getBoundingClientRect();
        const trashRect = trash.getBoundingClientRect();
        const file = document.createElement('div');
        file.className = 'flying-file';
        file.innerHTML = '<i class="fas fa-file-alt"></i>';
        file.style.left = `${rect.left}px`;
        file.style.top = `${rect.top}px`;
        document.body.appendChild(file);
        setTimeout(() => {
            file.style.transition = 'all 0.8s cubic-bezier(0.55, 0, 0.1, 1)';
            file.style.left = `${trashRect.left + 20}px`;
            file.style.top = `${trashRect.top + 10}px`;
            file.style.transform = 'scale(0.1) rotate(360deg)';
            file.style.opacity = '0';
        }, 50);
        setTimeout(() => file.remove(), 900);
    }
    setTimeout(() => {
        trash.classList.add('shake');
        playSystemSound('trash');
        setTimeout(() => trash.classList.remove('shake'), 400);
    }, 800);
    setTimeout(() => { trash.classList.remove('active'); }, 2500);
}

// Compatibilidade: renderCharts é chamado em alguns contextos
function renderCharts(stockMap) {
    if (dashboardData) renderDashCharts(dashboardData);
}
