// M&M Cebolas - Core Script (v3.0 - Professional Dashboard & Organized NFe)

let appData = {
    transactions: [],
    products: [],
    clients: [],
    suppliers: [],
    users: [],
    configs: {}
};

let currentSectionId = 'dashboard';
let mainChart = null;
let distributionChart = null;
let dashboardData = null;
let dashboardPeriod = 'mes';
let dashboardChartType = 'bar';
let nfeGroupingMode = 'fornecedor';

const API_URL = (function () {
    const host = window.location.hostname;
    const isElectron = window.location.protocol === 'file:' ||
        (typeof process !== 'undefined' && process.versions && process.versions.electron);
    if (isElectron) return 'https://portalmmcebolas.com/api';
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api';
    return 'https://portalmmcebolas.com/api';
})();

window.onload = function () {
    checkLogin();
    checkEnvironment();
    loadDataFromAPI();
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

    if (id === 'dashboard') loadDashboard();
    if (id === 'entrada' || id === 'saida') {
        renderProductShowcase(id);
        setTimeout(() => {
            const prefix = id === 'entrada' ? 'entry' : 'exit';
            toggleQuantityMode(prefix);
        }, 50);
    }
    if (id === 'cadastro') loadCadastros();
    if (id === 'financeiro') {
        updateFinanceKPIs();
        renderFinanceTable();
    }
    if (id === 'estoque') {
        renderStockTable();
        renderEstoqueResumo();
    }
    if (id === 'nfe') loadNFeTable();
    if (id === 'config') {
        loadConfigData();
        if (!isAdmin) {
            ['#admin-users-panel', '#admin-logs-panel', '#admin-entities-panel', '#admin-products-panel', '#admin-danger-panel'].forEach(selector => {
                document.querySelectorAll(selector).forEach(el => el.style.display = 'none');
            });
        }
    }
}

// =============================================
// DASHBOARD PROFISSIONAL (v3.0)
// =============================================

async function loadDashboard() {
    try {
        const res = await fetchWithAuth('/dashboard');
        if (res && res.ok) {
            dashboardData = await res.json();
        } else {
            dashboardData = calcularDashboardLocal();
        }
    } catch (e) {
        dashboardData = calcularDashboardLocal();
    }
    renderDashboardPro(dashboardData);
}

function setDashboardPeriod(period) {
    dashboardPeriod = period;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`btn-period-${period}`)?.classList.add('active');
    loadDashboard();
}

function renderDashboardPro(data) {
    if (!data) return;

    const dDate = document.getElementById('current-date');
    if (dDate) dDate.innerText = new Date().toLocaleDateString('pt-BR');

    // KPIs Dinâmicos
    renderKPIs(data);
    
    // Gráficos Profissionais
    renderMainChart(data);
    renderDistributionChart(data);

    // Tabelas e Rankings
    renderSupplierRanking(data);
    renderInventoryTable(data);
    renderRecentOps(data.ultimasMovimentacoes);
}

