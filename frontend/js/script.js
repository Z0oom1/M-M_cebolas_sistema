// M&M Cebolas - Core Script
let appData = {
    transactions: [],
    products: [],
    clients: [],
    suppliers: [],
    users: []
};

let currentSectionId = 'dashboard';
let financeChart = null;
let stockChart = null;

const isElectron = window.location.protocol === 'file:';
const API_URL = isElectron ? 'http://localhost:3000' : '';

window.onload = function() {
    checkLogin();
    loadDataFromAPI();
    setupSelectors();
};

function setupSelectors() {
    document.addEventListener('click', (e) => {
        if (e.target.closest('.icon-option')) {
            const opt = e.target.closest('.icon-option');
            document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            const input = document.getElementById('prod-icone');
            if (input) input.value = opt.dataset.icon;
        }
        if (e.target.closest('.color-option')) {
            const opt = e.target.closest('.color-option');
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            const input = document.getElementById('prod-cor');
            if (input) input.value = opt.dataset.color;
        }
    });
}

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return; }
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers
    };
    try {
        const response = await fetch(`${API_URL}${url}`, { ...options, headers });
        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
            return;
        }
        return response;
    } catch (err) {
        console.error("Erro na requisição:", err);
        showError("Erro de conexão com o servidor.");
        throw err;
    }
}

async function loadDataFromAPI() {
    try {
        const [resMov, resProd, resCli, resForn, resUser] = await Promise.all([
            fetchWithAuth('/api/movimentacoes'),
            fetchWithAuth('/api/produtos'),
            fetchWithAuth('/api/clientes'),
            fetchWithAuth('/api/fornecedores'),
            fetchWithAuth('/api/usuarios')
        ]);
        if (resMov) appData.transactions = await resMov.json();
        if (resProd) appData.products = await resProd.json();
        if (resCli) appData.clients = await resCli.json();
        if (resForn) appData.suppliers = await resForn.json();
        if (resUser) appData.users = await resUser.json();
        showSection(currentSectionId);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

function showSection(id) {
    currentSectionId = id;
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.nav-item[onclick*="${id}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    fetch(`sections/${id}.html`)
        .then(res => res.text())
        .then(html => {
            document.getElementById('main-content').innerHTML = html;
            initSection(id);
        });
}

function initSection(id) {
    if (id === 'dashboard') renderDashboard();
    if (id === 'entrada' || id === 'saida') renderProductShowcase(id);
    if (id === 'cadastro') loadCadastros();
    if (id === 'financeiro') updateFinanceKPIs();
    if (id === 'estoque') renderStockTable();
    if (id === 'nfe') loadNFeTable();
}

function calculateStock() {
    const stockMap = {};
    appData.products.forEach(p => stockMap[p.nome] = 0);
    appData.transactions.forEach(t => {
        if (t.tipo === 'entrada') stockMap[t.produto] = (stockMap[t.produto] || 0) + t.quantidade;
        if (t.tipo === 'saida') stockMap[t.produto] = (stockMap[t.produto] || 0) - t.quantidade;
    });
    return stockMap;
}

function renderDashboard() {
    const stockMap = calculateStock();
    const totalStock = Object.values(stockMap).reduce((a, b) => a + b, 0);
    let monthlyRevenue = 0, monthlyExpenses = 0;
    const now = new Date(), currentMonth = now.getMonth(), currentYear = now.getFullYear();

    appData.transactions.forEach(t => {
        const tDate = new Date(t.data);
        if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
            if (t.tipo === 'saida') monthlyRevenue += t.valor;
            if (t.tipo === 'entrada' || t.tipo === 'despesa') monthlyExpenses += t.valor;
        }
    });

    document.getElementById('dash-stock').innerText = `${totalStock} Un`;
    document.getElementById('dash-revenue').innerText = `R$ ${monthlyRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('dash-expenses').innerText = `R$ ${monthlyExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('dash-profit').innerText = `R$ ${(monthlyRevenue - monthlyExpenses).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    renderCharts(stockMap);
    renderRecentTransactions();
}

function renderRecentTransactions() {
    const tbody = document.getElementById('recent-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    appData.transactions.slice(0, 5).forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.produto}</td>
            <td>${t.descricao}</td>
            <td>${t.quantidade}</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR')}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderProductShowcase(section) {
    const container = document.getElementById('product-showcase');
    if (!container) return;
    container.innerHTML = '';
    const stockMap = calculateStock();

    appData.products.forEach(p => {
        const qty = stockMap[p.nome] || 0;
        const card = document.createElement('div');
        card.className = `product-card ${qty <= 0 && section === 'saida' ? 'disabled' : ''}`;
        card.innerHTML = `
            <div class="product-icon-circle" style="background: ${p.cor || '#1A5632'}">
                <i class="fas ${p.icone || 'fa-box'}"></i>
            </div>
            <div class="product-name">${p.nome}</div>
            <div class="product-stock">${qty} em estoque</div>
        `;
        if (!(qty <= 0 && section === 'saida')) {
            card.onclick = () => selectProduct(p, section);
        }
        container.appendChild(card);
    });
}

function selectProduct(p, section) {
    const input = document.getElementById(section === 'entrada' ? 'entry-product' : 'exit-product');
    if (input) input.value = p.nome;
    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

// --- GESTÃO DE CADASTROS ---
function loadCadastros() {
    const listCli = document.getElementById('list-clientes'), listForn = document.getElementById('list-fornecedores'), listProd = document.getElementById('list-produtos'), listUser = document.getElementById('list-usuarios');
    if (listCli) {
        listCli.innerHTML = '';
        appData.clients.forEach(c => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${c.nome}</td><td>${c.documento}</td><td>${c.telefone}</td>
                <td><button class="btn-icon" onclick='openEditModal("cliente", ${JSON.stringify(c)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('cliente', ${c.id})"><i class="fas fa-trash"></i></button></td>`;
            listCli.appendChild(tr);
        });
    }
    if (listForn) {
        listForn.innerHTML = '';
        appData.suppliers.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${f.nome}</td><td>${f.documento}</td><td>${f.telefone}</td>
                <td><button class="btn-icon" onclick='openEditModal("fornecedor", ${JSON.stringify(f)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteCadastro('fornecedor', ${f.id})"><i class="fas fa-trash"></i></button></td>`;
            listForn.appendChild(tr);
        });
    }
    if (listProd) {
        listProd.innerHTML = '';
        appData.products.forEach(p => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td><i class="fas ${p.icone || 'fa-box'}" style="color: ${p.cor}"></i> ${p.nome}</td><td>${p.ncm}</td>
                <td>R$ ${p.preco_venda.toLocaleString('pt-BR')}</td>
                <td><button class="btn-icon" onclick='openProdutoModal(${JSON.stringify(p)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteProduto(${p.id})"><i class="fas fa-trash"></i></button></td>`;
            listProd.appendChild(tr);
        });
    }
    if (listUser) {
        listUser.innerHTML = '';
        appData.users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${u.label}</td><td>${u.username}</td><td><span class="badge">${u.role.toUpperCase()}</span></td>
                <td><button class="btn-icon" onclick='openUsuarioModal(${JSON.stringify(u)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteUsuario(${u.id})"><i class="fas fa-trash"></i></button></td>`;
            listUser.appendChild(tr);
        });
    }
}

