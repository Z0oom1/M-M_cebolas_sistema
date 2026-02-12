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
    checkEnvironment();
};

function checkEnvironment() {
    if (window.location.protocol !== 'file:') {
        const titlebar = document.getElementById('titlebar');
        if (titlebar) titlebar.style.display = 'none';
        
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.style.top = '0';
            sidebar.style.height = '100vh';
        }
        
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            mainContent.style.marginTop = '0';
            mainContent.style.height = '100vh';
        }
    }
}

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
            localStorage.removeItem('mm_user');
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
        const user = JSON.parse(localStorage.getItem('mm_user') || '{}');
        const isAdmin = user.role === 'admin';

        const requests = [
            fetchWithAuth('/api/movimentacoes'),
            fetchWithAuth('/api/produtos'),
            fetchWithAuth('/api/clientes'),
            fetchWithAuth('/api/fornecedores')
        ];

        if (isAdmin) {
            requests.push(fetchWithAuth('/api/usuarios'));
        }

        const results = await Promise.all(requests);
        
        if (results[0]) appData.transactions = await results[0].json();
        if (results[1]) appData.products = await results[1].json();
        if (results[2]) appData.clients = await results[2].json();
        if (results[3]) appData.suppliers = await results[3].json();
        
        if (isAdmin && results[4]) {
            appData.users = await results[4].json();
        } else {
            appData.users = [];
        }

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
    
    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;"><i class="fas fa-circle-notch fa-spin fa-3x" style="color:var(--primary);"></i></div>';
    
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
    const user = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const isAdmin = user.role === 'admin';

    if (id === 'dashboard') {
        renderDashboard();
        const dateEl = document.getElementById('current-date');
        if (dateEl) dateEl.innerText = new Date().toLocaleDateString('pt-BR');
    }
    if (id === 'entrada' || id === 'saida') {
        renderProductShowcase(id);
        const dateInput = document.getElementById(id === 'entrada' ? 'entry-date' : 'exit-date');
        if (dateInput) dateInput.valueAsDate = new Date();
    }
    if (id === 'cadastro') loadCadastros();
    if (id === 'financeiro') {
        updateFinanceKPIs();
        const dateInput = document.getElementById('desp-data');
        if (dateInput) dateInput.valueAsDate = new Date();
    }
    if (id === 'estoque') renderStockTable();
    if (id === 'nfe') loadNFeTable();
    
    if (id === 'config') {
        loadConfigData();
        if (!isAdmin) {
            const adminPanels = ['#admin-users-panel', '#admin-entities-panel', '#admin-products-panel', '.panel:has(.btn-danger)'];
            adminPanels.forEach(selector => {
                const el = document.querySelector(selector);
                if (el) el.style.display = 'none';
            });
        }
    }
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

    const dashStock = document.getElementById('dash-stock');
    const dashRevenue = document.getElementById('dash-revenue');
    const dashExpenses = document.getElementById('dash-expenses');
    const dashProfit = document.getElementById('dash-profit');

    if (dashStock) dashStock.innerText = `${totalStock} Cx`;
    if (dashRevenue) dashRevenue.innerText = `R$ ${monthlyRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (dashExpenses) dashExpenses.innerText = `R$ ${monthlyExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (dashProfit) dashProfit.innerText = `R$ ${(monthlyRevenue - monthlyExpenses).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    renderCharts(stockMap);
    renderRecentTransactions();
}

function renderRecentTransactions() {
    const tbody = document.getElementById('recent-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (appData.transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted);">Nenhuma movimentação registrada</td></tr>';
        return;
    }
    
    appData.transactions.slice(0, 5).forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.produto}</td>
            <td>${t.descricao}</td>
            <td>${t.quantidade}</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderProductShowcase(section) {
    const container = document.getElementById('product-showcase');
    if (!container) return;
    container.innerHTML = '';
    
    if (appData.products.length === 0) {
        container.innerHTML = '<div style="grid-column:span 4;text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-info-circle fa-2x"></i><p style="margin-top:10px;">Nenhum produto cadastrado no sistema.</p></div>';
        return;
    }
    
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
            card.onclick = (event) => selectProduct(p, section, event);
        }
        container.appendChild(card);
    });
}

function selectProduct(p, section, event) {
    const input = document.getElementById(section === 'entrada' ? 'entry-product' : 'exit-product');
    if (input) input.value = p.nome;
    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

// --- GESTÃO DE CADASTROS ---
function loadCadastros() {
    const user = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const isAdmin = user.role === 'admin';
    const listCli = document.getElementById('list-clientes'), listForn = document.getElementById('list-fornecedores'), listProd = document.getElementById('list-produtos');
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
                <button class="btn-icon text-danger" onclick="deleteProduto(${p.id})"><i class="fas fa-trash"></i></button></td>` : '<td>-</td>';
            tr.innerHTML = `<td><i class="fas ${p.icone || 'fa-box'}" style="color: ${p.cor}"></i> ${p.nome}</td><td>${p.ncm}</td>
                <td>R$ ${p.preco_venda.toLocaleString('pt-BR')}</td>${actions}`;
            listProd.appendChild(tr);
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
    document.getElementById('modal-title').innerText = data ? `Editar ${type}` : `Novo ${type}`;
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

// --- PRODUTOS ---
function openProdutoModal(data = null) {
    const modal = document.getElementById('modal-produto');
    modal.classList.add('active');
    document.getElementById('prod-id').value = data ? data.id : '';
    document.getElementById('prod-nome').value = data ? data.nome : '';
    document.getElementById('prod-ncm').value = data ? data.ncm : '';
    document.getElementById('prod-preco').value = data ? data.preco_venda : '';
    document.getElementById('prod-min').value = data ? data.estoque_minimo : '100';
    document.getElementById('prod-icone').value = data ? data.icone : 'fa-box';
    document.getElementById('prod-cor').value = data ? data.cor : '#1A5632';
    
    // Atualizar seletores visuais
    document.querySelectorAll('.icon-option').forEach(o => {
        o.classList.toggle('active', o.dataset.icon === (data ? data.icone : 'fa-box'));
    });
    document.querySelectorAll('.color-option').forEach(o => {
        o.classList.toggle('active', o.dataset.color === (data ? data.cor : '#1A5632'));
    });
}
function closeProdutoModal() { document.getElementById('modal-produto').classList.remove('active'); }

async function saveProduto(event) {
    event.preventDefault();
    const data = {
        id: document.getElementById('prod-id').value || null,
        nome: document.getElementById('prod-nome').value,
        ncm: document.getElementById('prod-ncm').value,
        preco_venda: parseFloat(document.getElementById('prod-preco').value),
        estoque_minimo: parseInt(document.getElementById('prod-min').value),
        icone: document.getElementById('prod-icone').value,
        cor: document.getElementById('prod-cor').value
    };
    const res = await fetchWithAuth('/api/produtos', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { showSuccess("Produto salvo!"); closeProdutoModal(); loadDataFromAPI(); }
}

async function deleteProduto(id) {
    if (!confirm("Excluir este produto?")) return;
    const res = await fetchWithAuth(`/api/produtos/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Excluído!"); loadDataFromAPI(); }
}

// --- ENTRADA E SAÍDA ---
async function saveEntrada(event) {
    event.preventDefault();
    const data = {
        desc: document.getElementById('entry-desc').value,
        productType: document.getElementById('entry-product').value,
        qty: parseInt(document.getElementById('entry-qty').value),
        value: parseFloat(document.getElementById('entry-value').value),
        date: document.getElementById('entry-date').value
    };
    if (!data.productType) { showError("Selecione um produto!"); return; }
    const res = await fetchWithAuth('/api/entrada', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { showSuccess("Entrada registrada!"); loadDataFromAPI(); }
}

async function saveSaida(event) {
    event.preventDefault();
    const data = {
        desc: document.getElementById('exit-desc').value,
        productType: document.getElementById('exit-product').value,
        qty: parseInt(document.getElementById('exit-qty').value),
        value: parseFloat(document.getElementById('exit-value').value),
        date: document.getElementById('exit-date').value
    };
    if (!data.productType) { showError("Selecione um produto!"); return; }
    
    const res = await fetchWithAuth('/api/saida', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        const result = await res.json();
        showSuccess("Venda registrada!");
        if (confirm("Venda registrada com sucesso! Deseja gerar a NF-e agora?")) {
            gerarNFe(result.id, data.desc, data.productType, data.qty, data.value);
        }
        loadDataFromAPI();
    }
}

async function gerarNFe(vendaId, clienteNome, produtoNome, qtd, valor) {
    const cliente = appData.clients.find(c => c.nome === clienteNome) || { nome: clienteNome };
    const produto = appData.products.find(p => p.nome === produtoNome) || { nome: produtoNome, id: 0 };
    
    const data = {
        venda_id: vendaId,
        destinatario: cliente,
        itens: [{
            id: produto.id,
            nome: produto.nome,
            ncm: produto.ncm,
            quantidade: qtd,
            valor: valor / qtd
        }]
    };
    
    const res = await fetchWithAuth('/api/nfe/gerar', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess("NF-e gerada com sucesso!");
        if (currentSectionId === 'nfe') loadNFeTable();
    }
}

// --- USUÁRIOS (GESTÃO EM CONFIG) ---
function loadConfigData() {
    const listUser = document.getElementById('list-usuarios');
    if (listUser) {
        listUser.innerHTML = '';
        appData.users.forEach(u => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${u.label}</td><td>${u.username}</td><td><span class="badge">${u.role.toUpperCase()}</span></td>
                <td style="text-align: right;">
                    <button class="btn-icon" onclick='openUsuarioModal(${JSON.stringify(u)})'><i class="fas fa-edit"></i></button>
                    <button class="btn-icon text-danger" onclick="deleteUsuario(${u.id})"><i class="fas fa-trash"></i></button>
                </td>`;
            listUser.appendChild(tr);
        });
    }
}

