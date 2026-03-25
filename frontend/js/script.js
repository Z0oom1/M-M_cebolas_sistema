// M&M Cebolas - Core Script (v4.0 - Full Rewrite with NF-e, Admin, Cadastros)

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
};

function checkLogin() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
}

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
        } catch (e) {}
    } else {
        if (windowControls) windowControls.style.display = 'none';
    }

    // Set user info
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userName = userData.user?.label || userData.label || 'Usuário';
    const userRole = userData.role || userData.user?.role || 'funcionario';
    
    const userNameEl = document.getElementById('user-name');
    const userRoleEl = document.getElementById('user-role-badge');
    if (userNameEl) userNameEl.textContent = userName;
    if (userRoleEl) {
        userRoleEl.textContent = userRole.toUpperCase();
        userRoleEl.className = `badge ${userRole === 'admin' ? 'admin' : userRole === 'chefe' ? 'entrada' : 'operador'}`;
    }
    
    // Hide admin items for non-admins
    if (userRole !== 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
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
    
    // Close mobile sidebar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('active');
    
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-item[onclick*="'${id}'"]`);
    if (activeBtn) activeBtn.classList.add('active');

    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><div class="apple-loader-modern"></div></div>';

    fetch(`sections/${id}.html`)
        .then(res => {
            if (!res.ok) throw new Error('Section not found');
            return res.text();
        })
        .then(html => {
            mainContent.innerHTML = html;
            initSection(id);
        })
        .catch(err => {
            mainContent.innerHTML = `<div class="panel" style="padding:24px;text-align:center;margin:32px;">
                <i class="fas fa-exclamation-triangle fa-3x" style="color:var(--danger);margin-bottom:16px;"></i>
                <h3>Erro ao carregar seção</h3>
                <p style="color:var(--text-muted);">Verifique sua conexão ou tente novamente.</p>
            </div>`;
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
    if (id === 'nfe') loadNFeSection();
    if (id === 'config') loadConfigSection(isAdmin);
    if (id === 'admin') {
        if (!isAdmin) { showSection('dashboard'); return; }
        loadAdminSection();
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('active');
}

// =============================================
// DASHBOARD
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

function calcularDashboardLocal() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let totalCaixas = 0, totalKg = 0, receitaMes = 0, despesasMes = 0;
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
        const caixas = t.qtd_caixas || 0;
        const kg = t.peso_kg || 0;

        if (t.tipo === 'entrada') {
            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
            stockByCaixas[t.produto] += caixas;
            stockByKg[t.produto] += kg;
            totalCaixas += caixas;
            totalKg += kg;
            if (isCurrentMonth) despesasMes += t.valor;
            if (monthlyData[monthKey]) { monthlyData[monthKey].despesa += t.valor; monthlyData[monthKey].caixas_entrada += caixas; monthlyData[monthKey].kg_entrada += kg; }
        } else if (t.tipo === 'saida') {
            if (!stockByCaixas[t.produto]) { stockByCaixas[t.produto] = 0; stockByKg[t.produto] = 0; }
            stockByCaixas[t.produto] -= caixas;
            stockByKg[t.produto] -= kg;
            totalCaixas -= caixas;
            totalKg -= kg;
            if (isCurrentMonth) receitaMes += t.valor;
            if (monthlyData[monthKey]) { monthlyData[monthKey].receita += t.valor; monthlyData[monthKey].caixas_saida += caixas; monthlyData[monthKey].kg_saida += kg; }
        }
    });

    const topProdutos = Object.entries(stockByCaixas)
        .map(([nome, caixas]) => ({ nome, caixas: Math.round(caixas * 10) / 10, kg: Math.round((stockByKg[nome] || 0) * 10) / 10 }))
        .filter(p => p.caixas > 0).sort((a, b) => b.caixas - a.caixas).slice(0, 5);

    return {
        estoque: { totalCaixas: Math.round(totalCaixas * 10) / 10, totalKg: Math.round(totalKg * 10) / 10, porProduto: topProdutos },
        financeiro: { receitaMes, despesasMes, lucroMes: receitaMes - despesasMes, receitaTotal: 0, despesasTotal: 0, lucroTotal: 0 },
        mensal: monthlyData,
        ultimasMovimentacoes: appData.transactions.slice(0, 10)
    };
}

function renderDashboardPro(data) {
    if (!data) return;
    renderKPIs(data);
    renderMainChart(data);
    renderDistributionChart(data);
    renderSupplierRanking(data);
    renderInventoryTable(data);
    renderRecentOps(data.ultimasMovimentacoes);
}

function renderKPIs(data) {
    const container = document.getElementById('kpi-container');
    if (!container) return;
    const kpis = [
        { label: 'Volume em Caixas', value: `${(data.estoque.totalCaixas || 0).toLocaleString('pt-BR')} Cx`, icon: 'fa-boxes', color: '#166534', bg: '#dcfce7' },
        { label: 'Volume em Peso', value: `${(data.estoque.totalKg || 0).toLocaleString('pt-BR')} Kg`, icon: 'fa-weight-hanging', color: '#1e40af', bg: '#dbeafe' },
        { label: 'Receita (Mês)', value: `R$ ${(data.financeiro.receitaMes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: 'fa-hand-holding-usd', color: '#065f46', bg: '#d1fae5' },
        { label: 'Lucro Estimado', value: `R$ ${(data.financeiro.lucroMes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: 'fa-coins', color: '#92400e', bg: '#fef3c7' }
    ];
    container.innerHTML = kpis.map(kpi => `
        <div class="panel" style="padding: 20px; display: flex; align-items: center; gap: 16px; border-left: 4px solid ${kpi.color};">
            <div style="width: 48px; height: 48px; background: ${kpi.bg}; color: ${kpi.color}; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; flex-shrink:0;">
                <i class="fas ${kpi.icon}"></i>
            </div>
            <div>
                <p style="font-size: 0.65rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase;">${kpi.label}</p>
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
    const labels = Object.keys(data.mensal || {}).map(k => {
        const [year, month] = k.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });
    });
    const values = Object.values(data.mensal || {});
    let datasets = [];
    if (metric === 'financeiro') {
        datasets = [
            { label: 'Receita', data: values.map(v => v.receita), backgroundColor: '#22c55e', borderColor: '#22c55e', tension: 0.4 },
            { label: 'Despesas', data: values.map(v => v.despesa), backgroundColor: '#ef4444', borderColor: '#ef4444', tension: 0.4 }
        ];
    } else {
        datasets = [
            { label: 'Entrada', data: values.map(v => metric === 'volume_cx' ? v.caixas_entrada : v.kg_entrada), backgroundColor: '#1A5632', borderColor: '#1A5632' },
            { label: 'Saída', data: values.map(v => metric === 'volume_cx' ? v.caixas_saida : v.kg_saida), backgroundColor: '#f59e0b', borderColor: '#f59e0b' }
        ];
    }
    mainChart = new Chart(ctx, { type: dashboardChartType, data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false } });
}