function renderKPIs(data) {
    const container = document.getElementById('kpi-container');
    if (!container) return;

    const kpis = [
        { label: 'Volume em Caixas', value: `${data.estoque.totalCaixas.toLocaleString('pt-BR')} Cx`, icon: 'fa-boxes', color: '#166534', bg: '#dcfce7' },
        { label: 'Volume em Peso', value: `${data.estoque.totalKg.toLocaleString('pt-BR')} Kg`, icon: 'fa-weight-hanging', color: '#1e40af', bg: '#dbeafe' },
        { label: 'Receita (Mês)', value: `R$ ${data.financeiro.receitaMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: 'fa-hand-holding-usd', color: '#065f46', bg: '#d1fae5' },
        { label: 'Lucro Estimado', value: `R$ ${data.financeiro.lucroMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: 'fa-coins', color: '#92400e', bg: '#fef3c7' }
    ];

    container.innerHTML = kpis.map(kpi => `
        <div class="panel" style="padding: 20px; display: flex; align-items: center; gap: 16px; border-left: 4px solid ${kpi.color};">
            <div style="width: 48px; height: 48px; background: ${kpi.bg}; color: ${kpi.color}; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem;">
                <i class="fas ${kpi.icon}"></i>
            </div>
            <div>
                <p style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${kpi.label}</p>
                <h3 style="font-size: 1.3rem; font-weight: 800; color: ${kpi.color};">${kpi.value}</h3>
            </div>
        </div>
    `).join('');
}

function renderMainChart(data) {
    const ctx = document.getElementById('mainDashboardChart');
    if (!ctx) return;
    if (mainChart) mainChart.destroy();

    const metric = document.getElementById('chart-metric-select')?.value || 'financeiro';
    const labels = Object.keys(data.mensal).map(k => {
        const [year, month] = k.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });
    });
    const values = Object.values(data.mensal);

    let datasets = [];
    if (metric === 'financeiro') {
        datasets = [
            { label: 'Receita', data: values.map(v => v.receita), backgroundColor: '#22c55e', borderColor: '#22c55e', tension: 0.4, fill: dashboardChartType === 'line' },
            { label: 'Despesas', data: values.map(v => v.despesa), backgroundColor: '#ef4444', borderColor: '#ef4444', tension: 0.4, fill: dashboardChartType === 'line' }
        ];
    } else if (metric === 'volume_cx') {
        datasets = [
            { label: 'Entrada (Cx)', data: values.map(v => v.caixas_entrada), backgroundColor: '#1A5632', borderColor: '#1A5632', tension: 0.4 },
            { label: 'Saída (Cx)', data: values.map(v => v.caixas_saida), backgroundColor: '#f59e0b', borderColor: '#f59e0b', tension: 0.4 }
        ];
    } else {
        datasets = [
            { label: 'Entrada (Kg)', data: values.map(v => v.kg_entrada), backgroundColor: '#1e40af', borderColor: '#1e40af', tension: 0.4 },
            { label: 'Saída (Kg)', data: values.map(v => v.kg_saida), backgroundColor: '#7c3aed', borderColor: '#7c3aed', tension: 0.4 }
        ];
    }

    mainChart = new Chart(ctx, {
        type: dashboardChartType,
        data: { labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 6, font: { size: 11, weight: 'bold' } } } },
            scales: { y: { beginAtZero: true, grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } }
        }
    });
}

function setChartType(type) {
    dashboardChartType = type;
    document.getElementById('btn-chart-bar')?.classList.toggle('active', type === 'bar');
    document.getElementById('btn-chart-line')?.classList.toggle('active', type === 'line');
    renderMainChart(dashboardData);
}

function updateMainChart() {
    renderMainChart(dashboardData);
}

function renderDistributionChart(data) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;
    if (distributionChart) distributionChart.destroy();

    const prods = data.estoque.porProduto;
    if (prods.length === 0) return;

    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: prods.map(p => p.nome),
            datasets: [{
                data: prods.map(p => p.caixas),
                backgroundColor: ['#1A5632', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 10
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: { legend: { display: false } }
        }
    });

    // Legenda customizada
    const legend = document.getElementById('product-legend');
    if (legend) {
        legend.innerHTML = prods.map((p, i) => `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: ${['#1A5632', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444'][i]}"></span>
                    <span style="font-weight: 600;">${p.nome}</span>
                </div>
                <span style="color: var(--text-muted);">${p.caixas} Cx</span>
            </div>
        `).join('');
    }
}

function renderSupplierRanking(data) {
    const tbody = document.getElementById('dash-supplier-ranking');
    if (!tbody) return;

    // Calcular ranking de fornecedores baseado nas transações
    const ranking = {};
    appData.transactions.filter(t => t.tipo === 'entrada').forEach(t => {
        if (!ranking[t.descricao]) ranking[t.descricao] = { nome: t.descricao, caixas: 0, valor: 0 };
        ranking[t.descricao].caixas += (t.qtd_caixas || 0);
        ranking[t.descricao].valor += t.valor;
    });

    const sorted = Object.values(ranking).sort((a, b) => b.valor - a.valor).slice(0, 5);
    
    tbody.innerHTML = sorted.length ? sorted.map(s => `
        <tr>
            <td><strong>${s.nome || 'Não Identificado'}</strong></td>
            <td style="text-align: center;">${s.caixas.toLocaleString('pt-BR')}</td>
            <td style="text-align: right; font-weight: 700; color: var(--primary);">R$ ${s.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td><span class="badge entrada">Ativo</span></td>
        </tr>
    `).join('') : '<tr><td colspan="4" style="text-align:center; padding:20px; color:var(--text-muted);">Sem dados de fornecedores</td></tr>';
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('dash-inventory-table');
    if (!tbody) return;

    tbody.innerHTML = data.estoque.porProduto.map(p => `
        <tr>
            <td><strong>${p.nome}</strong></td>
            <td style="text-align: center; font-weight: 700;">${p.caixas}</td>
            <td style="text-align: center; color: var(--text-muted);">${p.kg}</td>
            <td><i class="fas fa-arrow-up" style="color: #22c55e; font-size: 0.7rem;"></i> <span style="font-size: 0.75rem; color: #22c55e;">+2%</span></td>
        </tr>
    `).join('');
}