function openUsuarioModal(data = null) {
    const modal = document.getElementById('modal-usuario');
    if (!modal) return;
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
    if (id == 1) { showError("Não é possível excluir o admin principal."); return; }
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
    const finIn = document.getElementById('fin-total-in');
    const finOut = document.getElementById('fin-total-out');
    const finBal = document.getElementById('fin-balance');

    if (finIn) finIn.innerText = `R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (finOut) finOut.innerText = `R$ ${totalExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (finBal) finBal.innerText = `R$ ${(totalRevenue - totalExpenses).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    const tbody = document.getElementById('finance-table-body');
    if (tbody) {
        tbody.innerHTML = '';
        appData.transactions.slice(0, 15).forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${new Date(t.data).toLocaleDateString('pt-BR')}</td><td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
                <td>${t.descricao}</td><td style="font-weight: 700; color: ${t.tipo === 'saida' ? '#15803d' : '#b91c1c'}">R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>`;
            tbody.appendChild(tr);
        });
    }
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

// --- ESTOQUE ---
function renderStockTable() {
    const tbody = document.getElementById('full-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (appData.transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted);">Nenhum registro de movimentação encontrado</td></tr>';
        return;
    }
    
    appData.transactions.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.produto}</td>
            <td>${t.descricao}</td>
            <td>${t.quantidade}</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td style="text-align: right;">
                <button class="btn-icon text-danger" onclick="deleteMovimentacao(${t.id})"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteMovimentacao(id) {
    if (!confirm("Excluir este registro de movimentação?")) return;
    const res = await fetchWithAuth(`/api/movimentacoes/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Registro excluído!"); loadDataFromAPI(); }
}

// --- NF-e ---
async function loadNFeTable() {
    const tbody = document.getElementById('nfe-table-body');
    if (!tbody) return;
    const res = await fetchWithAuth('/api/nfe');
    if (!res) return;
    const data = await res.json();
    tbody.innerHTML = '';
    
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted);">Nenhuma nota fiscal emitida</td></tr>';
        return;
    }
    
    data.forEach(n => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(n.data_emissao).toLocaleDateString('pt-BR')}</td><td>#${n.venda_id}</td>
            <td style="font-family: monospace; font-size: 0.8rem;">${n.chave_acesso}</td>
            <td><span class="badge" style="background: #dcfce7; color: #166534;">${n.status.toUpperCase()}</span></td>
            <td style="text-align: right;">
                <button class="btn-icon" onclick="downloadXML(${n.id})" title="Baixar XML"><i class="fas fa-file-code"></i></button>
                <button class="btn-icon" onclick="showError('A impressão de DANFE PDF está sendo implementada.')" title="Imprimir DANFE"><i class="fas fa-file-pdf"></i></button>
            </td>`;
        tbody.appendChild(tr);
    });
}