function renderDistributionChart(data) {
    const ctx = document.getElementById('distributionChart');
    if (!ctx) return;
    if (distributionChart) distributionChart.destroy();
    const prods = (data.estoque || {}).porProduto || [];
    if (prods.length === 0) return;
    distributionChart = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: prods.map(p => p.nome), datasets: [{ data: prods.map(p => p.caixas), backgroundColor: ['#1A5632', '#22c55e', '#3b82f6', '#f59e0b', '#ef4444'], borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
    });
}

function renderSupplierRanking(data) {
    const tbody = document.getElementById('dash-supplier-ranking');
    if (!tbody) return;
    const ranking = {};
    appData.transactions.filter(t => t.tipo === 'entrada').forEach(t => {
        if (!ranking[t.descricao]) ranking[t.descricao] = { nome: t.descricao, caixas: 0, valor: 0 };
        ranking[t.descricao].caixas += (t.qtd_caixas || 0);
        ranking[t.descricao].valor += t.valor;
    });
    const sorted = Object.values(ranking).sort((a, b) => b.valor - a.valor).slice(0, 5);
    tbody.innerHTML = sorted.length > 0 ? sorted.map(s => `<tr><td><strong>${s.nome || '-'}</strong></td><td style="text-align:center;">${s.caixas}</td><td style="text-align:right; font-weight:700; color:var(--primary);">R$ ${s.valor.toLocaleString('pt-BR')}</td><td><span class="badge entrada">Ativo</span></td></tr>`).join('') 
    : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum dado</td></tr>';
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('dash-inventory-table');
    if (!tbody) return;
    const prods = (data.estoque || {}).porProduto || [];
    tbody.innerHTML = prods.length > 0 ? prods.map(p => `<tr><td><strong>${p.nome}</strong></td><td style="text-align:center; font-weight:700;">${p.caixas}</td><td style="text-align:center;">${p.kg}</td><td><i class="fas fa-arrow-up" style="color:#22c55e;"></i></td></tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum produto em estoque</td></tr>';
}

function renderRecentOps(transactions) {
    const tbody = document.getElementById('dash-recent-ops');
    if (!tbody) return;
    tbody.innerHTML = (transactions || []).slice(0, 8).map(t => `
        <tr>
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td><strong>${t.descricao || '-'}</strong></td>
            <td>${t.produto}</td>
            <td style="text-align:center; font-weight:700;">${t.qtd_caixas || t.quantidade} Cx</td>
            <td style="text-align:right; font-weight:700;">R$ ${t.valor.toLocaleString('pt-BR')}</td>
            <td style="text-align:right;"><button class="btn-icon" onclick="showSection('estoque')"><i class="fas fa-eye"></i></button></td>
        </tr>`).join('');
}

function setChartType(type) {
    dashboardChartType = type;
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-chart-${type}`)?.classList.add('active');
    if (dashboardData) renderMainChart(dashboardData);
}

function updateMainChart() {
    if (dashboardData) renderMainChart(dashboardData);
}

function refreshDashboard() {
    loadDashboard();
}

// =============================================
// CADASTROS - separado de config
// =============================================
function loadCadastros() {
    renderClientesTable();
    renderFornecedoresTable();
    renderProdutosTable();
}

