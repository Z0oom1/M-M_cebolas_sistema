// M&M Cebolas - Core Script (v3.1 - Bug Fixes & Real-time NFe)

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
// DASHBOARD PROFISSIONAL
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
    const labels = Object.keys(data.mensal).map(k => {
        const [year, month] = k.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString('pt-BR', { month: 'short' });
    });
    const values = Object.values(data.mensal);
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
    const prods = data.estoque.porProduto;
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
    tbody.innerHTML = sorted.map(s => `<tr><td><strong>${s.nome}</strong></td><td style="text-align:center;">${s.caixas}</td><td style="text-align:right; font-weight:700; color:var(--primary);">R$ ${s.valor.toLocaleString('pt-BR')}</td><td><span class="badge entrada">Ativo</span></td></tr>`).join('');
}

function renderInventoryTable(data) {
    const tbody = document.getElementById('dash-inventory-table');
    if (!tbody) return;
    tbody.innerHTML = data.estoque.porProduto.map(p => `<tr><td><strong>${p.nome}</strong></td><td style="text-align:center; font-weight:700;">${p.caixas}</td><td style="text-align:center;">${p.kg}</td><td><i class="fas fa-arrow-up" style="color:#22c55e;"></i></td></tr>`).join('');
}

function renderRecentOps(transactions) {
    const tbody = document.getElementById('dash-recent-ops');
    if (!tbody) return;
    tbody.innerHTML = transactions.slice(0, 8).map(t => `<tr><td class="date">${new Date(t.data).toLocaleDateString('pt-BR')}</td><td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td><td><strong>${t.descricao || '-'}</strong></td><td>${t.produto}</td><td style="text-align:center; font-weight:700;">${t.qtd_caixas || t.quantidade} Cx</td><td style="text-align:right; font-weight:700;">R$ ${t.valor.toLocaleString('pt-BR')}</td><td style="text-align:right;"><button class="btn-icon" onclick="showSection('estoque')"><i class="fas fa-eye"></i></button></td></tr>`).join('');
}

// =============================================
// GESTÃO DE PRODUTOS
// =============================================

function openProdutoModal(data = null) {
    const modal = document.getElementById('modal-produto');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('produto-modal-title').innerText = data ? 'Editar Produto' : 'Novo Produto';
    document.getElementById('prod-id').value = data ? data.id : '';
    document.getElementById('prod-nome').value = data ? data.nome : '';
    document.getElementById('prod-ncm').value = data ? data.ncm : '07031011';
    document.getElementById('prod-preco').value = data ? data.preco_venda : '';
    document.getElementById('prod-peso-cx').value = data ? data.peso_por_caixa : '20';
    document.getElementById('prod-icone').value = data ? data.icone : 'fa-box';
    document.getElementById('prod-cor').value = data ? data.cor : '#1A5632';
    
    // Marcar ícone e cor selecionados
    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('active'));
    document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
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
        showSuccess("Produto salvo!");
        closeProdutoModal();
        await loadDataFromAPI();
    }
}

// =============================================
// GESTÃO DE NF-E ORGANIZADA
// =============================================