function downloadXML(id) {
    const token = localStorage.getItem('token');
    window.open(`${API_URL}/api/nfe/${id}/xml?token=${token}`, '_blank');
}

// --- BUSCA DE CONTATOS ---
function openSearchModal(type) {
    const modal = document.getElementById('modal-search');
    const list = document.getElementById('search-list');
    const input = document.getElementById('search-input');
    const typeInput = document.getElementById('search-type');
    
    if (!modal || !list) return;
    
    modal.classList.add('active');
    typeInput.value = type;
    input.value = '';
    input.focus();
    
    renderSearchList(type);
    input.onkeyup = () => renderSearchList(type, input.value);
}

function closeSearchModal() {
    document.getElementById('modal-search').classList.remove('active');
}

function renderSearchList(type, filter = '') {
    const list = document.getElementById('search-list');
    list.innerHTML = '';
    const data = type === 'cliente' ? appData.clients : appData.suppliers;
    
    data.filter(item => item.nome.toLowerCase().includes(filter.toLowerCase())).forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.innerHTML = `<strong>${item.nome}</strong><small>${item.documento}</small>`;
        div.onclick = () => {
            const targetId = type === 'cliente' ? 'exit-desc' : 'entry-desc';
            document.getElementById(targetId).value = item.nome;
            closeSearchModal();
        };
        list.appendChild(div);
    });
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
function logout() { localStorage.removeItem('token'); localStorage.removeItem('mm_user'); window.location.href = 'login.html'; }