function renderClientesTable() {
    const tbody = document.getElementById('list-clientes');
    if (!tbody) return;
    tbody.innerHTML = appData.clients.length > 0 ? appData.clients.map(c => `
        <tr>
            <td><strong>${c.nome}</strong></td>
            <td>${c.documento || '-'}</td>
            <td>${c.telefone || '-'}</td>
            <td>${c.email || '-'}</td>
            <td>
                <button class="btn-icon" onclick="openEditModal('cliente', ${JSON.stringify(c).replace(/"/g, '&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('cliente', ${c.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') 
    : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum cliente cadastrado</td></tr>';
}

function renderFornecedoresTable() {
    const tbody = document.getElementById('list-fornecedores');
    if (!tbody) return;
    tbody.innerHTML = appData.suppliers.length > 0 ? appData.suppliers.map(f => `
        <tr>
            <td><strong>${f.nome}</strong></td>
            <td>${f.documento || '-'}</td>
            <td>${f.telefone || '-'}</td>
            <td>${f.email || '-'}</td>
            <td>
                <button class="btn-icon" onclick="openEditModal('fornecedor', ${JSON.stringify(f).replace(/"/g, '&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('fornecedor', ${f.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum fornecedor cadastrado</td></tr>';
}

function renderProdutosTable() {
    const tbody = document.getElementById('list-produtos');
    if (!tbody) return;
    tbody.innerHTML = appData.products.length > 0 ? appData.products.map(p => `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;background:${p.cor || '#1A5632'}20;color:${p.cor || '#1A5632'};border-radius:8px;display:flex;align-items:center;justify-content:center;">
                        <i class="fas ${p.icone || 'fa-box'}"></i>
                    </div>
                    <strong>${p.nome}</strong>
                </div>
            </td>
            <td>${p.ncm || '-'}</td>
            <td>R$ ${(p.preco_venda || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</td>
            <td>${p.peso_por_caixa || 20} Kg/Cx</td>
            <td>
                <button class="btn-icon" onclick="openProdutoModal(${JSON.stringify(p).replace(/"/g, '&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('produto', ${p.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum produto cadastrado</td></tr>';
}

async function deleteCadastro(type, id) {
    if (!confirm(`Deseja realmente excluir este ${type}?`)) return;
    const res = await fetchWithAuth(`/cadastros/${type}/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} excluído!`);
        await loadDataFromAPI();
    } else {
        showError('Erro ao excluir.');
    }
}

// =============================================
// MODAL EDIÇÃO CONTATOS
// =============================================
function openEditModal(type, data = null) {
    const modal = document.getElementById('modal-edit');
    if (!modal) return;
    modal.classList.add('active');
    
    const title = document.getElementById('modal-title');
    if (title) title.innerText = data ? `Editar ${type === 'cliente' ? 'Cliente' : 'Fornecedor'}` : `Novo ${type === 'cliente' ? 'Cliente' : 'Fornecedor'}`;
    
    document.getElementById('edit-type').value = type;
    document.getElementById('edit-id').value = data ? data.id : '';
    document.getElementById('edit-doc-type').value = data?.documento?.replace(/\D/g,'').length === 14 ? 'CNPJ' : 'CPF';
    document.getElementById('edit-doc').value = data ? data.documento : '';
    document.getElementById('edit-nome').value = data ? data.nome : '';
    document.getElementById('edit-ie').value = data ? (data.ie || '') : '';
    document.getElementById('edit-tel').value = data ? (data.telefone || '') : '';
    document.getElementById('edit-email').value = data ? (data.email || '') : '';
    document.getElementById('edit-end').value = data ? (data.endereco || '') : '';
    
    updateDocMask();
}

function closeEditModal() { document.getElementById('modal-edit')?.classList.remove('active'); }

function updateDocMask() {
    const type = document.getElementById('edit-doc-type')?.value;
    const label = document.getElementById('label-doc');
    const input = document.getElementById('edit-doc');
    if (label) label.textContent = type || 'CNPJ';
    if (input) input.placeholder = type === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00';
}

async function consultarDocumento() {
    const doc = document.getElementById('edit-doc')?.value?.replace(/\D/g, '');
    const type = document.getElementById('edit-doc-type')?.value;
    
    if (!doc || doc.length < 11) { showError('Documento inválido'); return; }
    
    const btn = document.querySelector('[onclick="consultarDocumento()"]');
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; btn.disabled = true; }
    
    try {
        const res = await fetchWithAuth(`/consultar/${type}/${doc}`);
        if (res && res.ok) {
            const data = await res.json();
            if (data.nome || data.razao_social || data.fantasia) {
                document.getElementById('edit-nome').value = data.nome || data.razao_social || '';
                document.getElementById('edit-tel').value = data.telefone || '';
                document.getElementById('edit-email').value = data.email || '';
                
                // Montar endereço
                const parts = [data.logradouro, data.numero, data.bairro, data.municipio, data.uf].filter(Boolean);
                if (parts.length) document.getElementById('edit-end').value = parts.join(', ');
                
                showSuccess('Dados preenchidos automaticamente!');
            }
        } else {
            const err = res ? await res.json() : {};
            showError(err.error || 'Erro ao consultar');
        }
    } catch (e) {
        showError('Erro de conexão');
    } finally {
        if (btn) { btn.innerHTML = '<i class="fas fa-search"></i>'; btn.disabled = false; }
    }
}

async function saveCadastro(event) {
    event.preventDefault();
    const type = document.getElementById('edit-type').value;
    const data = {
        id: document.getElementById('edit-id').value || null,
        nome: document.getElementById('edit-nome').value,
        documento: document.getElementById('edit-doc').value,
        ie: document.getElementById('edit-ie').value,
        telefone: document.getElementById('edit-tel').value,
        email: document.getElementById('edit-email').value,
        endereco: document.getElementById('edit-end').value
    };
    
    const endpoint = type === 'cliente' ? '/clientes' : '/fornecedores';
    const res = await fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess('Cadastro salvo!');
        closeEditModal();
        await loadDataFromAPI();
    } else {
        const err = res ? await res.json() : {};
        showError(err.error || 'Erro ao salvar');
    }
}

// =============================================
// PRODUTOS
// =============================================
function openProdutoModal(data = null) {
    const modal = document.getElementById('modal-produto');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('produto-modal-title').innerText = data ? 'Editar Produto' : 'Novo Produto';
    document.getElementById('prod-id').value = data ? data.id : '';
    document.getElementById('prod-nome').value = data ? data.nome : '';
    document.getElementById('prod-ncm').value = data ? (data.ncm || '07031011') : '07031011';
    document.getElementById('prod-preco').value = data ? data.preco_venda : '';
    document.getElementById('prod-peso-cx').value = data ? (data.peso_por_caixa || 20) : '20';
    document.getElementById('prod-icone').value = data ? (data.icone || 'fa-box') : 'fa-box';
    document.getElementById('prod-cor').value = data ? (data.cor || '#1A5632') : '#1A5632';
    
    document.querySelectorAll('.icon-option').forEach(opt => {
        opt.classList.toggle('active', opt.getAttribute('onclick')?.includes(data?.icone || 'fa-box'));
    });
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.toggle('active', opt.getAttribute('onclick')?.includes(data?.cor || '#1A5632'));
    });
}

function closeProdutoModal() { document.getElementById('modal-produto')?.classList.remove('active'); }

function selectIcon(el, icon) {
    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('prod-icone').value = icon;
}

function selectColor(el, color) {
    document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('prod-cor').value = color;
}

async function saveProduto(event) {
    event.preventDefault();
    const data = {
        id: document.getElementById('prod-id').value || null,
        nome: document.getElementById('prod-nome').value,
        ncm: document.getElementById('prod-ncm').value,
        preco_venda: parseFloat(document.getElementById('prod-preco').value || 0),
        peso_por_caixa: parseFloat(document.getElementById('prod-peso-cx').value || 20),
        icone: document.getElementById('prod-icone').value,
        cor: document.getElementById('prod-cor').value
    };
    const res = await fetchWithAuth('/produtos', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess('Produto salvo!');
        closeProdutoModal();
        await loadDataFromAPI();
    } else {
        showError('Erro ao salvar produto');
    }
}

// =============================================
// NF-E - SEÇÃO COMPLETA
// =============================================
async function loadNFeSection() {
    await loadNFeStats();
    await loadNFeTable();
}

async function loadNFeStats() {
    const res = await fetchWithAuth('/nfe');
    if (!res || !res.ok) return;
    const data = await res.json();
    
    const totalMes = data.reduce((acc, n) => {
        const nDate = new Date(n.data_emissao);
        const now = new Date();
        if (nDate.getMonth() === now.getMonth() && nDate.getFullYear() === now.getFullYear()) return acc + (n.valor || 0);
        return acc;
    }, 0);
    
    const totalEl = document.getElementById('nfe-total-mes');
    const pendEl = document.getElementById('nfe-pending-count');
    const totalCountEl = document.getElementById('nfe-total-count');
    
    if (totalEl) totalEl.innerText = `R$ ${totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    if (pendEl) pendEl.innerText = `${data.filter(n => n.status !== 'autorizada').length} Notas`;
    if (totalCountEl) totalCountEl.innerText = `${data.length} Notas`;
}

async function loadNFeTable() {
    const container = document.getElementById('nfe-dynamic-container');
    if (!container) return;
    
    container.innerHTML = '<div style="text-align:center;padding:40px;"><div class="apple-loader-modern" style="margin:0 auto;"></div></div>';
    
    const res = await fetchWithAuth('/nfe');
    if (!res) return;
    const data = await res.json();
    
    await loadNFeStats();

    if (data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:60px; color:var(--text-muted);"><i class="fas fa-file-invoice fa-3x" style="margin-bottom:16px;opacity:0.3;"></i><p>Nenhuma nota fiscal encontrada.</p></div>';
        return;
    }

    let groups = {};
    const monthFilter = document.getElementById('nfe-month-filter')?.value || 'all';
    const searchVal = document.getElementById('nfe-search-input')?.value?.toLowerCase() || '';
    
    let filteredData = data;
    
    // Apply month filter
    if (monthFilter !== 'all') {
        const now = new Date();
        filteredData = filteredData.filter(n => {
            const d = new Date(n.data_emissao);
            if (monthFilter === 'current') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
            if (monthFilter === 'last') {
                const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
                return d.getMonth() === lastMonth.getMonth() && d.getFullYear() === lastMonth.getFullYear();
            }
            return true;
        });
    }
    
    // Apply search filter
    if (searchVal) {
        filteredData = filteredData.filter(n => 
            (n.descricao || '').toLowerCase().includes(searchVal) ||
            (n.produto || '').toLowerCase().includes(searchVal) ||
            (n.chave_acesso || '').toLowerCase().includes(searchVal)
        );
    }

    filteredData.forEach(n => {
        let key;
        if (nfeGroupingMode === 'fornecedor') key = n.descricao || 'Não Identificado';
        else if (nfeGroupingMode === 'data') key = new Date(n.data_emissao).toLocaleDateString('pt-BR', {month:'long', year:'numeric'});
        else key = n.status || 'pendente';
        
        if (!groups[key]) groups[key] = [];
        groups[key].push(n);
    });

    if (Object.keys(groups).length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-muted);">Nenhuma nota encontrada com os filtros aplicados.</div>';
        return;
    }

    container.innerHTML = Object.entries(groups).map(([name, items], idx) => {
        const totalGrupo = items.reduce((a, b) => a + (b.valor || 0), 0);
        const autorizadas = items.filter(i => i.status === 'autorizada').length;
        return `
        <div class="nfe-group-content">
            <div class="nfe-group-header" onclick="toggleNFeGroup('group-${idx}')">
                <h5>
                    <i class="fas ${nfeGroupingMode === 'fornecedor' ? 'fa-user-tie' : nfeGroupingMode === 'data' ? 'fa-calendar' : 'fa-tag'}"></i> 
                    ${name}
                    <span style="font-size:0.7rem;font-weight:400;color:var(--text-muted)">${autorizadas}/${items.length} autorizadas</span>
                </h5>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-weight:700; color:var(--primary);">R$ ${totalGrupo.toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                    <span class="count-badge">${items.length}</span>
                    <i class="fas fa-chevron-down" style="transition:transform 0.2s"></i>
                </div>
            </div>
            <div id="group-${idx}" class="nfe-items-list">
                <div style="display:grid;grid-template-columns:110px 1fr 130px 120px 160px;padding:8px 20px;background:#f8fafc;font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;">
                    <span>Data</span><span>Produto / Chave</span><span style="text-align:right">Valor</span><span style="text-align:center">Status</span><span style="text-align:right">Ações</span>
                </div>
                ${items.map(n => `
                    <div class="nfe-list-item">
                        <span class="date">${new Date(n.data_emissao).toLocaleDateString('pt-BR')}</span>
                        <div class="info">
                            <span style="font-weight:700">${n.produto || '-'}</span>
                            <br><small style="color:var(--text-muted);font-size:0.7rem">${(n.chave_acesso || '').substring(0, 25)}...</small>
                        </div>
                        <span class="value" style="text-align:right">R$ ${(n.valor || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</span>
                        <div class="status">
                            <span class="badge ${n.status === 'autorizada' ? 'entrada' : n.status === 'cancelada' ? 'saida' : 'despesa'}">${(n.status || 'pendente').toUpperCase()}</span>
                        </div>
                        <div class="actions" style="display:flex;gap:4px;justify-content:flex-end">
                            <button class="btn-icon" onclick="downloadXML(${n.id})" title="Baixar XML"><i class="fas fa-code"></i></button>
                            <button class="btn-icon" onclick="downloadPDF(${n.id})" title="Baixar PDF/DANFE"><i class="fas fa-file-pdf" style="color:#ef4444"></i></button>
                            <button class="btn-icon text-danger" onclick="deleteNFe(${n.id})" title="Excluir"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>`;
    }).join('');
}

function toggleNFeGroup(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isHidden = el.style.display === 'none';
    el.style.display = isHidden ? 'block' : 'none';
    const header = el.previousElementSibling;
    const icon = header?.querySelector('.fa-chevron-down');
    if (icon) icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
}

function setNFeGrouping(mode) {
    nfeGroupingMode = mode;
    document.querySelectorAll('#nfe-section .filter-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-group-${mode === 'fornecedor' ? 'forn' : mode}`)?.classList.add('active');
    loadNFeTable();
}

function filterNFeBySearch(val) {
    loadNFeTable();
}

async function downloadXML(id) {
    const token = localStorage.getItem('token');
    const url = `${API_URL}/nfe/${id}/xml`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) { showError('Erro ao baixar XML'); return; }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `NFe_${id}.xml`;
        a.click();
    } catch (e) { showError('Erro ao baixar XML'); }
}

async function downloadPDF(id) {
    const token = localStorage.getItem('token');
    const url = `${API_URL}/nfe/${id}/pdf`;
    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) { showError('Erro ao gerar DANFE'); return; }
        const blob = await res.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `DANFE_${id}.pdf`;
        a.click();
    } catch (e) { showError('Erro ao gerar DANFE'); }
}