async function loadNFeTable() {
    const container = document.getElementById('nfe-dynamic-container');
    if (!container) return;
    const res = await fetchWithAuth('/nfe');
    if (!res) return;
    const data = await res.json();
    
    const totalMes = data.reduce((acc, n) => {
        const nDate = new Date(n.data_emissao);
        const now = new Date();
        if (nDate.getMonth() === now.getMonth() && nDate.getFullYear() === now.getFullYear()) return acc + (n.valor || 0);
        return acc;
    }, 0);
    
    document.getElementById('nfe-total-mes').innerText = `R$ ${totalMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
    document.getElementById('nfe-pending-count').innerText = `${data.filter(n => n.status !== 'autorizada').length} Notas`;

    if (data.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:40px;"><p>Nenhuma nota fiscal encontrada.</p></div>';
        return;
    }

    let groups = {};
    data.forEach(n => {
        const key = nfeGroupingMode === 'fornecedor' ? (n.descricao || 'Não Identificado') : (new Date(n.data_emissao).toLocaleDateString('pt-BR'));
        if (!groups[key]) groups[key] = [];
        groups[key].push(n);
    });

    container.innerHTML = Object.entries(groups).map(([name, items], idx) => `
        <div class="nfe-group-content">
            <div class="nfe-group-header" onclick="toggleNFeGroup('group-${idx}')">
                <h5><i class="fas fa-user-tie"></i> ${name}</h5>
                <div style="display: flex; align-items: center; gap: 15px;">
                    <span style="font-weight:700;">R$ ${items.reduce((a, b) => a + (b.valor || 0), 0).toLocaleString('pt-BR')}</span>
                    <span class="count-badge">${items.length}</span>
                    <i class="fas fa-chevron-down"></i>
                </div>
            </div>
            <div id="group-${idx}" class="nfe-items-list">
                ${items.map(n => `
                    <div class="nfe-list-item">
                        <span class="date">${new Date(n.data_emissao).toLocaleDateString('pt-BR')}</span>
                        <div class="info"><span>${n.produto}</span><br><small>${n.chave_acesso.substring(0, 20)}...</small></div>
                        <span class="value">R$ ${n.valor.toLocaleString('pt-BR')}</span>
                        <div class="status"><span class="badge ${n.status === 'autorizada' ? 'entrada' : 'saida'}">${n.status.toUpperCase()}</span></div>
                        <div class="actions">
                            <button class="btn-icon" onclick="downloadXML(${n.id})"><i class="fas fa-code"></i></button>
                            <button class="btn-icon" onclick="downloadPDF(${n.id})"><i class="fas fa-file-pdf"></i></button>
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

// =============================================
// DESIGN DE QUANTIDADE E OPERACIONAL
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
    if (!produto) { showError("Selecione um produto na vitrine acima."); return; }

    const data = {
        tipo: type,
        produto: produto,
        quantidade: quantidade,
        unidade: unidade,
        peso_kg: peso_kg,
        qtd_caixas: qtd_caixas,
        valor: parseFloat(document.getElementById(`${prefix}-value`)?.value || 0),
        descricao: document.getElementById(`${prefix}-desc`)?.value || '',
        data: document.getElementById(`${prefix}-date`)?.value || new Date().toISOString().split('T')[0]
    };

    const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess(type === 'entrada' ? "Compra registrada!" : "Venda registrada!");
        await loadDataFromAPI();
        event.target.reset();
        const dateInput = document.getElementById(`${prefix}-date`);
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
        
        // Limpar seleção de produto visual
        document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
        document.getElementById(`${prefix}-product`).value = '';
        
        toggleQuantityMode(prefix);
    }
}

function getPesoPorCaixa(prefix) {
    const prodName = document.getElementById(`${prefix}-product`)?.value;
    const product = appData.products.find(p => p.nome === prodName);
    return product ? product.peso_por_caixa : parseFloat(appData.configs.peso_por_caixa_padrao || 20);
}

// =============================================
// ADMIN E RESET
// =============================================

async function resetSystem() {
    if (!confirm("⚠️ ATENÇÃO: Isso apagará TODOS os dados (movimentações, NF-es, clientes, fornecedores e produtos). Deseja continuar?")) return;
    const password = prompt("Digite a senha de administrador para confirmar:");
    if (password !== 'admin') { alert("Senha incorreta."); return; }
    
    const res = await fetchWithAuth('/reset', { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess("Sistema resetado com sucesso!");
        setTimeout(() => window.location.reload(), 1500);
    }
}

// --- Funções Auxiliares ---
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return; }
    options.headers = { ...options.headers, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
    const res = await fetch(API_URL + url, options);
    if (res.status === 401) logout();
    return res;
}

function logout() { localStorage.clear(); window.location.href = 'login.html'; }
function showSuccess(msg) { const t = document.createElement('div'); t.className = 'toast success'; t.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`; document.body.appendChild(t); setTimeout(() => t.remove(), 3000); }
function showError(msg) { const t = document.createElement('div'); t.className = 'toast error'; t.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`; document.body.appendChild(t); setTimeout(() => t.remove(), 3000); }
function playSystemSound(id) { const s = document.getElementById(`sound-${id}`); if (s) s.play().catch(() => {}); }

function renderProductShowcase(section) {
    const container = document.getElementById('product-showcase');
    if (!container) return;
    container.innerHTML = appData.products.map(p => `
        <div class="product-card" onclick="selectProductPro('${p.nome}', '${section}', event)">
            <div class="product-icon-circle" style="background:${p.cor}20; color:${p.cor}"><i class="fas ${p.icone}"></i></div>
            <div class="product-name">${p.nome}</div>
            <div class="product-stock">${p.peso_por_caixa} Kg/Cx</div>
        </div>
    `).join('');
}

function selectProductPro(nome, section, event) {
    const prefix = section === 'entrada' ? 'entry' : 'exit';
    const input = document.getElementById(`${prefix}-product`);
    if (input) input.value = nome;
    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
    event.currentTarget.classList.add('active');
    updatePesoCalc(prefix);
}

function openEditModal(type, data = null) {
    const modal = document.getElementById('modal-edit');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('edit-type').value = type;
    document.getElementById('edit-id').value = data ? data.id : '';
    document.getElementById('edit-nome').value = data ? data.nome : '';
    document.getElementById('edit-doc').value = data ? data.documento : '';
    document.getElementById('edit-tel').value = data ? data.telefone : '';
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
    const res = await fetchWithAuth(type === 'cliente' ? '/clientes' : '/fornecedores', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { showSuccess("Cadastro salvo!"); closeEditModal(); await loadDataFromAPI(); }
}

function renderStockTable() {
    const tbody = document.getElementById('full-table-body');
    if (!tbody) return;
    tbody.innerHTML = appData.transactions.map(t => `<tr><td>${new Date(t.data).toLocaleDateString('pt-BR')}</td><td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td><td>${t.produto}</td><td>${t.descricao}</td><td style="font-weight:700">${t.qtd_caixas} Cx</td><td style="font-weight:700">${t.peso_kg} Kg</td><td>R$ ${t.valor.toLocaleString('pt-BR')}</td><td><button class="btn-icon text-danger" onclick="deleteMovimentacao(${t.id})"><i class="fas fa-trash"></i></button></td></tr>`).join('');
}

function renderEstoqueResumo() {
    const container = document.getElementById('estoque-resumo');
    if (!container) return;
    const totalCx = appData.transactions.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.qtd_caixas || 0) : -(t.qtd_caixas || 0)), 0);
    const totalKg = appData.transactions.reduce((acc, t) => acc + (t.tipo === 'entrada' ? (t.peso_kg || 0) : -(t.peso_kg || 0)), 0);
    container.innerHTML = `<div class="panel" style="padding:16px; border-left:4px solid #166534"><p style="font-size:0.7rem; font-weight:700; color:var(--text-muted)">TOTAL CAIXAS</p><h4>${totalCx} Cx</h4></div><div class="panel" style="padding:16px; border-left:4px solid #1e40af"><p style="font-size:0.7rem; font-weight:700; color:var(--text-muted)">TOTAL KG</p><h4>${totalKg} Kg</h4></div>`;
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
    tbody.innerHTML = appData.transactions.map(t => `<tr><td>${new Date(t.data).toLocaleDateString('pt-BR')}</td><td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td><td>${t.descricao}</td><td style="color:${t.tipo === 'saida' ? 'green' : 'red'}">R$ ${t.valor.toLocaleString('pt-BR')}</td></tr>`).join('');
}

async function loadConfigData() {
    const res = await fetchWithAuth('/configs');
    if (res && res.ok) {
        const configs = await res.json();
        const input = document.getElementById('config-peso-cx');
        if (input) input.value = configs.peso_por_caixa_padrao || 20;
    }
}