// --- DASHBOARD CHARTS ---
function renderCharts(stockMap) {
    const ctxStock = document.getElementById('stockChart');
    if (ctxStock) {
        if (stockChart) stockChart.destroy();
        const labels = Object.keys(stockMap);
        const data = Object.values(stockMap);
        const hasData = data.some(v => v > 0);
        
        if (!hasData) {
            const container = ctxStock.parentElement;
            container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-muted);flex-direction:column;gap:10px;"><i class="fas fa-box-open fa-2x"></i><span>Sem estoque disponível</span></div>';
            return;
        }

        stockChart = new Chart(ctxStock, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{ data: data, backgroundColor: ['#1A5632', '#E89C31', '#2563eb', '#dc2626', '#9333ea', '#0891b2'] }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
    
    const ctxFinance = document.getElementById('financeChart');
    if (ctxFinance) {
        if (financeChart) financeChart.destroy();
        const monthlyData = calculateMonthlyData();
        financeChart = new Chart(ctxFinance, {
            type: 'line',
            data: {
                labels: monthlyData.labels,
                datasets: [
                    {
                        label: 'Receita',
                        data: monthlyData.revenue,
                        borderColor: '#22c55e',
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Despesas',
                        data: monthlyData.expenses,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true } }
            }
        });
    }
}

function calculateMonthlyData() {
    const labels = [];
    const revenue = [];
    const expenses = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const month = d.toLocaleString('pt-BR', { month: 'short' });
        labels.push(month);
        let rev = 0, exp = 0;
        appData.transactions.forEach(t => {
            const tDate = new Date(t.data);
            if (tDate.getMonth() === d.getMonth() && tDate.getFullYear() === d.getFullYear()) {
                if (t.tipo === 'saida') rev += t.valor;
                if (t.tipo === 'entrada' || t.tipo === 'despesa') exp += t.valor;
            }
        });
        revenue.push(rev);
        expenses.push(exp);
    }
    return { labels, revenue, expenses };
}

// --- CONSULTA CNPJ ---
async function consultarCNPJ() {
    const cnpj = document.getElementById('edit-doc').value.replace(/\D/g, '');
    if (cnpj.length !== 14) { showError("CNPJ inválido para consulta."); return; }
    
    const btn = event.currentTarget;
    const oldIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        const res = await fetchWithAuth(`/api/consulta-cnpj/${cnpj}`);
        const data = await res.json();
        if (data.status === 'OK') {
            document.getElementById('edit-nome').value = data.nome;
            document.getElementById('edit-email').value = data.email || '';
            document.getElementById('edit-tel').value = data.telefone || '';
            document.getElementById('edit-end').value = `${data.logradouro}, ${data.numero} - ${data.bairro}, ${data.municipio} - ${data.uf}`;
            showSuccess("Dados consultados com sucesso!");
        } else {
            showError("CNPJ não encontrado ou erro na consulta.");
        }
    } catch (err) {
        showError("Erro ao conectar com o serviço de consulta.");
    } finally {
        btn.innerHTML = oldIcon;
        btn.disabled = false;
    }
}