function renderRecentOps(transactions) {
    const tbody = document.getElementById('dash-recent-ops');
    if (!tbody) return;

    tbody.innerHTML = transactions.slice(0, 8).map(t => `
        <tr>
            <td class="date">${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo === 'entrada' ? 'COMPRA' : (t.tipo === 'saida' ? 'VENDA' : 'DESPESA')}</span></td>
            <td><strong>${t.descricao || '-'}</strong></td>
            <td>${t.produto}</td>
            <td style="text-align: center; font-weight: 700;">${t.qtd_caixas || t.quantidade} Cx</td>
            <td style="text-align: right; font-weight: 700;">R$ ${t.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
            <td style="text-align: right;">
                <button class="btn-icon" onclick="showSection('estoque')"><i class="fas fa-eye"></i></button>
            </td>
        </tr>
    `).join('');
}

function globalDashSearch(term) {
    const filter = term.toUpperCase();
    const rows = document.querySelectorAll('#dash-main-ops-table tbody tr');
    rows.forEach(row => {
        const text = row.innerText.toUpperCase();
        row.style.display = text.indexOf(filter) > -1 ? '' : 'none';
    });
}

function filterDashTable(tableId, term) {
    const filter = term.toUpperCase();
    const rows = document.querySelectorAll(`#${tableId} tbody tr`);
    rows.forEach(row => {
        const text = row.innerText.toUpperCase();
        row.style.display = text.indexOf(filter) > -1 ? '' : 'none';
    });
}

// =============================================
// GESTÃO DE NF-E ORGANIZADA (v3.0)
// =============================================

function setNFeGrouping(mode) {
    nfeGroupingMode = mode;
    document.querySelectorAll('.filter-group-pro .filter-btn').forEach(btn => btn.classList.remove('active'));
    if (mode === 'fornecedor') document.getElementById('btn-group-forn')?.classList.add('active');
    if (mode === 'data') document.getElementById('btn-group-data')?.classList.add('active');
    if (mode === 'status') document.getElementById('btn-group-status')?.classList.add('active');
    loadNFeTable();
}

