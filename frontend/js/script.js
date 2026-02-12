// M&M Cebolas - Core Script
let appData = {
    transactions: [],
    products: [],
    clients: [],
    suppliers: []
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
        const [resMov, resProd, resCli, resForn] = await Promise.all([
            fetchWithAuth('/api/movimentacoes'),
            fetchWithAuth('/api/produtos'),
            fetchWithAuth('/api/clientes'),
            fetchWithAuth('/api/fornecedores')
        ]);
        if (resMov) appData.transactions = await resMov.json();
        if (resProd) appData.products = await resProd.json();
        if (resCli) appData.clients = await resCli.json();
        if (resForn) appData.suppliers = await resForn.json();
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

function renderDashboard() {
    const stockEl = document.getElementById('dash-stock');
    const revenueEl = document.getElementById('dash-revenue');
    const expensesEl = document.getElementById('dash-expenses');
    const profitEl = document.getElementById('dash-profit');
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString('pt-BR');
    let totalStock = 0, monthlyRevenue = 0, monthlyExpenses = 0;
    const now = new Date();
    const currentMonth = now.getMonth(), currentYear = now.getFullYear();
    const stockMap = {};
    appData.transactions.forEach(t => {
        if (!stockMap[t.produto]) stockMap[t.produto] = 0;
        if (t.tipo === 'entrada') stockMap[t.produto] += t.quantidade;
        if (t.tipo === 'saida') stockMap[t.produto] -= t.quantidade;
    });
    totalStock = Object.values(stockMap).reduce((a, b) => a + b, 0);
    appData.transactions.forEach(t => {
        const tDate = new Date(t.data);
        if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
            if (t.tipo === 'saida') monthlyRevenue += t.valor;
            if (t.tipo === 'entrada' || t.tipo === 'despesa') monthlyExpenses += t.valor;
        }
    });
    if (stockEl) stockEl.innerText = `${totalStock} Un`;
    if (revenueEl) revenueEl.innerText = `R$ ${monthlyRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (expensesEl) expensesEl.innerText = `R$ ${monthlyExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (profitEl) profitEl.innerText = `R$ ${(monthlyRevenue - monthlyExpenses).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    renderCharts(stockMap);
    renderRecentTransactions();
}

function renderCharts(stockMap) {
    const ctxFinance = document.getElementById('financeChart');
    if (ctxFinance) {
        if (financeChart) financeChart.destroy();
        const monthlyData = calculateMonthlyRevenue();
        financeChart = new Chart(ctxFinance, {
            type: 'line',
            data: {
                labels: monthlyData.labels,
                datasets: [{
                    label: 'Receita',
                    data: monthlyData.values,
                    borderColor: '#1A5632',
                    backgroundColor: 'rgba(26, 86, 50, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
    const ctxStock = document.getElementById('stockChart');
    if (ctxStock) {
        if (stockChart) stockChart.destroy();
        const labels = Object.keys(stockMap);
        const data = Object.values(stockMap);
        stockChart = new Chart(ctxStock, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: ['#1A5632', '#E89C31', '#2563eb', '#dc2626', '#9333ea']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function calculateMonthlyRevenue() {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const labels = [], values = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        labels.push(months[d.getMonth()]);
        let rev = 0;
        appData.transactions.forEach(t => {
            const tDate = new Date(t.data);
            if (tDate.getMonth() === d.getMonth() && tDate.getFullYear() === d.getFullYear() && t.tipo === 'saida') rev += t.valor;
        });
        values.push(rev);
    }
    return { labels, values };
}

function renderRecentTransactions() {
    const tbody = document.getElementById('recent-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    appData.transactions.slice(0, 5).forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: 600;">${new Date(t.data).toLocaleDateString('pt-BR')}</td>
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
    appData.products.forEach(p => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="product-icon-circle" style="background: ${p.cor || '#1A5632'}">
                <i class="fas ${p.icone || 'fa-box'}"></i>
            </div>
            <div class="product-name">${p.nome}</div>
        `;
        card.onclick = () => selectProduct(p, section);
        container.appendChild(card);
    });
}