async function deleteNFe(id) {
    if (!confirm('Deseja realmente excluir esta NF-e?')) return;
    const res = await fetchWithAuth(`/nfe/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess('NF-e excluída!');
        loadNFeTable();
    } else {
        const err = res ? await res.json() : {};
        showError(err.error || 'Erro ao excluir');
    }
}

// =============================================
// GERAR NF-e
// =============================================
async function gerarNFeParaVenda(vendaId) {
    const modal = document.getElementById('modal-gerar-nfe');
    if (!modal) { showError('Modal de NF-e não encontrado'); return; }
    
    document.getElementById('nfe-venda-id').value = vendaId;
    
    // Preencher select de clientes
    const destSelect = document.getElementById('nfe-destinatario-id');
    if (destSelect) {
        destSelect.innerHTML = '<option value="">Selecione o destinatário...</option>' +
            appData.clients.map(c => `<option value="${c.id}">${c.nome} - ${c.documento || 'Sem doc'}</option>`).join('');
    }
    
    modal.classList.add('active');
}

function closeNFeModal() {
    document.getElementById('modal-gerar-nfe')?.classList.remove('active');
}

async function confirmarGerarNFe(event) {
    event.preventDefault();
    const vendaId = document.getElementById('nfe-venda-id').value;
    const destId = document.getElementById('nfe-destinatario-id').value;
    const destNome = document.getElementById('nfe-dest-nome').value;
    const destDoc = document.getElementById('nfe-dest-doc').value;
    
    if (!vendaId) { showError('Venda não identificada'); return; }
    
    const destinatario = destId ? appData.clients.find(c => c.id == destId) : { nome: destNome, documento: destDoc };
    
    if (!destinatario?.nome) { showError('Informe o destinatário'); return; }
    
    const btn = event.target.querySelector('button[type="submit"]') || event.submitter;
    const origText = btn?.innerHTML;
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...'; btn.disabled = true; }
    
    try {
        const res = await fetchWithAuth('/nfe/gerar', {
            method: 'POST',
            body: JSON.stringify({ venda_id: parseInt(vendaId), destinatario, itens: [] })
        });
        
        if (res && res.ok) {
            const data = await res.json();
            showSuccess(`NF-e gerada! Chave: ${(data.chave || '').substring(0, 20)}...`);
            closeNFeModal();
            if (currentSectionId === 'nfe') loadNFeTable();
        } else {
            const err = res ? await res.json() : {};
            showError(err.error || 'Erro ao gerar NF-e');
        }
    } catch (e) {
        showError('Erro ao gerar NF-e: ' + e.message);
    } finally {
        if (btn) { btn.innerHTML = origText; btn.disabled = false; }
    }
}

// =============================================
// CONFIGURAÇÕES
// =============================================
async function loadConfigSection(isAdmin) {
    // Load config values
    const pesoCxEl = document.getElementById('config-peso-cx');
    if (pesoCxEl) pesoCxEl.value = appData.configs.peso_por_caixa_padrao || 20;
    
    // NFe mode
    const nfeModo = appData.configs.nfe_modo || 'homologacao';
    document.querySelectorAll(`input[name="nfe_modo"]`).forEach(r => {
        r.checked = r.value === nfeModo;
    });
    
    if (!isAdmin) {
        document.querySelectorAll('.admin-config-section').forEach(el => el.style.display = 'none');
    }
}

async function savePesoPorCaixa() {
    const val = document.getElementById('config-peso-cx')?.value;
    if (!val || isNaN(parseFloat(val))) { showError('Valor inválido'); return; }
    
    const res = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'peso_por_caixa_padrao', valor: val }) });
    if (res && res.ok) {
        appData.configs.peso_por_caixa_padrao = val;
        showSuccess('Configuração salva!');
    }
}

async function updateNFeModo(modo) {
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || userData.user?.role;
    if (userRole !== 'admin') { showError('Apenas administradores podem alterar o modo NF-e'); return; }
    
    const res = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'nfe_modo', valor: modo }) });
    if (res && res.ok) {
        appData.configs.nfe_modo = modo;
        showSuccess(`Modo NF-e alterado para: ${modo.toUpperCase()}`);
    }
}

async function saveCertPassword() {
    const val = document.getElementById('cert-password')?.value;
    if (!val) { showError('Digite a senha'); return; }
    
    const res = await fetchWithAuth('/configs', { method: 'POST', body: JSON.stringify({ chave: 'cert_password', valor: val }) });
    if (res && res.ok) {
        showSuccess('Senha do certificado salva!');
        document.getElementById('cert-password').value = '';
    }
}

// =============================================
// ADMIN SECTION
// =============================================
async function loadAdminSection() {
    renderUsuariosTable();
    renderAdminClientesTable();
    renderAdminFornecedoresTable();
    renderAdminProdutosTable();
    loadLogs();
}

function renderUsuariosTable() {
    const tbody = document.getElementById('list-usuarios');
    if (!tbody) return;
    tbody.innerHTML = appData.users.length > 0 ? appData.users.map(u => `
        <tr>
            <td><strong>${u.label}</strong></td>
            <td><code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;">${u.username}</code></td>
            <td><span class="badge ${u.role === 'admin' ? 'admin' : u.role === 'chefe' ? 'entrada' : 'operador'}">${u.role.toUpperCase()}</span></td>
            <td style="text-align:right;">
                <button class="btn-icon" onclick="openUsuarioModal(${JSON.stringify(u).replace(/"/g,'&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteUsuario(${u.id})" ${u.role === 'admin' ? 'title="Cuidado ao excluir admin"' : ''}><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum usuário</td></tr>';
}

function renderAdminClientesTable() {
    const tbody = document.getElementById('admin-list-clientes');
    if (!tbody) return;
    tbody.innerHTML = appData.clients.map(c => `
        <tr>
            <td><strong>${c.nome}</strong><br><small style="color:var(--text-muted)">${c.documento || ''}</small></td>
            <td style="text-align:right;">
                <button class="btn-icon" onclick="openEditModal('cliente', ${JSON.stringify(c).replace(/"/g,'&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('cliente', ${c.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum cliente</td></tr>';
}

function renderAdminFornecedoresTable() {
    const tbody = document.getElementById('admin-list-fornecedores');
    if (!tbody) return;
    tbody.innerHTML = appData.suppliers.map(f => `
        <tr>
            <td><strong>${f.nome}</strong><br><small style="color:var(--text-muted)">${f.documento || ''}</small></td>
            <td style="text-align:right;">
                <button class="btn-icon" onclick="openEditModal('fornecedor', ${JSON.stringify(f).replace(/"/g,'&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('fornecedor', ${f.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum fornecedor</td></tr>';
}

function renderAdminProdutosTable() {
    const tbody = document.getElementById('admin-list-produtos');
    if (!tbody) return;
    tbody.innerHTML = appData.products.map(p => `
        <tr>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div style="width:28px;height:28px;background:${p.cor||'#1A5632'}20;color:${p.cor||'#1A5632'};border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:0.8rem;">
                        <i class="fas ${p.icone||'fa-box'}"></i>
                    </div>
                    <div><strong>${p.nome}</strong><br><small style="color:var(--text-muted)">${p.peso_por_caixa||20} Kg/Cx</small></div>
                </div>
            </td>
            <td style="text-align:right;">
                <button class="btn-icon" onclick="openProdutoModal(${JSON.stringify(p).replace(/"/g,'&quot;')})"><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('produto', ${p.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="2" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum produto</td></tr>';
}

function openUsuarioModal(data = null) {
    const modal = document.getElementById('modal-usuario');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('user-modal-title').innerText = data ? 'Editar Usuário' : 'Novo Usuário';
    document.getElementById('user-id').value = data ? data.id : '';
    document.getElementById('user-label').value = data ? data.label : '';
    document.getElementById('user-username').value = data ? data.username : '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = data ? data.role : 'funcionario';
    
    const passLabel = modal.querySelector('label[for="user-password"]');
    if (passLabel) passLabel.textContent = data ? 'Nova Senha (deixe em branco para manter)' : 'Senha *';
}

function closeUsuarioModal() { document.getElementById('modal-usuario')?.classList.remove('active'); }

async function saveUsuario(event) {
    event.preventDefault();
    const data = {
        id: document.getElementById('user-id').value || null,
        label: document.getElementById('user-label').value,
        username: document.getElementById('user-username').value,
        password: document.getElementById('user-password').value,
        role: document.getElementById('user-role').value
    };
    
    if (!data.id && !data.password) { showError('Senha é obrigatória para novos usuários'); return; }
    
    const res = await fetchWithAuth('/usuarios', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess('Usuário salvo!');
        closeUsuarioModal();
        await loadDataFromAPI();
        renderUsuariosTable();
    } else {
        const err = res ? await res.json() : {};
        showError(err.error || 'Erro ao salvar usuário');
    }
}

async function deleteUsuario(id) {
    const currentUser = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const currentId = currentUser.user?.id || currentUser.id;
    if (id == currentId) { showError('Você não pode excluir sua própria conta!'); return; }
    if (!confirm('Deseja realmente excluir este usuário?')) return;
    
    const res = await fetchWithAuth(`/usuarios/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess('Usuário excluído!');
        await loadDataFromAPI();
        renderUsuariosTable();
    } else {
        showError('Erro ao excluir usuário');
    }
}

async function loadLogs() {
    const tbody = document.getElementById('list-logs');
    if (!tbody) return;
    
    const res = await fetchWithAuth('/logs');
    if (!res || !res.ok) return;
    const logs = await res.json();
    
    tbody.innerHTML = logs.slice(0, 100).map(l => `
        <tr>
            <td style="font-size:0.75rem;">${new Date(l.data).toLocaleString('pt-BR')}</td>
            <td><strong>${l.username}</strong></td>
            <td><span style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:0.75rem;">${l.acao}</span></td>
            <td style="font-size:0.8rem;">${l.detalhes || '-'}</td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum log</td></tr>';
}

async function resetSystem() {
    if (!confirm('⚠️ ATENÇÃO: Isso apagará TODOS os dados. Esta ação é irreversível!\n\nDeseja continuar?')) return;
    const password = prompt('Digite a senha de administrador para confirmar:');
    if (!password) return;
    
    const res = await fetchWithAuth('/reset', { method: 'DELETE', body: JSON.stringify({ password }) });
    if (res && res.ok) {
        showSuccess('Sistema resetado com sucesso!');
        setTimeout(() => window.location.reload(), 1500);
    } else {
        showError('Erro ao resetar sistema. Verifique sua senha.');
    }
}

// =============================================
// MOVIMENTAÇÕES - ENTRADA/SAÍDA
// =============================================
function toggleQuantityMode(prefix) {
    const unitSelect = document.getElementById(`${prefix}-unit`);
    if (!unitSelect) return;
    const mode = unitSelect.value;
    const simpleDiv = document.getElementById(`${prefix}-qty-simple`);
    const ambosDiv = document.getElementById(`${prefix}-qty-ambos-row`);
    const qtyLabel = document.getElementById(`${prefix}-qty-label`);
    
    if (mode === 'AMBOS') {
        if (simpleDiv) simpleDiv.style.display = 'none';
        if (ambosDiv) ambosDiv.style.display = 'flex';
    } else {
        if (simpleDiv) simpleDiv.style.display = 'block';
        if (ambosDiv) ambosDiv.style.display = 'none';
        if (qtyLabel) qtyLabel.innerText = mode === 'CX' ? 'Quantidade (Caixas)' : 'Quantidade (Kg)';
    }
    updatePesoCalc(prefix);
}

function updatePesoCalc(prefix) {
    const unitSelect = document.getElementById(`${prefix}-unit`);
    const qtyInput = document.getElementById(`${prefix}-qty`);
    const pesoCalc = document.getElementById(`${prefix}-peso-calc`);
    if (!unitSelect || !qtyInput || !pesoCalc) return;
    
    const mode = unitSelect.value;
    const qty = parseFloat(qtyInput.value || 0);
    const pesoPorCaixa = getPesoPorCaixa(prefix);
    
    if (qty > 0) {
        if (mode === 'CX') pesoCalc.innerText = `≈ ${(qty * pesoPorCaixa).toFixed(1)} Kg`;
        else if (mode === 'KG') pesoCalc.innerText = `≈ ${(qty / pesoPorCaixa).toFixed(1)} Cx`;
    } else {
        pesoCalc.innerText = '';
    }
}

function calcPesoFromCaixas(prefix) {
    const caixasInput = document.getElementById(`${prefix}-qtd-caixas`);
    const pesoInput = document.getElementById(`${prefix}-peso-kg`);
    if (!caixasInput || !pesoInput) return;
    const caixas = parseFloat(caixasInput.value || 0);
    const pesoPorCaixa = getPesoPorCaixa(prefix);
    if (caixas > 0) pesoInput.value = (caixas * pesoPorCaixa).toFixed(1);
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
    if (!produto) { showError('Selecione um produto na vitrine acima.'); return; }
    if (quantidade <= 0 && qtd_caixas <= 0) { showError('Informe a quantidade.'); return; }

    const data = {
        tipo: type,
        produto,
        quantidade,
        unidade,
        peso_kg,
        qtd_caixas,
        valor: parseFloat(document.getElementById(`${prefix}-value`)?.value || 0),
        descricao: document.getElementById(`${prefix}-desc`)?.value || '',
        data: document.getElementById(`${prefix}-date`)?.value || new Date().toISOString().split('T')[0]
    };

    const btn = event.target.querySelector('[type="submit"]');
    const origText = btn?.innerHTML;
    if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; btn.disabled = true; }

    const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        const saved = await res.json();
        showSuccess(type === 'entrada' ? 'Compra registrada!' : 'Venda registrada!');
        
        // Offer to generate NF-e for sales
        if (type === 'saida' && saved.id) {
            setTimeout(() => {
                if (confirm('Deseja emitir uma NF-e para esta venda?')) {
                    gerarNFeParaVenda(saved.id);
                }
            }, 500);
        }
        
        await loadDataFromAPI();
        event.target.reset();
        const dateInput = document.getElementById(`${prefix}-date`);
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
        if (document.getElementById(`${prefix}-product`)) document.getElementById(`${prefix}-product`).value = '';
        toggleQuantityMode(prefix);
    } else {
        const err = res ? await res.json() : {};
        showError(err.error || 'Erro ao registrar');
    }
    if (btn) { btn.innerHTML = origText; btn.disabled = false; }
}

function getPesoPorCaixa(prefix) {
    const prodName = document.getElementById(`${prefix}-product`)?.value;
    const product = appData.products.find(p => p.nome === prodName);
    return product ? product.peso_por_caixa : parseFloat(appData.configs.peso_por_caixa_padrao || 20);
}

// =============================================
// ESTOQUE
// =============================================
function renderStockTable() {
    const tbody = document.getElementById('full-table-body');
    if (!tbody) return;
    tbody.innerHTML = appData.transactions.map(t => `
        <tr>
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.produto}</td>
            <td>${t.descricao || '-'}</td>
            <td style="font-weight:700">${t.qtd_caixas || 0} Cx</td>
            <td style="font-weight:700">${t.peso_kg || 0} Kg</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR')}</td>
            <td>
                <button class="btn-icon text-danger" onclick="deleteMovimentacao(${t.id})"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('') || '<tr><td colspan="8" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhuma movimentação</td></tr>';
}

function renderEstoqueResumo() {
    const container = document.getElementById('estoque-resumo');
    if (!container) return;
    const totalCx = appData.transactions.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.qtd_caixas || 0) : -(t.qtd_caixas || 0)), 0);
    const totalKg = appData.transactions.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.peso_kg || 0) : -(t.peso_kg || 0)), 0);
    container.innerHTML = `
        <div class="panel" style="padding:16px; border-left:4px solid #166534">
            <p style="font-size:0.7rem; font-weight:700; color:var(--text-muted)">TOTAL CAIXAS</p>
            <h4 style="font-size:1.4rem;font-weight:800;color:#166534">${Math.round(totalCx * 10) / 10} Cx</h4>
        </div>
        <div class="panel" style="padding:16px; border-left:4px solid #1e40af">
            <p style="font-size:0.7rem; font-weight:700; color:var(--text-muted)">TOTAL KG</p>
            <h4 style="font-size:1.4rem;font-weight:800;color:#1e40af">${Math.round(totalKg * 10) / 10} Kg</h4>
        </div>`;
}

