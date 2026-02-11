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

// --- INICIALIZAÇÃO ---
window.onload = function() {
    checkLogin();
    loadDataFromAPI(); 
    
    // Fechar menus ao clicar fora
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-overlay')) {
            closeEditModal();
            closeSelectionModal();
            closeProdutoModal();
            closeNFeModal();
            closeNFeOptionsModal();
            closeUserModal();
        }
    });

    initUserInfo();
    // Carrega a seção inicial
    showSection('dashboard');
};

// --- AUTENTICAÇÃO E LOGIN ---
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
        alert("Acesso restrito ao Administrador.");
        return;
    }

    currentSectionId = id;
    const contentArea = document.getElementById('content-section');
    
    // Feedback visual no menu
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
    } else {
        const targetBtn = Array.from(document.querySelectorAll('.nav-links button')).find(b => b.getAttribute('onclick').includes(`'${id}'`));
        if (targetBtn) targetBtn.classList.add('active');
    }

    // Fecha sidebar no mobile
    if(window.innerWidth <= 1024) {
        const sidebar = document.getElementById('sidebar');
        if(sidebar) sidebar.classList.remove('active');
    }

    try {
        const response = await fetch(`sections/${id}.html`);
        if (response.ok) {
            const html = await response.text();
            contentArea.innerHTML = html;
            
            // Inicializa dados da seção
            initializeSectionData(id);
        } else {
            contentArea.innerHTML = `<h2>Erro ao carregar seção ${id}</h2>`;
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
        const response = await fetch(`${API_URL}/api/movimentacoes`);
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

let financeChart = null;
let stockChart = null;

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
                    borderColor: '#10b981',
                    tension: 0.4
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
                    backgroundColor: ['#E89C31', '#7c3aed', '#94a3b8']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// --- ESTOQUE ---
function renderFullTable() {
    const tbody = document.getElementById('full-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    appData.transactions.forEach(t => {
        const row = `<tr>
            <td>${new Date(t.date).toLocaleDateString('pt-BR')}</td>
            <td><span class="badge ${t.type === 'entrada' ? 'badge-in' : (t.type === 'saida' ? 'badge-out' : 'badge-bra')}">${t.type.toUpperCase()}</span></td>
            <td>${t.productType}</td>
            <td>${t.desc}</td>
            <td>${t.qty}</td>
            <td>R$ ${t.value.toFixed(2)}</td>
            <td>
                <button class="btn-sm" onclick="deleteTransaction(${t.id})" style="color: var(--danger); background: none; border: none; cursor: pointer;"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`;
        tbody.innerHTML += row;
    });
}

async function deleteTransaction(id) {
    if (!confirm("Excluir esta movimentação?")) return;
    try {
        const res = await fetch(`${API_URL}/api/movimentacoes/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadDataFromAPI();
            if (currentSectionId === 'estoque') setTimeout(renderFullTable, 500);
        }
    } catch (e) { console.error(e); }
}

// --- CADASTROS ---
async function loadCadastros() {
    try {
        const [cliRes, fornRes, prodRes] = await Promise.all([
            fetch(`${API_URL}/api/clientes`),
            fetch(`${API_URL}/api/fornecedores`),
            fetch(`${API_URL}/api/produtos`)
        ]);
        
        const clientes = await cliRes.json();
        const fornecedores = await fornRes.json();
        const produtos = await prodRes.json();

        renderEntityList('list-clientes', clientes, 'cliente');
        renderEntityList('list-fornecedores', fornecedores, 'fornecedor');
        renderProdutoList(produtos);
    } catch (e) { console.error(e); }
}

function renderEntityList(containerId, list, type) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = list.length ? '' : '<div style="padding:20px; color:#999; text-align:center;">Nenhum registro.</div>';
    
    list.forEach(item => {
        el.innerHTML += `
            <div class="list-item" style="display:flex; justify-content:space-between; padding:12px 20px; border-bottom:1px solid #eee; align-items:center;">
                <div>
                    <div style="font-weight:600;">${item.nome}</div>
                    <div style="font-size:0.75rem; color:#666;">${item.documento || 'Sem Doc'} | ${item.telefone || 'Sem Tel'}</div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button onclick="openEditModal('${type}', ${item.id})" style="color:var(--accent); background:none; border:none; cursor:pointer;"><i class="fas fa-pen"></i></button>
                    <button onclick="deleteEntity(${item.id}, '${type}')" style="color:var(--danger); background:none; border:none; cursor:pointer;"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
}

function renderProdutoList(list) {
    const el = document.getElementById('list-produtos');
    if (!el) return;
    el.innerHTML = list.length ? '' : '<div style="padding:20px; color:#999; text-align:center;">Nenhum produto.</div>';
    
    list.forEach(item => {
        el.innerHTML += `
            <div class="list-item" style="display:flex; justify-content:space-between; padding:12px 20px; border-bottom:1px solid #eee; align-items:center;">
                <div>
                    <div style="font-weight:600;">${item.nome}</div>
                    <div style="font-size:0.75rem; color:#666;">NCM: ${item.ncm || '-'} | Mín: ${item.estoque_minimo}</div>
                </div>
                <div style="display:flex; gap:15px; align-items:center;">
                    <div style="font-weight:700; color:var(--success);">R$ ${item.preco_venda.toFixed(2)}</div>
                    <button onclick="openProdutoModal(${item.id})" style="color:var(--accent); background:none; border:none; cursor:pointer;"><i class="fas fa-pen"></i></button>
                    <button onclick="deleteProduto(${item.id})" style="color:var(--danger); background:none; border:none; cursor:pointer;"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
}

// --- MODAIS DE CADASTRO ---
function openEditModal(type, id = null) {
    const modal = document.getElementById('modal-edit');
    const title = document.getElementById('modal-title');
    document.getElementById('edit-type').value = type;
    document.getElementById('edit-id').value = id || '';
    
    title.innerText = (id ? 'Editar ' : 'Novo ') + (type === 'cliente' ? 'Cliente' : 'Fornecedor');
    
    if (id) {
        const endpoint = type === 'cliente' ? 'clientes' : 'fornecedores';
        fetch(`${API_URL}/api/${endpoint}`)
            .then(res => res.json())
            .then(data => {
                const item = data.find(i => i.id == id);
                if (item) {
                    document.getElementById('edit-nome').value = item.nome;
                    document.getElementById('edit-doc').value = item.documento || '';
                    document.getElementById('edit-ie').value = item.ie || '';
                    document.getElementById('edit-email').value = item.email || '';
                    document.getElementById('edit-tel').value = item.telefone || '';
                    document.getElementById('edit-endereco').value = item.endereco || '';
                }
            });
    } else {
        document.getElementById('edit-nome').value = '';
        document.getElementById('edit-doc').value = '';
        document.getElementById('edit-ie').value = '';
        document.getElementById('edit-email').value = '';
        document.getElementById('edit-tel').value = '';
        document.getElementById('edit-endereco').value = '';
    }
    modal.classList.add('active');
}

async function saveCadastro(e) {
    e.preventDefault();
    const type = document.getElementById('edit-type').value;
    const id = document.getElementById('edit-id').value;
    const data = {
        nome: document.getElementById('edit-nome').value,
        documento: document.getElementById('edit-doc').value,
        ie: document.getElementById('edit-ie').value,
        email: document.getElementById('edit-email').value,
        telefone: document.getElementById('edit-tel').value,
        endereco: document.getElementById('edit-endereco').value
    };

    const endpoint = type === 'cliente' ? 'clientes' : 'fornecedores';
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/api/${endpoint}/${id}` : `${API_URL}/api/${endpoint}`;
    
    const res = await fetch(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });

    if (res.ok) {
        closeEditModal();
        loadCadastros();
    }
}

async function deleteEntity(id, type) {
    if (!confirm("Excluir este cadastro?")) return;
    const endpoint = type === 'cliente' ? 'clientes' : 'fornecedores';
    await fetch(`${API_URL}/api/${endpoint}/${id}`, { method: 'DELETE' });
    loadCadastros();
}

// --- PRODUTOS ---
function openProdutoModal(id = null) {
    const modal = document.getElementById('modal-produto');
    document.getElementById('prod-id').value = id || '';
    if (id) {
        fetch(`${API_URL}/api/produtos`)
            .then(res => res.json())
            .then(list => {
                const item = list.find(i => i.id == id);
                if (item) {
                    document.getElementById('prod-nome').value = item.nome;
                    document.getElementById('prod-ncm').value = item.ncm || '';
                    document.getElementById('prod-preco').value = item.preco_venda;
                    document.getElementById('prod-min').value = item.estoque_minimo;
                }
            });
    } else {
        document.getElementById('modal-produto').querySelector('form').reset();
    }
    modal.classList.add('active');
}

function closeProdutoModal() {
    document.getElementById('modal-produto').classList.remove('active');
}

async function saveProduto(e) {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    const data = {
        nome: document.getElementById('prod-nome').value,
        ncm: document.getElementById('prod-ncm').value,
        preco_venda: parseFloat(document.getElementById('prod-preco').value),
        estoque_minimo: parseInt(document.getElementById('prod-min').value)
    };
    const method = id ? 'PUT' : 'POST';
    const url = id ? `${API_URL}/api/produtos/${id}` : `${API_URL}/api/produtos`;
    const res = await fetch(url, {
        method,
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    if (res.ok) {
        closeProdutoModal();
        loadCadastros();
    }
}

async function deleteProduto(id) {
    if (!confirm("Excluir este produto?")) return;
    await fetch(`${API_URL}/api/produtos/${id}`, { method: 'DELETE' });
    loadCadastros();
}

// --- OPERACIONAL ---
async function handleEntry(e) {
    e.preventDefault();
    const data = {
        desc: document.getElementById('entry-source').value,
        productType: document.getElementById('entry-type').value,
        qty: parseInt(document.getElementById('entry-qty').value),
        value: parseFloat(document.getElementById('entry-value').value),
        date: document.getElementById('entry-date').value
    };
    const res = await fetch(`${API_URL}/api/entrada`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    if (res.ok) {
        alert("Entrada registrada!");
        e.target.reset();
        loadDataFromAPI();
    }
}

async function handleExit(e) {
    e.preventDefault();
    const data = {
        desc: document.getElementById('exit-dest').value,
        productType: document.getElementById('exit-type').value,
        qty: parseInt(document.getElementById('exit-qty').value),
        value: parseFloat(document.getElementById('exit-value').value),
        date: document.getElementById('exit-date').value
    };
    const res = await fetch(`${API_URL}/api/saida`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    if (res.ok) {
        const result = await res.json();
        if (confirm("Venda registrada! Deseja emitir a NF-e agora?")) {
            showSection('nfe');
            setTimeout(() => openNFeModal(result.id), 500);
        }
        e.target.reset();
        loadDataFromAPI();
    }
}

async function handleExpense(e) {
    e.preventDefault();
    const data = {
        desc: document.getElementById('exp-desc').value,
        value: parseFloat(document.getElementById('exp-value').value),
        date: document.getElementById('exp-date').value
    };
    const res = await fetch(`${API_URL}/api/despesa`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    if (res.ok) {
        alert("Despesa registrada!");
        e.target.reset();
        loadDataFromAPI();
        if (currentSectionId === 'financeiro') updateFinanceKPIs();
    }
}

// --- NF-E ---
async function loadNFe() {
    const tbody = document.getElementById('nfe-table-body');
    if (!tbody) return;
    try {
        const res = await fetch(`${API_URL}/api/nfe`);
        const list = await res.json();
        tbody.innerHTML = list.length ? '' : '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma nota emitida.</td></tr>';
        list.forEach(n => {
            tbody.innerHTML += `<tr>
                <td>${new Date(n.data_emissao).toLocaleDateString('pt-BR')}</td>
                <td>#${n.venda_id}</td>
                <td style="font-family:monospace; font-size:0.8rem;">${n.chave_acesso}</td>
                <td><span class="badge badge-in">${n.status.toUpperCase()}</span></td>
                <td>
                    <button class="btn-primary btn-sm" onclick="openNFeOptions(${n.id}, '${n.chave_acesso}')"><i class="fas fa-cog"></i> Opções</button>
                </td>
            </tr>`;
        });
    } catch (e) { console.error(e); }
}

function openNFeModal(vendaId = null) {
    const modal = document.getElementById('modal-nfe');
    const select = document.getElementById('nfe-venda-id');
    modal.classList.add('active');
    
    // Carrega vendas recentes que não têm NF-e
    fetch(`${API_URL}/api/movimentacoes`)
        .then(res => res.json())
        .then(movs => {
            const vendas = movs.filter(m => m.tipo === 'saida');
            select.innerHTML = '<option value="">Selecione uma venda...</option>';
            vendas.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v.id;
                opt.innerText = `Venda #${v.id} - ${v.descricao} (R$ ${v.valor.toFixed(2)})`;
                if (v.id == vendaId) opt.selected = true;
                select.appendChild(opt);
            });
            if (vendaId) updateNFePreview();
        });
}

function closeNFeModal() {
    document.getElementById('modal-nfe').classList.remove('active');
}

function updateNFePreview() {
    const id = document.getElementById('nfe-venda-id').value;
    const preview = document.getElementById('nfe-preview');
    const content = document.getElementById('nfe-preview-content');
    if (!id) { preview.style.display = 'none'; return; }
    
    fetch(`${API_URL}/api/movimentacoes`)
        .then(res => res.json())
        .then(movs => {
            const v = movs.find(m => m.id == id);
            if (v) {
                preview.style.display = 'block';
                content.innerHTML = `
                    <strong>Destinatário:</strong> ${v.desc}<br>
                    <strong>Produto:</strong> Cebola ${v.productType}<br>
                    <strong>Quantidade:</strong> ${v.qty} Caixas<br>
                    <strong>Valor Total:</strong> R$ ${v.valor.toFixed(2)}
                `;
            }
        });
}

async function handleGerarNFe(e) {
    e.preventDefault();
    const vendaId = document.getElementById('nfe-venda-id').value;
    const btn = document.getElementById('btn-emitir-nfe');
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Transmitindo...';

    try {
        const movs = await (await fetch(`${API_URL}/api/movimentacoes`)).json();
        const venda = movs.find(m => m.id == vendaId);
        if (!venda) throw new Error("Venda não encontrada.");
        
        const clientes = await (await fetch(`${API_URL}/api/clientes`)).json();
        const cliente = clientes.find(c => c.nome === venda.desc) || { 
            nome: venda.desc, 
            documento: '00000000000', 
            ie: '', 
            email: '',
            endereco: '{"xLgr":"Endereço não cadastrado","nro":"SN","xBairro":"Bairro","cMun":"3541406","xMun":"Presidente Prudente","UF":"SP","CEP":"19000000"}'
        };

        const nfeData = {
            venda_id: venda.id,
            emitente: { 
                cnpj: document.getElementById('nfe-emit-cnpj').value, 
                nome: document.getElementById('nfe-emit-nome').value, 
                fantasia: document.getElementById('nfe-emit-fantasia').value, 
                ie: document.getElementById('nfe-emit-ie').value,
                endereco: JSON.parse(document.getElementById('nfe-emit-endereco').value)
            },
            destinatario: { 
                nome: cliente.nome,
                documento: cliente.documento.replace(/\D/g, ''), 
                ie: cliente.ie ? cliente.ie.replace(/\D/g, '') : '', 
                email: cliente.email,
                endereco: typeof cliente.endereco === 'string' ? JSON.parse(cliente.endereco) : cliente.endereco
            },
            itens: [{ 
                id: '001',
                nome: `CEBOLA ${venda.productType.toUpperCase()}`, 
                ncm: '07031019', 
                quantidade: venda.qty, 
                valor: (venda.valor / venda.qty)
            }]
        };

        const res = await fetch(`${API_URL}/api/nfe/gerar`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(nfeData)
        });

        if (res.ok) {
            const result = await res.json();
            alert("NF-e Autorizada com Sucesso!");
            closeNFeModal();
            loadNFe();
            showNFeAnimation();
        } else {
            const errorData = await res.json();
            alert("Erro ao transmitir NF-e: " + (errorData.error || "Erro desconhecido"));
        }
    } catch (e) { console.error(e); } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-file-export"></i> Transmitir NF-e';
    }
}

function showNFeAnimation() {
    const div = document.createElement('div');
    div.style.position = 'fixed';
    div.style.top = '50%';
    div.style.left = '50%';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.background = 'var(--success)';
    div.style.color = 'white';
    div.style.padding = '40px';
    div.style.borderRadius = '20px';
    div.style.zIndex = '100000';
    div.style.textAlign = 'center';
    div.style.boxShadow = '0 20px 50px rgba(0,0,0,0.3)';
    div.innerHTML = '<i class="fas fa-check-circle" style="font-size: 4rem; margin-bottom: 20px; display: block;"></i><h2 style="margin:0;">NF-e GERADA!</h2>';
    document.body.appendChild(div);
    
    div.animate([
        { opacity: 0, transform: 'translate(-50%, -50%) scale(0.5)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }
    ], { duration: 500, easing: 'ease-out' });

    setTimeout(() => {
        div.animate([
            { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' },
            { opacity: 0, transform: 'translate(-50%, -50%) scale(1.5)' }
        ], { duration: 500, easing: 'ease-in' }).onfinish = () => div.remove();
    }, 2000);
}

let currentNFeId = null;
let currentNFeChave = '';

function openNFeOptions(id, chave) {
    currentNFeId = id;
    currentNFeChave = chave;
    document.getElementById('nfe-options-info').innerText = `Nota Fiscal #${id} - Chave: ${chave.slice(0,20)}...`;
    document.getElementById('modal-nfe-options').classList.add('active');
}

function closeNFeOptionsModal() {
    document.getElementById('modal-nfe-options').classList.remove('active');
}

function downloadNFePDF() {
    if (!currentNFeId) return;
    window.location.href = `${API_URL}/api/nfe/${currentNFeId}/pdf`;
}

function downloadNFeXML() {
    if (!currentNFeId) return;
    window.location.href = `${API_URL}/api/nfe/${currentNFeId}/xml`;
}

function openNFePDF() {
    // Em um sistema real, abriria o PDF gerado. Aqui simulamos abrindo o portal da NF-e com a chave
    window.open(`https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx?tipoConsulta=resumo&tipoConteudo=7PhJ+gAVw2g=&chaveAcesso=${currentNFeChave}`, '_blank');
}

// --- SELEÇÃO (LUPA) ---
function openSelectionModal(type) {
    currentSelectionTarget = type;
    const modal = document.getElementById('modal-selection');
    const list = document.getElementById('selection-list');
    const title = document.getElementById('selection-title');
    
    title.innerText = type === 'cliente' ? 'Selecionar Cliente' : 'Selecionar Fornecedor';
    list.innerHTML = '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i></div>';
    modal.classList.add('active');
    
    const endpoint = type === 'cliente' ? 'clientes' : 'fornecedores';
    fetch(`${API_URL}/api/${endpoint}`)
        .then(res => res.json())
        .then(data => {
            list.innerHTML = '';
            data.forEach(item => {
                const div = document.createElement('div');
                div.className = 'selection-item';
                div.style.padding = '12px 20px';
                div.style.borderBottom = '1px solid #eee';
                div.style.cursor = 'pointer';
                div.innerText = item.nome;
                div.onclick = () => {
                    const inputId = currentSelectionTarget === 'cliente' ? 'exit-dest' : 'entry-source';
                    document.getElementById(inputId).value = item.nome;
                    closeSelectionModal();
                };
                list.appendChild(div);
            });
        });
}

function closeSelectionModal() {
    document.getElementById('modal-selection').classList.remove('active');
}

function filterSelection() {
    const term = document.getElementById('search-selection').value.toLowerCase();
    document.querySelectorAll('.selection-item').forEach(item => {
        item.style.display = item.innerText.toLowerCase().includes(term) ? 'block' : 'none';
    });
}

// --- FINANCEIRO ---
function updateFinanceKPIs() {
    const revenue = appData.transactions.filter(t => t.type === 'saida').reduce((acc, curr) => acc + curr.value, 0);
    const expenses = appData.transactions.filter(t => t.type === 'entrada' || t.type === 'despesa').reduce((acc, curr) => acc + curr.value, 0);
    
    const inEl = document.getElementById('fin-total-in');
    if (inEl) inEl.innerText = `R$ ${revenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    const outEl = document.getElementById('fin-total-out');
    if (outEl) outEl.innerText = `R$ ${expenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    
    const balEl = document.getElementById('fin-balance');
    if (balEl) {
        const bal = revenue - expenses;
        balEl.innerText = `R$ ${bal.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
        balEl.className = bal >= 0 ? 'text-success' : 'text-danger';
    }
}

// --- CONFIGURAÇÕES & USUÁRIOS ---
async function loadUsers() {
    const el = document.getElementById('list-users');
    if (!el) return;
    try {
        const res = await fetch(`${API_URL}/api/usuarios`);
        const list = await res.json();
        el.innerHTML = '';
        list.forEach(u => {
            el.innerHTML += `
                <div class="list-item" style="display:flex; justify-content:space-between; padding:12px 20px; border-bottom:1px solid #eee; align-items:center;">
                    <div>
                        <div style="font-weight:600;">${u.username}</div>
                        <div style="font-size:0.75rem; color:#666;">${u.label} | ${u.role}</div>
                    </div>
                    <button onclick="deleteUser(${u.id})" style="color:var(--danger); background:none; border:none; cursor:pointer;"><i class="fas fa-trash"></i></button>
                </div>
            `;
        });
    } catch (e) { console.error(e); }
}

function openUserModal() {
    document.getElementById('modal-user').classList.add('active');
}

function closeUserModal() {
    document.getElementById('modal-user').classList.remove('active');
}

async function saveUser(e) {
    e.preventDefault();
    const data = {
        username: document.getElementById('user-username').value,
        password: document.getElementById('user-password').value,
        label: document.getElementById('user-label').value,
        role: document.getElementById('user-role').value
    };
    const res = await fetch(`${API_URL}/api/usuarios`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    });
    if (res.ok) {
        closeUserModal();
        loadUsers();
    }
}

async function deleteUser(id) {
    if (!confirm("Excluir este usuário?")) return;
    await fetch(`${API_URL}/api/usuarios/${id}`, { method: 'DELETE' });
    loadUsers();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}