// --- CONFIGURAÇÕES ---
async function updateNFeModo(modo) {
    const res = await fetchWithAuth('/api/configs', {
        method: 'POST',
        body: JSON.stringify({ chave: 'nfe_modo', valor: modo })
    });
    if (res && res.ok) showSuccess(`Ambiente alterado para ${modo}`);
}

async function loadConfigData() {
    const res = await fetchWithAuth('/api/configs');
    if (res && res.ok) {
        const configs = await res.json();
        if (configs.nfe_modo) {
            const radio = document.querySelector(`input[name="nfe_modo"][value="${configs.nfe_modo}"]`);
            if (radio) radio.checked = true;
        }
    }
    
    const user = JSON.parse(localStorage.getItem('mm_user') || '{}');
    if (user.role === 'admin') {
        // Carregar Usuários
        const listUser = document.getElementById('list-usuarios');
        if (listUser) {
            listUser.innerHTML = '';
            appData.users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${u.label}</td><td>${u.username}</td><td><span class="badge">${u.role.toUpperCase()}</span></td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick='openUsuarioModal(${JSON.stringify(u)})'><i class="fas fa-edit"></i></button>
                        <button class="btn-icon text-danger" onclick="deleteUsuario(${u.id})"><i class="fas fa-trash"></i></button>
                    </td>`;
                listUser.appendChild(tr);
            });
        }
        
        // Carregar Clientes para Config
        const listCliConfig = document.getElementById('config-list-clientes');
        if (listCliConfig) {
            listCliConfig.innerHTML = '';
            appData.clients.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${c.nome}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick='openEditModal("cliente", ${JSON.stringify(c)})'><i class="fas fa-edit"></i></button>
                        <button class="btn-icon text-danger" onclick="deleteCadastro('cliente', ${c.id})"><i class="fas fa-trash"></i></button>
                    </td>`;
                listCliConfig.appendChild(tr);
            });
        }
        
        // Carregar Fornecedores para Config
        const listFornConfig = document.getElementById('config-list-fornecedores');
        if (listFornConfig) {
            listFornConfig.innerHTML = '';
            appData.suppliers.forEach(f => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${f.nome}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick='openEditModal("fornecedor", ${JSON.stringify(f)})'><i class="fas fa-edit"></i></button>
                        <button class="btn-icon text-danger" onclick="deleteCadastro('fornecedor', ${f.id})"><i class="fas fa-trash"></i></button>
                    </td>`;
                listFornConfig.appendChild(tr);
            });
        }
        
        // Carregar Produtos para Config
        const listProdConfig = document.getElementById('config-list-produtos');
        if (listProdConfig) {
            listProdConfig.innerHTML = '';
            appData.products.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td><i class="fas ${p.icone || 'fa-box'}" style="color: ${p.cor}"></i> ${p.nome}</td>
                    <td>${p.ncm}</td>
                    <td>R$ ${p.preco_venda.toLocaleString('pt-BR')}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick='openProdutoModal(${JSON.stringify(p)})'><i class="fas fa-edit"></i></button>
                        <button class="btn-icon text-danger" onclick="deleteProduto(${p.id})"><i class="fas fa-trash"></i></button>
                    </td>`;
                listProdConfig.appendChild(tr);
            });
        }
    }
}

async function resetSystem() {
    if (!confirm("ATENÇÃO: Isso apagará todos os dados de movimentações, clientes e fornecedores. Deseja continuar?")) return;
    if (!confirm("TEM CERTEZA? Esta ação não pode ser desfeita.")) return;
    
    const res = await fetchWithAuth('/api/reset', { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess("Sistema resetado com sucesso!");
        loadDataFromAPI();
    }
}