async function deleteMovimentacao(id) {
    if (!confirm('Deseja realmente excluir esta movimentação?')) return;
    const res = await fetchWithAuth(`/movimentacoes/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess('Movimentação excluída!');
        await loadDataFromAPI();
    }
}

// =============================================
// FINANCEIRO
// =============================================
function updateFinanceKPIs() {
    const rec = appData.transactions.filter(t => t.tipo === 'saida').reduce((a, b) => a + b.valor, 0);
    const des = appData.transactions.filter(t => t.tipo === 'entrada' || t.tipo === 'despesa').reduce((a, b) => a + b.valor, 0);
    const saldo = rec - des;
    
    const balEl = document.getElementById('fin-balance');
    const inEl = document.getElementById('fin-total-in');
    const outEl = document.getElementById('fin-total-out');
    
    if (inEl) inEl.innerText = `R$ ${rec.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
    if (outEl) outEl.innerText = `R$ ${des.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
    if (balEl) {
        balEl.innerText = `R$ ${saldo.toLocaleString('pt-BR', {minimumFractionDigits:2})}`;
        balEl.style.color = saldo >= 0 ? '#166534' : '#dc2626';
    }
}

function renderFinanceTable() {
    const tbody = document.getElementById('finance-table-body');
    if (!tbody) return;
    tbody.innerHTML = appData.transactions.map(t => `
        <tr>
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.descricao || '-'}</td>
            <td style="font-weight:700;color:${t.tipo === 'saida' ? '#059669' : '#dc2626'}">
                ${t.tipo === 'saida' ? '+' : '-'} R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits:2})}
            </td>
        </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum lançamento</td></tr>';
}