// --- MODAIS CADASTRO ---
function openEditModal(type, data = null) {
    const modal = document.getElementById('modal-edit');
    modal.classList.add('active');
    document.getElementById('edit-type').value = type;
    document.getElementById('edit-id').value = data ? data.id : '';
    document.getElementById('edit-nome').value = data ? data.nome : '';
    document.getElementById('edit-doc').value = data ? data.documento : '';
    document.getElementById('edit-ie').value = data ? data.ie : '';
    document.getElementById('edit-email').value = data ? data.email : '';
    document.getElementById('edit-tel').value = data ? data.telefone : '';
    document.getElementById('edit-end').value = data ? data.endereco : '';
}
function closeEditModal() { document.getElementById('modal-edit').classList.remove('active'); }

async function saveCadastro(event) {
    event.preventDefault();
    const type = document.getElementById('edit-type').value;
    const data = {
        id: document.getElementById('edit-id').value || null,
        nome: document.getElementById('edit-nome').value,
        documento: document.getElementById('edit-doc').value,
        ie: document.getElementById('edit-ie').value,
        email: document.getElementById('edit-email').value,
        telefone: document.getElementById('edit-tel').value,
        endereco: document.getElementById('edit-end').value
    };
    const res = await fetchWithAuth(`/api/${type}s`, { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { showSuccess("Cadastro salvo!"); closeEditModal(); loadDataFromAPI(); }
}

async function deleteCadastro(type, id) {
    if (!confirm(`Excluir este ${type}?`)) return;
    const res = await fetchWithAuth(`/api/${type}s/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Excluído!"); loadDataFromAPI(); }
}

// --- MODAL USUÁRIO ---
function openUsuarioModal(data = null) {
    const modal = document.getElementById('modal-usuario');
    modal.classList.add('active');
    document.getElementById('user-id').value = data ? data.id : '';
    document.getElementById('user-label').value = data ? data.label : '';
    document.getElementById('user-username').value = data ? data.username : '';
    document.getElementById('user-password').value = '';
    document.getElementById('user-role').value = data ? data.role : 'operador';
}
function closeUsuarioModal() { document.getElementById('modal-usuario').classList.remove('active'); }

async function saveUsuario(event) {
    event.preventDefault();
    const data = {
        id: document.getElementById('user-id').value || null,
        label: document.getElementById('user-label').value,
        username: document.getElementById('user-username').value,
        password: document.getElementById('user-password').value,
        role: document.getElementById('user-role').value
    };
    const res = await fetchWithAuth('/api/usuarios', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { showSuccess("Usuário salvo!"); closeUsuarioModal(); loadDataFromAPI(); }
}

async function deleteUsuario(id) {
    if (!confirm("Excluir este funcionário?")) return;
    const res = await fetchWithAuth(`/api/usuarios/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Excluído!"); loadDataFromAPI(); }
}

// --- FINANCEIRO ---
function updateFinanceKPIs() {
    let totalRevenue = 0, totalExpenses = 0;
    appData.transactions.forEach(t => {
        if (t.tipo === 'saida') totalRevenue += t.valor;
        if (t.tipo === 'entrada' || t.tipo === 'despesa') totalExpenses += t.valor;
    });
    document.getElementById('fin-total-in').innerText = `R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('fin-total-out').innerText = `R$ ${totalExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    document.getElementById('fin-balance').innerText = `R$ ${(totalRevenue - totalExpenses).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    const tbody = document.getElementById('finance-table-body');
    tbody.innerHTML = '';
    appData.transactions.slice(0, 15).forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(t.data).toLocaleDateString('pt-BR')}</td><td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.descricao}</td><td style="font-weight: 700; color: ${t.tipo === 'saida' ? '#15803d' : '#b91c1c'}">R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>`;
        tbody.appendChild(tr);
    });
}

async function saveDespesa(event) {
    event.preventDefault();
    const data = {
        desc: document.getElementById('desp-desc').value,
        value: parseFloat(document.getElementById('desp-valor').value),
        date: document.getElementById('desp-data').value
    };
    const res = await fetchWithAuth('/api/despesa', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { showSuccess("Despesa lançada!"); loadDataFromAPI(); }
}

// --- NF-e ---
async function loadNFeTable() {
    const tbody = document.getElementById('nfe-table-body');
    if (!tbody) return;
    const res = await fetchWithAuth('/api/nfe');
    const data = await res.json();
    tbody.innerHTML = '';
    data.forEach(n => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(n.data_emissao).toLocaleDateString('pt-BR')}</td><td>#${n.venda_id}</td>
            <td style="font-family: monospace; font-size: 0.8rem;">${n.chave_acesso}</td>
            <td><span class="badge" style="background: #dcfce7; color: #166534;">${n.status.toUpperCase()}</span></td>
            <td style="text-align: right;">
                <button class="btn-icon" onclick="downloadXML(${n.id})" title="Baixar XML"><i class="fas fa-file-code"></i></button>
                <button class="btn-icon" onclick="alert('Funcionalidade de PDF em desenvolvimento')" title="Imprimir DANFE"><i class="fas fa-file-pdf"></i></button>
            </td>`;
        tbody.appendChild(tr);
    });
}

function downloadXML(id) {
    const token = localStorage.getItem('token');
    window.open(`${API_URL}/api/nfe/${id}/xml?token=${token}`, '_blank');
}

// --- UTILITÁRIOS ---
function showSuccess(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-success show';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function showError(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-error show';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function checkLogin() { if (!localStorage.getItem('token')) window.location.href = 'login.html'; }
function logout() { localStorage.removeItem('token'); window.location.href = 'login.html'; }

// --- DASHBOARD CHARTS ---
function renderCharts(stockMap) {
    const ctxStock = document.getElementById('stockChart');
    if (ctxStock) {
        if (stockChart) stockChart.destroy();
        stockChart = new Chart(ctxStock, {
            type: 'doughnut',
            data: {
                labels: Object.keys(stockMap),
                datasets: [{ data: Object.values(stockMap), backgroundColor: ['#1A5632', '#E89C31', '#2563eb', '#dc2626', '#9333ea'] }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}
