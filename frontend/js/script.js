// --- CONFIGURAÇÃO DE REDE ---
const isElectron = window.location.protocol === 'file:';
const API_URL = isElectron ? 'http://localhost:3000' : '';

let appData = {
    transactions: [],
    fixedTax: 0,
    config: { minStock: 100 }
};

let currentUser = null;
let currentSelectionTarget = null; 
let currentSectionId = 'dashboard';
let financeChart = null;
let stockChart = null;

// --- INICIALIZAÇÃO ---
window.onload = function() {
    checkLogin();
    loadDataFromAPI(); 
    
    // Fechar menus ao clicar fora
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            const modals = ['modal-edit', 'modal-selection', 'modal-produto', 'modal-nfe'];
            modals.forEach(id => {
                const modal = document.getElementById(id);
                if (modal && e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        }
    });

    initUserInfo();
    showSection('dashboard');
};

// --- AUTENTICAÇÃO E LOGIN (JWT) ---
function getAuthToken() {
    const session = sessionStorage.getItem('mm_user');
    if (session) {
        const user = JSON.parse(session);
        return user.token;
    }
    return null;
}

async function fetchWithAuth(url, options = {}) {
    const token = getAuthToken();
    if (!token && !url.includes('/api/login')) {
        window.location.replace('login.html');
        return null;
    }

    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${API_URL}${url}`, {
            ...options,
            headers
        });

        if (response.status === 401 || response.status === 403) {
            sessionStorage.removeItem('mm_user');
            window.location.replace('login.html');
            return null;
        }

        return response;
    } catch (error) {
        console.error('Erro na requisição:', error);
        showError('Erro de conexão com o servidor.');
        throw error;
    }
}

function checkLogin() {
    const session = sessionStorage.getItem('mm_user');
    const isLoginPage = window.location.pathname.includes('login.html');

    if (isLoginPage && session) {
        window.location.replace('home.html');
        return;
    }
    if (isLoginPage && !session) return;
    if (!isLoginPage && !session) {
        window.location.replace('login.html'); 
        return;
    }
    currentUser = JSON.parse(session);
}

function logout() {
    sessionStorage.removeItem('mm_user');
    window.location.replace('login.html');
}

function initUserInfo() {
    if(currentUser) {
        const nameDisplay = document.getElementById('user-name-display');
        if(nameDisplay) nameDisplay.innerText = currentUser.username;
        const roleDisplay = document.getElementById('user-role-display');
        if(roleDisplay) roleDisplay.innerText = currentUser.label || 'Staff';
        const avatar = document.querySelector('.avatar');
        if(avatar && currentUser.username) avatar.innerText = currentUser.username[0].toUpperCase();
    }
}

// --- NAVEGAÇÃO DINÂMICA ---
async function showSection(id, btn) {
    if (id === 'config' && currentUser && currentUser.role !== 'admin') {
        showError("Acesso restrito ao Administrador.");
        return;
    }

    currentSectionId = id;
    const contentArea = document.getElementById('content-section');
    
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
    } else {
        const targetBtn = Array.from(document.querySelectorAll('.nav-links button')).find(b => {
            const onclick = b.getAttribute('onclick');
            return onclick && onclick.includes(`'${id}'`);
        });
        if (targetBtn) targetBtn.classList.add('active');
    }

    if(window.innerWidth <= 1024) {
        const sidebar = document.getElementById('sidebar');
        if(sidebar) sidebar.classList.remove('active');
    }

    try {
        const response = await fetch(`sections/${id}.html`);
        if (response.ok) {
            const html = await response.text();
            contentArea.innerHTML = html;
            initializeSectionData(id);
        } else {
            contentArea.innerHTML = `<div class="panel" style="padding: 40px; text-align: center;"><h2>Erro ao carregar seção ${id}</h2></div>`;
        }
    } catch (error) {
        console.error("Erro ao carregar seção:", error);
    }
}

function initializeSectionData(id) {
    initDateInputs();
    if (id === 'dashboard') {
        updateDashboard();
    } else if (id === 'estoque') {
        renderFullTable();
    } else if (id === 'cadastro') {
        loadCadastros();
    } else if (id === 'nfe') {
        loadNFe();
    } else if (id === 'financeiro') {
        updateFinanceKPIs();
    } else if (id === 'config') {
        loadConfigs();
        loadUsers();
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

function initDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(el => {
        if (!el.value) el.value = today;
    });
}

// --- CARREGAMENTO DE DADOS ---
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

// --- FEEDBACK VISUAL (TOASTS) ---
function showSuccess(message) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = '#1A5632';
    toast.style.color = 'white';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '10px';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
    toast.style.zIndex = '999999';
    toast.style.fontWeight = '700';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showError(message) {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = '#ef4444';
    toast.style.color = 'white';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '10px';
    toast.style.boxShadow = '0 10px 15px -3px rgba(0,0,0,0.1)';
    toast.style.zIndex = '999999';
    toast.style.fontWeight = '700';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showLoading(btn) {
    if (!btn) return;
    btn.disabled = true;
    btn.dataset.oldHtml = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
}

function hideLoading(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.innerHTML = btn.dataset.oldHtml || btn.innerHTML;
}

// --- DASHBOARD ---
function updateDashboard() {
    const grouped = getGroupedStock();
    const stockEl = document.getElementById('dash-stock');
    if (stockEl) {
        const total = Object.values(grouped).reduce((acc, curr) => acc + curr.netQty, 0);
        stockEl.innerText = `${total} Cx`;
    }

    const revenueEl = document.getElementById('dash-revenue');
    if (revenueEl) {
        const revenue = appData.transactions
            .filter(t => t.type === 'saida')
            .reduce((acc, curr) => acc + curr.value, 0);
        revenueEl.innerText = `R$ ${revenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    }

    const expenseEl = document.getElementById('dash-expenses');
    if (expenseEl) {
        const expenses = appData.transactions
            .filter(t => t.type === 'entrada' || t.type === 'despesa')
            .reduce((acc, curr) => acc + curr.value, 0);
        expenseEl.innerText = `R$ ${expenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    }

    const profitEl = document.getElementById('dash-profit');
    if (profitEl) {
        const revenue = appData.transactions.filter(t => t.type === 'saida').reduce((acc, curr) => acc + curr.value, 0);
        const expenses = appData.transactions.filter(t => t.type === 'entrada' || t.type === 'despesa').reduce((acc, curr) => acc + curr.value, 0);
        const profit = revenue - expenses;
        profitEl.innerText = `R$ ${profit.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        profitEl.className = profit >= 0 ? 'text-success' : 'text-danger';
    }

    renderRecentTable();
    renderCharts(grouped);
    
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.innerText = new Date().toLocaleDateString('pt-BR');
}

function getGroupedStock() {
    const grouped = {};
    appData.transactions.forEach(t => {
        if (t.type === 'despesa') return;
        if (!grouped[t.productType]) grouped[t.productType] = { in: 0, out: 0, netQty: 0 };
        if (t.type === 'entrada') {
            grouped[t.productType].in += t.qty;
            grouped[t.productType].netQty += t.qty;
        } else {
            grouped[t.productType].out += t.qty;
            grouped[t.productType].netQty -= t.qty;
        }
    });
    return grouped;
}

function renderRecentTable() {
    const tbody = document.getElementById('recent-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    appData.transactions.slice(0, 5).forEach(t => {
        const row = `<tr>
            <td><span class="badge ${t.type === 'entrada' ? 'badge-in' : 'badge-out'}">${t.type.toUpperCase()}</span></td>
            <td>${t.productType}</td>
            <td>${t.desc}</td>
            <td>${t.qty}</td>
            <td>R$ ${t.value.toFixed(2)}</td>
            <td>${new Date(t.date).toLocaleDateString('pt-BR')}</td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

function renderCharts(grouped) {
    const ctxFinance = document.getElementById('financeChart');
    if (ctxFinance) {
        if (financeChart) financeChart.destroy();
        financeChart = new Chart(ctxFinance, {
            type: 'line',
            data: {
                labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                datasets: [{
                    label: 'Receita',
                    data: [1200, 1900, 3000, 5000, 2000, 3000],
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
        const labels = Object.keys(grouped);
        const data = labels.map(l => grouped[l].netQty);
        stockChart = new Chart(ctxStock, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: ['#1A5632', '#E89C31', '#3b82f6', '#ef4444', '#8b5cf6']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// --- CADASTROS E SELEÇÃO ---
async function openSelectionModal(type) {
    currentSelectionTarget = type;
    const modal = document.getElementById('modal-selection');
    const title = document.getElementById('selection-title');
    const list = document.getElementById('selection-list');
    
    if (!modal || !list) return;
    
    title.innerText = `Selecionar ${type === 'cliente' ? 'Cliente' : 'Fornecedor'}`;
    list.innerHTML = '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
    modal.classList.add('active');

    try {
        const endpoint = type === 'cliente' ? '/api/clientes' : '/api/fornecedores';
        const response = await fetchWithAuth(endpoint);
        const data = await response.json();
        
        list.innerHTML = '';
        if (data.length === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center; color: var(--text-muted);">Nenhum registro encontrado.</div>';
            return;
        }

        data.forEach(item => {
            const div = document.createElement('div');
            div.style.padding = '12px 16px';
            div.style.borderBottom = '1px solid var(--border)';
            div.style.cursor = 'pointer';
            div.style.transition = 'var(--transition)';
            div.innerHTML = `<strong>${item.nome}</strong><br><small style="color:var(--text-muted)">${item.documento || 'Sem doc'}</small>`;
            div.onmouseover = () => div.style.background = '#f8fafc';
            div.onmouseout = () => div.style.background = 'transparent';
            div.onclick = () => {
                const targetId = currentSelectionTarget === 'cliente' ? 'exit-desc' : 'entry-desc';
                const input = document.getElementById(targetId);
                if (input) input.value = item.nome;
                closeSelectionModal();
            };
            list.appendChild(div);
        });
    } catch (error) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:red;">Erro ao carregar.</div>';
    }
}

function closeSelectionModal() {
    document.getElementById('modal-selection')?.classList.remove('active');
}

function openEditModal(type, data = null) {
    const modal = document.getElementById('modal-edit');
    if (!modal) return;
    
    document.getElementById('edit-id').value = data ? data.id : '';
    document.getElementById('edit-type').value = type;
    document.getElementById('modal-title').innerText = (data ? 'Editar ' : 'Novo ') + (type === 'cliente' ? 'Cliente' : 'Fornecedor');
    
    document.getElementById('edit-nome').value = data ? data.nome : '';
    document.getElementById('edit-doc').value = data ? data.documento : '';
    document.getElementById('edit-ie').value = data ? data.ie : '';
    document.getElementById('edit-email').value = data ? data.email : '';
    document.getElementById('edit-tel').value = data ? data.telefone : '';
    document.getElementById('edit-endereco').value = data ? data.endereco : '';
    
    modal.classList.add('active');
}

function closeEditModal() {
    document.getElementById('modal-edit')?.classList.remove('active');
}

// --- GESTÃO DE CADASTROS (API) ---
async function loadCadastros() {
    try {
        const resCli = await fetchWithAuth('/api/clientes');
        const resForn = await fetchWithAuth('/api/fornecedores');
        const resProd = await fetchWithAuth('/api/produtos');

        if (resCli) renderCadastroList('list-clientes', await resCli.json(), 'cliente');
        if (resForn) renderCadastroList('list-fornecedores', await resForn.json(), 'fornecedor');
        if (resProd) renderProdutoList('list-produtos', await resProd.json());
    } catch (error) {
        console.error("Erro ao carregar cadastros:", error);
    }
}

function renderCadastroList(elementId, data, type) {
    const tbody = document.getElementById(elementId);
    if (!tbody) return;
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = `<tr>
            <td><strong>${item.nome}</strong></td>
            <td>${item.documento || '-'}</td>
            <td>${item.telefone || '-'}</td>
            <td>${item.email || '-'}</td>
            <td style="text-align: right;">
                <button onclick="editCadastro(${item.id}, '${type}')" style="background:none; border:none; cursor:pointer; color:var(--info); margin-right:10px;"><i class="fas fa-edit"></i></button>
                <button onclick="deleteCadastro(${item.id}, '${type}')" style="background:none; border:none; cursor:pointer; color:var(--danger);"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

function renderProdutoList(elementId, data) {
    const tbody = document.getElementById(elementId);
    if (!tbody) return;
    tbody.innerHTML = '';

    data.forEach(item => {
        const row = `<tr>
            <td><strong>${item.nome}</strong></td>
            <td>${item.ncm || '-'}</td>
            <td>R$ ${item.preco_venda.toFixed(2)}</td>
            <td>${item.estoque_minimo}</td>
            <td style="text-align: right;">
                <button onclick='editProduto(${JSON.stringify(item)})' style="background:none; border:none; cursor:pointer; color:var(--info); margin-right:10px;"><i class="fas fa-edit"></i></button>
                <button onclick="deleteProduto(${item.id})" style="background:none; border:none; cursor:pointer; color:var(--danger);"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

async function saveCadastro(event) {
    event.preventDefault();
    const btn = event.submitter;
    showLoading(btn);

    const id = document.getElementById('edit-id').value;
    const type = document.getElementById('edit-type').value;
    const endpoint = type === 'cliente' ? '/api/clientes' : '/api/fornecedores';
    
    const data = {
        nome: document.getElementById('edit-nome').value,
        documento: document.getElementById('edit-doc').value,
        ie: document.getElementById('edit-ie').value,
        email: document.getElementById('edit-email').value,
        telefone: document.getElementById('edit-tel').value,
        endereco: document.getElementById('edit-endereco').value
    };

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${endpoint}/${id}` : endpoint;
        const response = await fetchWithAuth(url, {
            method,
            body: JSON.stringify(data)
        });

        if (response && response.ok) {
            showSuccess(`${type.charAt(0).toUpperCase() + type.slice(1)} salvo com sucesso!`);
            closeEditModal();
            loadCadastros();
        }
    } catch (error) {
        showError('Erro ao salvar cadastro.');
    } finally {
        hideLoading(btn);
    }
}

async function deleteCadastro(id, type) {
    if (!confirm(`Excluir este ${type}?`)) return;
    const endpoint = type === 'cliente' ? '/api/clientes' : '/api/fornecedores';
    try {
        const response = await fetchWithAuth(`${endpoint}/${id}`, { method: 'DELETE' });
        if (response && response.ok) {
            showSuccess(`${type} excluído!`);
            loadCadastros();
        }
    } catch (error) {
        showError('Erro ao excluir.');
    }
}

// --- OPERACIONAL ---
async function saveEntry(event) {
    event.preventDefault();
    const btn = event.submitter;
    showLoading(btn);

    const formData = {
        desc: document.getElementById('entry-desc').value,
        productType: document.getElementById('entry-product').value,
        qty: parseInt(document.getElementById('entry-qty').value),
        value: parseFloat(document.getElementById('entry-value').value),
        date: document.getElementById('entry-date').value
    };

    try {
        const response = await fetchWithAuth('/api/entrada', {
            method: 'POST',
            body: JSON.stringify(formData)
        });

        if (response && response.ok) {
            showSuccess('Entrada registrada!');
            event.target.reset();
            initDateInputs();
            loadDataFromAPI();
        }
    } catch (error) {
        showError('Erro ao registrar.');
    } finally {
        hideLoading(btn);
    }
}

async function saveExit(event) {
    event.preventDefault();
    const btn = event.submitter;
    showLoading(btn);

    const formData = {
        desc: document.getElementById('exit-desc').value,
        productType: document.getElementById('exit-product').value,
        qty: parseInt(document.getElementById('exit-qty').value),
        value: parseFloat(document.getElementById('exit-value').value),
        date: document.getElementById('exit-date').value
    };

    try {
        const response = await fetchWithAuth('/api/saida', {
            method: 'POST',
            body: JSON.stringify(formData)
        });

        if (response && response.ok) {
            showSuccess('Venda registrada!');
            event.target.reset();
            initDateInputs();
            loadDataFromAPI();
        }
    } catch (error) {
        showError('Erro ao registrar.');
    } finally {
        hideLoading(btn);
    }
}

function renderFullTable() {
    const tbody = document.getElementById('full-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    appData.transactions.forEach(t => {
        const row = `<tr>
            <td>${new Date(t.date).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.type === 'entrada' ? 'badge-in' : (t.type === 'saida' ? 'badge-out' : 'badge-despesa')}">${t.type.toUpperCase()}</span></td>
            <td>${t.productType}</td>
            <td>${t.desc}</td>
            <td>${t.qty}</td>
            <td>R$ ${t.value.toFixed(2)}</td>
            <td style="text-align: right;">
                <button onclick="deleteTransaction(${t.id})" style="background:none; border:none; cursor:pointer; color:var(--danger);"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

async function deleteTransaction(id) {
    if (!confirm('Excluir este registro?')) return;
    try {
        const response = await fetchWithAuth(`/api/movimentacoes/${id}`, { method: 'DELETE' });
        if (response && response.ok) {
            showSuccess('Registro excluído!');
            loadDataFromAPI();
            if (currentSectionId === 'estoque') renderFullTable();
        }
    } catch (error) {
        showError('Erro ao excluir.');
    }
}

// --- FINANCEIRO ---
function updateFinanceKPIs() {
    const totalIn = appData.transactions
        .filter(t => t.type === 'saida')
        .reduce((acc, curr) => acc + curr.value, 0);
    
    const totalOut = appData.transactions
        .filter(t => t.type === 'entrada' || t.type === 'despesa')
        .reduce((acc, curr) => acc + curr.value, 0);

    const balance = totalIn - totalOut;

    const elIn = document.getElementById('fin-total-in');
    const elOut = document.getElementById('fin-total-out');
    const elBalance = document.getElementById('fin-balance');

    if (elIn) elIn.innerText = `R$ ${totalIn.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (elOut) elOut.innerText = `R$ ${totalOut.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (elBalance) {
        elBalance.innerText = `R$ ${balance.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        elBalance.className = balance >= 0 ? 'text-success' : 'text-danger';
    }
}

async function saveDespesa(event) {
    event.preventDefault();
    const btn = event.submitter;
    showLoading(btn);

    const data = {
        desc: document.getElementById('exp-desc').value,
        value: parseFloat(document.getElementById('exp-value').value),
        date: document.getElementById('exp-date').value
    };

    try {
        const response = await fetchWithAuth('/api/despesa', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (response && response.ok) {
            showSuccess('Despesa lançada!');
            event.target.reset();
            initDateInputs();
            loadDataFromAPI();
            if (currentSectionId === 'financeiro') updateFinanceKPIs();
        }
    } catch (error) {
        showError('Erro ao lançar.');
    } finally {
        hideLoading(btn);
    }
}

// --- NF-E ---
async function loadNFe() {
    try {
        const response = await fetchWithAuth('/api/nfe');
        if (response) {
            const data = await response.json();
            const tbody = document.getElementById('nfe-table-body');
            if (!tbody) return;
            tbody.innerHTML = '';
            data.forEach(item => {
                tbody.innerHTML += `<tr>
                    <td>${new Date(item.data_emissao).toLocaleString('pt-BR')}</td>
                    <td>#${item.venda_id}</td>
                    <td style="font-family: monospace; font-size: 0.8rem;">${item.chave_acesso}</td>
                    <td><span class="badge ${item.status === 'autorizada' ? 'badge-in' : 'badge-out'}">${item.status.toUpperCase()}</span></td>
                    <td style="text-align: right;">
                        <button onclick="alert('Funcionalidade de download em breve')" style="background:none; border:none; cursor:pointer; color:var(--info);"><i class="fas fa-file-pdf"></i></button>
                    </td>
                </tr>`;
            });
        }
    } catch (error) {
        console.error("Erro ao carregar NF-e:", error);
    }
}

// --- CONFIGURAÇÕES ---
async function loadUsers() {
    try {
        const response = await fetchWithAuth('/api/usuarios');
        if (response) {
            const users = await response.json();
            const tbody = document.getElementById('list-users');
            if (!tbody) return;
            tbody.innerHTML = '';
            users.forEach(u => {
                tbody.innerHTML += `<tr>
                    <td><strong>${u.username}</strong></td>
                    <td><span class="badge ${u.role === 'admin' ? 'badge-in' : 'badge-out'}">${u.role.toUpperCase()}</span></td>
                    <td style="text-align: right;">
                        <button onclick="deleteUser(${u.id})" style="background:none; border:none; cursor:pointer; color:var(--danger);"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });
        }
    } catch (error) {
        console.error("Erro ao carregar usuários:", error);
    }
}

async function deleteUser(id) {
    if (!confirm('Excluir este usuário?')) return;
    try {
        const response = await fetchWithAuth(`/api/usuarios/${id}`, { method: 'DELETE' });
        if (response && response.ok) {
            showSuccess('Usuário removido!');
            loadUsers();
        }
    } catch (error) {
        showError('Erro ao excluir.');
    }
}

function loadConfigs() {
    const modo = localStorage.getItem('mm_nfe_modo') || 'homologacao';
    const radio = document.querySelector(`input[name="nfe_modo"][value="${modo}"]`);
    if (radio) radio.checked = true;
}

function updateNFeModo(modo) {
    localStorage.setItem('mm_nfe_modo', modo);
    showSuccess(`Ambiente: ${modo.toUpperCase()}`);
}

async function resetSystem() {
    if (!confirm('AVISO: Isso apagará TODOS os dados. Deseja continuar?')) return;
    const pass = prompt('Digite "admin" para confirmar:');
    if (pass === 'admin') {
        try {
            const response = await fetchWithAuth('/api/reset', { method: 'DELETE' });
            if (response && response.ok) {
                showSuccess('Sistema resetado!');
                location.reload();
            }
        } catch (error) {
            showError('Erro ao resetar.');
        }
    }
}

function editProduto(item) {
    // Stub para edição de produto
    alert('Edição de produto em desenvolvimento.');
}

function editCadastro(id, type) {
    fetchWithAuth(`/api/${type === 'cliente' ? 'clientes' : 'fornecedores'}`)
        .then(res => res.json())
        .then(data => {
            const item = data.find(i => i.id === id);
            if (item) openEditModal(type, item);
        });
}