async function saveDespesa(event) {
    event.preventDefault();
    const data = {
        tipo: 'despesa',
        produto: 'Despesa',
        quantidade: 0,
        valor: parseFloat(document.getElementById('desp-valor')?.value || 0),
        descricao: document.getElementById('desp-desc')?.value || '',
        data: document.getElementById('desp-data')?.value || new Date().toISOString().split('T')[0],
        unidade: 'CX',
        peso_kg: 0,
        qtd_caixas: 0
    };
    const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess('Despesa registrada!');
        await loadDataFromAPI();
        updateFinanceKPIs();
        renderFinanceTable();
        event.target.reset();
    }
}

// =============================================
// VITRINE DE PRODUTOS
// =============================================
function renderProductShowcase(section) {
    const container = document.getElementById('product-showcase');
    if (!container) return;
    if (appData.products.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-muted);grid-column:1/-1"><i class="fas fa-box-open fa-2x" style="margin-bottom:10px;opacity:0.3;"></i><p>Nenhum produto cadastrado.<br><a href="#" onclick="showSection(\'cadastro\')" style="color:var(--primary)">Cadastrar produtos</a></p></div>';
        return;
    }
    container.innerHTML = appData.products.map(p => `
        <div class="product-card" onclick="selectProductPro('${p.nome}', '${section}', event)">
            <div class="product-icon-circle" style="background:${p.cor || '#1A5632'}20; color:${p.cor || '#1A5632'}"><i class="fas ${p.icone || 'fa-box'}"></i></div>
            <div class="product-name">${p.nome}</div>
            <div class="product-stock">${p.peso_por_caixa || 20} Kg/Cx</div>
        </div>`).join('');
}