function selectProduct(p, section) {
    const input = document.getElementById(section === 'entrada' ? 'entry-product' : 'exit-product');
    if (input) input.value = p.nome;
    document.querySelectorAll('.product-card').forEach(c => c.classList.remove('active'));
    event.currentTarget.classList.add('active');
}

function openProdutoModal(data = null) {
    const modal = document.getElementById('modal-produto');
    if (!modal) return;
    modal.classList.add('active');
    document.getElementById('prod-id').value = data ? data.id : '';
    document.getElementById('prod-nome').value = data ? data.nome : '';
    document.getElementById('prod-ncm').value = data ? data.ncm : '07031019';
    document.getElementById('prod-preco').value = data ? data.preco_venda : '';
    document.getElementById('prod-min').value = data ? data.estoque_minimo : '100';
    document.getElementById('prod-icone').value = data ? data.icone : 'fa-box';
    document.getElementById('prod-cor').value = data ? data.cor : '#1A5632';
}

function closeProdutoModal() {
    document.getElementById('modal-produto').classList.remove('active');
}

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
    if (res && res.ok) {
        showSuccess("Produto salvo com sucesso!");
        closeProdutoModal();
        loadDataFromAPI();
    }
}

async function deleteProduto(id) {
    if (!confirm("Excluir este produto?")) return;
    const res = await fetchWithAuth(`/api/produtos/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Produto excluído!"); loadDataFromAPI(); }
}

function loadCadastros() {
    const listCli = document.getElementById('list-clientes'), listForn = document.getElementById('list-fornecedores'), listProd = document.getElementById('list-produtos');
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
                <td>R$ ${p.preco_venda.toLocaleString('pt-BR')}</td><td>${p.estoque_minimo}</td>
                <td><button class="btn-icon" onclick='openProdutoModal(${JSON.stringify(p)})'><i class="fas fa-edit"></i></button>
                <button class="btn-icon text-danger" onclick="deleteProduto(${p.id})"><i class="fas fa-trash"></i></button></td>`;
            listProd.appendChild(tr);
        });
    }
}

function openEditModal(type, data = null) {
    const modal = document.getElementById('modal-edit');
    if (!modal) return;
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
    if (res && res.ok) { showSuccess("Cadastro excluído!"); loadDataFromAPI(); }
}

async function consultarCNPJ() {
    const doc = document.getElementById('edit-doc').value.replace(/\D/g, '');
    if (doc.length !== 14) { showError("Digite um CNPJ válido para consultar"); return; }
    const btn = event.currentTarget;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    try {
        const res = await fetchWithAuth(`/api/consulta-cnpj/${doc}`);
        const data = await res.json();
        if (data.status === 'ERROR') { showError(data.message); }
        else {
            document.getElementById('edit-nome').value = data.nome;
            document.getElementById('edit-tel').value = data.telefone;
            document.getElementById('edit-email').value = data.email;
            document.getElementById('edit-end').value = `${data.logradouro}, ${data.numero} - ${data.bairro}, ${data.municipio}-${data.uf}`;
            showSuccess("Dados carregados!");
        }
    } catch (e) { showError("Erro ao consultar CNPJ"); }
    finally { btn.innerHTML = '<i class="fas fa-search"></i>'; }
}

function openSearchModal(type) {
    const modal = document.getElementById('modal-search');
    modal.classList.add('active');
    document.getElementById('search-type').value = type;
    const list = document.getElementById('search-list');
    list.innerHTML = '';
    const items = type === 'cliente' ? appData.clients : appData.suppliers;
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.innerHTML = `<strong>${item.nome}</strong><br><small>${item.documento}</small>`;
        div.onclick = () => {
            const input = document.getElementById(currentSectionId === 'entrada' ? 'entry-desc' : 'exit-desc');
            if (input) input.value = item.nome;
            modal.classList.remove('active');
        };
        list.appendChild(div);
    });
}