async function loadNFeTable() {
    const container = document.getElementById('nfe-dynamic-container');
    if (!container) return;

    const res = await fetchWithAuth('/nfe');
    if (!res) return;
    const data = await res.json();

    // KPIs Fiscais
    const totalMes = data.reduce((acc, n) => {
        const nDate = new Date(n.data_emissao);
        const now = new Date();
        if (nDate.getMonth() === now.getMonth() && nDate.getFullYear() === now.getFullYear()) return acc + (n.valor || 0);
        return acc;
    }, 0);
    
    document.getElementById('nfe-total-mes').innerText = `R$ ${totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('nfe-pending-count').innerText = `${data.filter(n => n.status !== 'autorizada').length} Notas`;

    if (data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fas fa-file-invoice fa-3x" style="margin-bottom:15px; opacity:0.3;"></i><p>Nenhuma nota fiscal encontrada no período.</p></div>';
        return;
    }

    // Agrupamento
    let groups = {};
    if (nfeGroupingMode === 'fornecedor') {
        data.forEach(n => {
            const ent = n.descricao || 'Não Identificado';
            if (!groups[ent]) groups[ent] = [];
            groups[ent].push(n);
        });
    } else if (nfeGroupingMode === 'data') {
        data.forEach(n => {
            const date = new Date(n.data_emissao).toLocaleDateString('pt-BR');
            if (!groups[date]) groups[date] = [];
            groups[date].push(n);
        });
    } else {
        data.forEach(n => {
            const status = n.status.toUpperCase();
            if (!groups[status]) groups[status] = [];
            groups[status].push(n);
        });
    }

    container.innerHTML = Object.entries(groups).map(([name, items], idx) => `
        <div class="nfe-group-content">
            <div class="nfe-group-header" onclick="toggleNFeGroup('group-${idx}')">
                <h5><i class="fas ${nfeGroupingMode === 'fornecedor' ? 'fa-user-tie' : (nfeGroupingMode === 'data' ? 'fa-calendar-day' : 'fa-info-circle')}"></i> ${name}</h5>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-size: 0.8rem; font-weight: 700; color: var(--primary);">R$ ${items.reduce((a, b) => a + (b.valor || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    <span class="count-badge">${items.length}</span>
                    <i class="fas fa-chevron-down" style="font-size: 0.8rem; color: var(--text-muted);"></i>
                </div>
            </div>
            <div id="group-${idx}" class="nfe-items-list">
                ${items.map(n => `
                    <div class="nfe-list-item">
                        <span class="date">${new Date(n.data_emissao).toLocaleDateString('pt-BR')}</span>
                        <div class="info">
                            <span style="display:block;">${n.produto}</span>
                            <small style="color:var(--text-muted); font-family:monospace; font-size:0.7rem;">${n.chave_acesso.substring(0, 20)}...</small>
                        </div>
                        <span class="value">R$ ${n.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        <div class="status"><span class="badge entrada">${n.status.toUpperCase()}</span></div>
                        <div class="actions">
                            <button class="btn-icon" onclick="downloadXML(${n.id})" title="Baixar XML"><i class="fas fa-code"></i></button>
                            <button class="btn-icon" onclick="downloadPDF(${n.id})" title="DANFE"><i class="fas fa-file-pdf"></i></button>
                            <button class="btn-icon text-danger" onclick="deleteNFe(${n.id})"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');
}

function toggleNFeGroup(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

function filterNFeBySearch(term) {
    const filter = term.toUpperCase();
    const items = document.querySelectorAll('.nfe-list-item');
    const groups = document.querySelectorAll('.nfe-group-content');

    items.forEach(item => {
        const text = item.innerText.toUpperCase();
        item.style.display = text.indexOf(filter) > -1 ? 'grid' : 'none';
    });

    groups.forEach(group => {
        const visibleItems = group.querySelectorAll('.nfe-list-item[style="display: grid;"]');
        group.style.display = visibleItems.length > 0 ? 'block' : 'none';
    });
}

// =============================================
// FUNÇÕES AUXILIARES E COMPATIBILIDADE
// =============================================

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
            if (t.unidade === 'KG') { kg = t.quantidade; caixas = t.quantidade / pesoPorCaixa; }
            else { caixas = t.quantidade; kg = t.quantidade * pesoPorCaixa; }
        }

        if (t.tipo === 'entrada') {
            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
            stockByCaixas[t.produto] += caixas; stockByKg[t.produto] += kg;
            totalCaixas += caixas; totalKg += kg;
            despesasTotal += t.valor;
            if (isCurrentMonth) despesasMes += t.valor;
            if (monthlyData[monthKey]) {
                monthlyData[monthKey].despesa += t.valor;
                monthlyData[monthKey].caixas_entrada += caixas;
                monthlyData[monthKey].kg_entrada += kg;
            }
        } else if (t.tipo === 'saida') {
            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
            stockByCaixas[t.produto] -= caixas; stockByKg[t.produto] -= kg;
            totalCaixas -= caixas; totalKg -= kg;
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
        estoque: { totalCaixas: Math.round(totalCaixas * 10) / 10, totalKg: Math.round(totalKg * 10) / 10, porProduto: topProdutos },
        financeiro: { receitaMes, despesasMes, lucroMes: receitaMes - despesasMes, receitaTotal, despesasTotal, lucroTotal: receitaTotal - despesasTotal },
        mensal: monthlyData,
        ultimasMovimentacoes: appData.transactions.slice(0, 10),
        pesoPorCaixa
    };
}

function refreshDashboard() { loadDashboard(); }

// --- Resto das funções mantidas do v2.0 para garantir funcionamento ---

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
    if (caixas > 0) pesoInput.value = Math.round(caixas * pesoPorCaixa * 10) / 10;
}

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
    const produto = document.getElementById(`${prefix}-product`)?.value;
    if (!produto) { showError("Selecione um produto."); return; }
    const data = {
        tipo: type, produto, quantidade, unidade, peso_kg, qtd_caixas,
        valor: parseFloat(document.getElementById(`${prefix}-value`)?.value || 0),
        descricao: document.getElementById(`${prefix}-desc`)?.value || '',
        data: document.getElementById(`${prefix}-date`)?.value || new Date().toISOString()
    };
    const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess("Sucesso!");
        await loadDataFromAPI();
        event.target.reset();
        const dateInput = document.getElementById(`${prefix}-date`);
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        toggleQuantityMode(prefix);
    }
}

async function deleteMovimentacao(id) {
    if (!confirm("Excluir?")) return;
    const res = await fetchWithAuth(`/movimentacoes/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Excluído!"); await loadDataFromAPI(); }
}

async function deleteNFe(id) {
    if (!confirm("Excluir NFe?")) return;
    const res = await fetchWithAuth(`/nfe/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Removida!"); loadNFeTable(); }
}

async function downloadXML(id) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/nfe/${id}/xml`, { headers: { 'Authorization': `Bearer ${token}` } });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `NFe_${id}.xml`; a.click();
}

async function downloadPDF(id) {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/nfe/${id}/pdf`, { headers: { 'Authorization': `Bearer ${token}` } });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `DANFE_${id}.pdf`; a.click();
}

function loadCadastros() {
    const listCli = document.getElementById('list-clientes');
    const listForn = document.getElementById('list-fornecedores');
    const listProd = document.getElementById('list-produtos');
    if (listCli) listCli.innerHTML = appData.clients.map(c => `<tr><td>${c.nome}</td><td>${c.documento}</td><td>${c.telefone}</td><td><button class="btn-icon" onclick='openEditModal("cliente", ${JSON.stringify(c)})'><i class="fas fa-edit"></i></button></td></tr>`).join('');
    if (listForn) listForn.innerHTML = appData.suppliers.map(f => `<tr><td>${f.nome}</td><td>${f.documento}</td><td>${f.telefone}</td><td><button class="btn-icon" onclick='openEditModal("fornecedor", ${JSON.stringify(f)})'><i class="fas fa-edit"></i></button></td></tr>`).join('');
    if (listProd) listProd.innerHTML = appData.products.map(p => `<tr><td><i class="fas ${p.icone}" style="color:${p.cor}"></i> ${p.nome}</td><td>${p.ncm}</td><td>R$ ${p.preco_venda}</td><td><button class="btn-icon" onclick='openProdutoModal(${JSON.stringify(p)})'><i class="fas fa-edit"></i></button></td></tr>`).join('');
}

function openEditModal(type, data = null) {
    const modal = document.getElementById('modal-edit');
    if (modal) modal.classList.add('active');
    document.getElementById('edit-type').value = type;
    if (data) {
        document.getElementById('edit-id').value = data.id;
        document.getElementById('edit-nome').value = data.nome;
        document.getElementById('edit-doc').value = data.documento;
        document.getElementById('edit-tel').value = data.telefone;
    }
}

function closeEditModal() { document.getElementById('modal-edit')?.classList.remove('active'); }

async function saveCadastro(event) {
    event.preventDefault();
    const type = document.getElementById('edit-type').value;
    const data = {
        id: document.getElementById('edit-id').value || null,
        nome: document.getElementById('edit-nome').value,
        documento: document.getElementById('edit-doc').value,
        telefone: document.getElementById('edit-tel').value
    };
    const endpoint = type === 'cliente' ? '/clientes' : '/fornecedores';
    const res = await fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { showSuccess("Salvo!"); closeEditModal(); await loadDataFromAPI(); }
}

function openSearchModal(type) {
    const modal = document.getElementById('modal-search');
    if (!modal) return;
    modal.classList.add('active');
    const list = type === 'cliente' ? appData.clients : appData.suppliers;
    const tbody = document.getElementById('search-results');
    if (tbody) tbody.innerHTML = list.map(item => `
        <tr style="cursor:pointer" onclick="selectSearchItem('${item.nome}')">
            <td>${item.nome}</td><td>${item.documento}</td><td>${item.telefone}</td>
        </tr>
    `).join('');
}

function selectSearchItem(nome) {
    const prefix = currentSectionId === 'entrada' ? 'entry' : 'exit';
    const input = document.getElementById(`${prefix}-desc`);
    if (input) input.value = nome;
    closeSearchModal();
}

function closeSearchModal() { document.getElementById('modal-search')?.classList.remove('active'); }

function renderProductShowcase(section) {
    const container = document.getElementById('product-showcase');
    if (!container) return;
    container.innerHTML = appData.products.map(p => `
        <div class="product-card" onclick="selectProductPro('${p.nome}', '${section}', event)">
            <div class="product-icon-circle" style="background:${p.cor}20; color:${p.cor}"><i class="fas ${p.icone}"></i></div>
            <div class="product-name">${p.nome}</div>
            <div class="product-stock">${p.peso_por_caixa || 20} Kg/Cx</div>
        </div>
    `).join('');
}

function selectProductPro(nome, section, event) {
    const prefix = section === 'entrada' ? 'entry' : 'exit';
    const input = document.getElementById(`${prefix}-product`);
    if (input) input.value = nome;
    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

function renderStockTable() {
    const tbody = document.getElementById('full-table-body');
    if (!tbody) return;
    tbody.innerHTML = appData.transactions.map(t => `
        <tr>
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.produto}</td>
            <td>${t.descricao}</td>
            <td style="font-weight:700">${t.qtd_caixas || 0} Cx</td>
            <td style="font-weight:700">${t.peso_kg || 0} Kg</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR')}</td>
            <td><button class="btn-icon text-danger" onclick="deleteMovimentacao(${t.id})"><i class="fas fa-trash"></i></button></td>
        </tr>
    `).join('');
}

function renderEstoqueResumo() {
    const container = document.getElementById('estoque-resumo');
    if (!container) return;
    const totalCx = appData.transactions.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.qtd_caixas || 0) : -(t.qtd_caixas || 0)), 0);
    const totalKg = appData.transactions.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.peso_kg || 0) : -(t.peso_kg || 0)), 0);
    container.innerHTML = `
        <div class="panel" style="padding:16px; border-left:4px solid #166534">
            <p style="font-size:0.7rem; font-weight:700; color:var(--text-muted)">TOTAL CAIXAS</p>
            <h4>${totalCx} Cx</h4>
        </div>
        <div class="panel" style="padding:16px; border-left:4px solid #1e40af">
            <p style="font-size:0.7rem; font-weight:700; color:var(--text-muted)">TOTAL KG</p>
            <h4>${totalKg} Kg</h4>
        </div>
    `;
}

function updateFinanceKPIs() {
    const rec = appData.transactions.filter(t => t.tipo === 'saida').reduce((a, b) => a + b.valor, 0);
    const des = appData.transactions.filter(t => t.tipo === 'entrada' || t.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);
    document.getElementById('fin-total-in').innerText = `R$ ${rec.toLocaleString('pt-BR')}`;
    document.getElementById('fin-total-out').innerText = `R$ ${des.toLocaleString('pt-BR')}`;
    document.getElementById('fin-balance').innerText = `R$ ${(rec - des).toLocaleString('pt-BR')}`;
}

function renderFinanceTable() {
    const tbody = document.getElementById('finance-table-body');
    if (!tbody) return;
    tbody.innerHTML = appData.transactions.map(t => `
        <tr>
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.descricao}</td>
            <td style="color:${t.tipo === 'saida' ? 'green' : 'red'}">R$ ${t.valor.toLocaleString('pt-BR')}</td>
        </tr>
    `).join('');
}

async function loadConfigData() {
    const res = await fetchWithAuth('/configs');
    if (res && res.ok) {
        const configs = await res.json();
        const input = document.getElementById('config-peso-cx');
        if (input) input.value = configs.peso_por_caixa_padrao || 20;
    }
}

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = getLoginUrl(); return; }
    options.headers = { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(API_URL + url, options);
    if (res.status === 401) logout();
    return res;
}

function checkLogin() { if (!localStorage.getItem('token')) window.location.href = getLoginUrl(); }
function logout() { localStorage.clear(); window.location.href = getLoginUrl(); }
function showSuccess(msg) { const t = document.createElement('div'); t.className = 'toast success'; t.innerHTML = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3000); }
function showError(msg) { const t = document.createElement('div'); t.className = 'toast error'; t.innerHTML = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3000); }
function playSystemSound(id) { const s = document.getElementById(`sound-${id}`); if (s) s.play().catch(() => {}); }