function selectProductPro(nome, section, event) {
    const prefix = section === 'entrada' ? 'entry' : 'exit';
    const input = document.getElementById(`${prefix}-product`);
    if (input) input.value = nome;
    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
    event.currentTarget.classList.add('active');
    updatePesoCalc(prefix);
}

// =============================================
// BUSCA DE CONTATOS
// =============================================
function openSearchModal(type) {
    const modal = document.getElementById('modal-search');
    if (!modal) return;
    modal.classList.add('active');
    
    const title = modal.querySelector('h4');
    if (title) title.innerText = `Selecionar ${type === 'cliente' ? 'Cliente' : 'Fornecedor'}`;
    
    const results = document.getElementById('search-results');
    const items = type === 'cliente' ? appData.clients : appData.suppliers;
    
    if (!results) return;
    results.innerHTML = items.length > 0 ? items.map(item => `
        <tr>
            <td class="search-item" onclick="selectContact('${type}', '${item.nome.replace(/'/g, "\\'")}')" style="cursor:pointer">
                <strong>${item.nome}</strong><br>
                <small style="color:var(--text-muted)">${item.documento || 'Sem documento'} | ${item.telefone || 'Sem telefone'}</small>
            </td>
        </tr>`).join('')
    : '<tr><td style="text-align:center;padding:20px;color:var(--text-muted)">Nenhum cadastro encontrado</td></tr>';
    
    modal._type = type;
}