function closeSearchModal() { document.getElementById('modal-search').classList.remove('active'); }

async function saveEntrada(event) {
    event.preventDefault();
    const data = {
        desc: document.getElementById('entry-desc').value,
        productType: document.getElementById('entry-product').value,
        qty: parseInt(document.getElementById('entry-qty').value),
        value: parseFloat(document.getElementById('entry-value').value),
        date: document.getElementById('entry-date').value
    };
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
    const res = await fetchWithAuth('/api/saida', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        const result = await res.json();
        showSuccess("Saída registrada! Gerando NF-e...");
        await fetchWithAuth('/api/nfe/gerar', {
            method: 'POST',
            body: JSON.stringify({
                venda_id: result.id,
                destinatario: { nome: data.desc },
                itens: [{ nome: data.productType, quantidade: data.qty, valor: data.value / data.qty }]
            })
        });
        loadDataFromAPI();
    }
}

function showSuccess(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-success';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function showError(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast toast-error';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
}

function logout() { localStorage.removeItem('token'); window.location.href = 'login.html'; }
function checkLogin() { if (!localStorage.getItem('token')) window.location.href = 'login.html'; }

function renderStockTable() {
    const tbody = document.getElementById('full-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    appData.transactions.forEach(t => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${new Date(t.data).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.produto}</td><td>${t.descricao}</td><td>${t.quantidade}</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
            <td style="text-align: right;"><button class="btn-icon text-danger" onclick="deleteMovimentacao(${t.id})"><i class="fas fa-trash"></i></button></td>`;
        tbody.appendChild(tr);
    });
}

async function deleteMovimentacao(id) {
    if (!confirm("Excluir esta movimentação?")) return;
    const res = await fetchWithAuth(`/api/movimentacoes/${id}`, { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Excluída!"); loadDataFromAPI(); }
}

function updateFinanceKPIs() {
    const revenueEl = document.getElementById('fin-total-in'), expensesEl = document.getElementById('fin-total-out'), profitEl = document.getElementById('fin-balance'), tbody = document.getElementById('finance-table-body');
    let totalRevenue = 0, totalExpenses = 0;
    appData.transactions.forEach(t => {
        if (t.tipo === 'saida') totalRevenue += t.valor;
        if (t.tipo === 'entrada' || t.tipo === 'despesa') totalExpenses += t.valor;
    });
    if (revenueEl) revenueEl.innerText = `R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (expensesEl) expensesEl.innerText = `R$ ${totalExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (profitEl) profitEl.innerText = `R$ ${(totalRevenue - totalExpenses).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (tbody) {
        tbody.innerHTML = '';
        appData.transactions.slice(0, 10).forEach(t => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${new Date(t.data).toLocaleDateString('pt-BR')}</td><td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
                <td>${t.descricao}</td><td style="font-weight: 700; color: ${t.tipo === 'saida' ? '#15803d' : '#b91c1c'}">R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>`;
            tbody.appendChild(tr);
        });
    }
}

async function loadNFeTable() {
    const tbody = document.getElementById('nfe-table-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Carregando notas...</td></tr>';
    try {
        const res = await fetchWithAuth('/api/nfe');
        const data = await res.json();
        tbody.innerHTML = '';
        data.forEach(n => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${new Date(n.data_emissao).toLocaleDateString('pt-BR')}</td>
                <td>#${n.venda_id}</td>
                <td style="font-family: monospace; font-size: 0.8rem;">${n.chave_acesso}</td>
                <td><span class="badge" style="background: #dcfce7; color: #166534;">${n.status.toUpperCase()}</span></td>
                <td style="text-align: right;">
                    <button class="btn-icon" title="Ver XML"><i class="fas fa-code"></i></button>
                    <button class="btn-icon" title="Imprimir DANFE"><i class="fas fa-print"></i></button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Erro ao carregar notas</td></tr>'; }
}