function selectContact(type, nome) {
    const prefix = document.getElementById('entry-desc') ? 'entry' : 'exit';
    const field = type === 'cliente' 
        ? (document.getElementById('exit-desc') ? 'exit-desc' : 'entry-desc')
        : (document.getElementById('entry-desc') ? 'entry-desc' : 'exit-desc');
    const el = document.getElementById(field);
    if (el) el.value = nome;
    closeSearchModal();
}

function closeSearchModal() { document.getElementById('modal-search')?.classList.remove('active'); }

// =============================================
// UTILITÁRIOS
// =============================================
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return null; }
    options.headers = { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    try {
        const res = await fetch(API_URL + url, options);
        if (res.status === 401) { logout(); return null; }
        return res;
    } catch (e) {
        console.error('Fetch error:', e);
        return null;
    }
}

function logout() { localStorage.clear(); window.location.href = 'login.html'; }

function showSuccess(msg) {
    const t = document.createElement('div');
    t.className = 'toast success';
    t.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function showError(msg) {
    const t = document.createElement('div');
    t.className = 'toast error';
    t.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

// Dashboard helper functions
function setDashboardPeriod(period) {
    dashboardPeriod = period;
    document.querySelectorAll('.filter-btn[id^="btn-period"]').forEach(b => b.classList.remove('active'));
    document.getElementById(`btn-period-${period}`)?.classList.add('active');
    loadDashboard();
}

function openCustomFilterModal() { showSuccess('Filtro personalizado em breve!'); }

function filterDashTable(tableId, val) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const rows = table.querySelectorAll('tbody tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val.toLowerCase()) ? '' : 'none';
    });
}

function globalDashSearch(val) {
    const tbody = document.getElementById('dash-recent-ops');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val.toLowerCase()) ? '' : 'none';
    });
}


// =============================================
// FUNÇÃO AUXILIAR: Preencher Destinatário NF-e
// =============================================
function preencherDestNFe(select) {
    const clienteId = select.value;
    if (!clienteId) {
        document.getElementById('nfe-dest-nome').value = '';
        document.getElementById('nfe-dest-doc').value = '';
        return;
    }
    
    const cliente = appData.clients.find(c => c.id == clienteId);
    if (cliente) {
        document.getElementById('nfe-dest-nome').value = cliente.nome || '';
        document.getElementById('nfe-dest-doc').value = cliente.documento || '';
    }
}

// =============================================
// FUNÇÃO AUXILIAR: Fechar Modal de Busca
// =============================================
function closeSearchModal() {
    document.getElementById('modal-search')?.classList.remove('active');
}

function filterSearchModal(val) {
    const tbody = document.getElementById('search-results');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val.toLowerCase()) ? '' : 'none';
    });
}

// =============================================
// FUNÇÃO AUXILIAR: Abrir Modal de Usuário
// =============================================
function openUsuarioModal(data = null) {
    const modal = document.getElementById('modal-usuario');
    if (!modal) return;
    modal.classList.add('active');
    
    const title = document.getElementById('user-modal-title');
    if (title) title.innerText = data ? 'Editar Acesso' : 'Novo Acesso';
    
    document.getElementById('user-id').value = data ? data.id : '';
    document.getElementById('user-label').value = data ? data.label : '';
    document.getElementById('user-username').value = data ? data.username : '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = data ? data.role : 'funcionario';
    
    const passHint = document.getElementById('pass-hint');
    if (passHint) passHint.style.display = data ? 'none' : 'inline';
}

function closeUsuarioModal() {
    document.getElementById('modal-usuario')?.classList.remove('active');
}


// =============================================
// FUNÇÃO AUXILIAR: Alternar abas do painel admin
// =============================================
function switchAdminTab(tab, btn) {
    document.querySelectorAll('.admin-tab-content').forEach(t => t.style.display = 'none');
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('admin-tab-' + tab).style.display = 'block';
    btn.classList.add('active');
}
