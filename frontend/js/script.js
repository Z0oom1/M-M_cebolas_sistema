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
    const isElectron = window.location.protocol === 'file:';
    const titlebar = document.getElementById('titlebar');
    
    if (isElectron) {
        if (titlebar) titlebar.style.display = 'flex';
        
        try {
            const { ipcRenderer } = require('electron');
            document.getElementById('closeBtn')?.addEventListener('click', () => ipcRenderer.send('close-app'));
            document.getElementById('minBtn')?.addEventListener('click', () => ipcRenderer.send('minimize-app'));
            document.getElementById('maxBtn')?.addEventListener('click', () => ipcRenderer.send('maximize-app'));
        } catch (e) {
            console.warn("Electron IPC não disponível:", e);
        }
    } else {
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
    });
}

async function loadDataFromAPI() {
    try {
        const [trans, prods, clis, sups, usrs] = await Promise.all([
            fetchWithAuth('/api/movimentacoes').then(r => r.json()),
            fetchWithAuth('/api/produtos').then(r => r.json()),
            fetchWithAuth('/api/clientes').then(r => r.json()),
            fetchWithAuth('/api/fornecedores').then(r => r.json()),
            fetchWithAuth('/api/usuarios').then(r => r.json())
        ]);
        appData = { transactions: trans, products: prods, clients: clis, suppliers: sups, users: usrs };
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
        const stockMap = calculateStock();
        updateDashboardKPIs(stockMap);
        renderCharts(stockMap);
        renderRecentTransactions();
    }
    if (id === 'entrada' || id === 'saida') {
        renderProductShowcase(id);
    }
    if (id === 'cadastro') {
        loadCadastros();
    }
    if (id === 'financeiro') {
        updateFinanceKPIs();
        renderFinanceChart();
        renderFinanceTable();
    }
    if (id === 'estoque') renderStockTable();
    if (id === 'nfe') loadNFeTable();
    
    if (id === 'config') {
        loadConfigData();
        if (!isAdmin) {
            const adminSelectors = [
                '#admin-users-panel', 
                '#admin-entities-panel', 
                '#admin-products-panel', 
                '.panel:has(.btn-danger)'
            ];
            adminSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => el.style.display = 'none');
            });
            
            const panels = document.querySelectorAll('.panel');
            panels.forEach(p => {
                if (p.textContent.includes('Zona de Perigo') || p.textContent.includes('Usuários e Acessos')) {
                    p.style.display = 'none';
                }
            });
        }
    }
}

function calculateStock() {
    const stockMap = {};
    appData.transactions.forEach(t => {
        if (!stockMap[t.produto]) stockMap[t.produto] = 0;
        if (t.tipo === 'entrada') stockMap[t.produto] += t.quantidade;
        if (t.tipo === 'saida') stockMap[t.produto] -= t.quantidade;
    });
    return stockMap;
}

function updateDashboardKPIs(stockMap) {
    const totalStock = Object.values(stockMap).reduce((a, b) => a + b, 0);
    const dashStock = document.getElementById('dash-stock');
    if (dashStock) dashStock.innerText = `${totalStock} Cx`;

    let revenue = 0, expenses = 0;
    const now = new Date();
    appData.transactions.forEach(t => {
        const tDate = new Date(t.data);
        if (tDate.getMonth() === now.getMonth() && tDate.getFullYear() === now.getFullYear()) {
            if (t.tipo === 'saida') revenue += t.valor;
            if (t.tipo === 'entrada' || t.tipo === 'despesa') expenses += t.valor;
        }
    });

    const dRev = document.getElementById('dash-revenue');
    const dExp = document.getElementById('dash-expenses');
    const dPro = document.getElementById('dash-profit');
    const dDate = document.getElementById('current-date');

    if (dRev) dRev.innerText = `R$ ${revenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (dExp) dExp.innerText = `R$ ${expenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (dPro) dPro.innerText = `R$ ${(revenue - expenses).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (dDate) dDate.innerText = now.toLocaleDateString('pt-BR');
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
            <div class="product-icon" style="background: ${p.cor}20; color: ${p.cor}">
                <i class="fas ${p.icone || 'fa-box'}"></i>
            </div>
            <div class="product-info">
                <strong>${p.nome}</strong>
                <span>Estoque: ${qty} Cx</span>
            </div>
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

function openEditModal(type, data = null) {
    const modal = document.getElementById('modal-edit');
    modal.classList.add('active');
    document.getElementById('modal-title').innerText = (data ? 'Editar ' : 'Novo ') + type.charAt(0).toUpperCase() + type.slice(1);
    document.getElementById('edit-type').value = type;
    document.getElementById('edit-id').value = data ? data.id : '';
    document.getElementById('edit-nome').value = data ? data.nome : '';
    document.getElementById('edit-doc').value = data ? data.documento : '';
    document.getElementById('edit-tel').value = data ? data.telefone : '';
}
function closeEditModal() { document.getElementById('modal-edit').classList.remove('active'); }

async function saveCadastro(event) {
    event.preventDefault();
    const type = document.getElementById('edit-type').value;
    const data = {
        id: document.getElementById('edit-id').value || null,
        nome: document.getElementById('edit-nome').value,
        documento: document.getElementById('edit-doc').value,
        telefone: document.getElementById('edit-tel').value
    };
    const res = await fetchWithAuth(`/api/${type}s`, { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { 
        showSuccess("Cadastro salvo!"); 
        closeEditModal(); 
        await loadDataFromAPI(); 
        if (currentSectionId === 'config') loadConfigData();
    }
}

async function deleteCadastro(type, id) {
    if (!confirm(`Excluir este ${type}?`)) return;
    const res = await fetchWithAuth(`/api/cadastros/${type}/${id}`, { method: 'DELETE' });
    if (res && res.ok) { 
        showSuccess("Registro excluído!"); 
        await loadDataFromAPI(); 
        if (currentSectionId === 'config') loadConfigData();
    }
}

function openProdutoModal(data = null) {
    const modal = document.getElementById('modal-produto');
    modal.classList.add('active');
    document.getElementById('prod-id').value = data ? data.id : '';
    document.getElementById('prod-nome').value = data ? data.nome : '';
    document.getElementById('prod-ncm').value = data ? data.ncm : '';
    document.getElementById('prod-preco').value = data ? data.preco_venda : '';
    document.getElementById('prod-cor').value = data ? data.cor : '#1A5632';
    document.getElementById('prod-icone').value = data ? data.icone : 'fa-box';
    
    document.querySelectorAll('.icon-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.icon === (data ? data.icone : 'fa-box'));
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
        cor: document.getElementById('prod-cor').value,
        icone: document.getElementById('prod-icone').value
    };
    const res = await fetchWithAuth('/api/produtos', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { 
        showSuccess("Produto salvo!"); 
        closeProdutoModal(); 
        await loadDataFromAPI(); 
        if (currentSectionId === 'config') loadConfigData();
    }
}

async function deleteProduto(id) {
    if (!confirm("Excluir este produto?")) return;
    const res = await fetchWithAuth(`/api/produtos/${id}`, { method: 'DELETE' });
    if (res && res.ok) { 
        showSuccess("Produto excluído!"); 
        await loadDataFromAPI(); 
        if (currentSectionId === 'config') loadConfigData();
    }
}

async function saveEntrada(event) {
    event.preventDefault();
    const data = {
        tipo: 'entrada',
        produto: document.getElementById('entry-product').value,
        quantidade: parseInt(document.getElementById('entry-qty').value),
        valor: parseFloat(document.getElementById('entry-value').value),
        descricao: document.getElementById('entry-desc').value,
        data: new Date().toISOString()
    };
    const res = await fetchWithAuth('/api/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { showSuccess("Entrada registrada!"); loadDataFromAPI(); }
}

async function saveSaida(event) {
    event.preventDefault();
    const data = {
        tipo: 'saida',
        produto: document.getElementById('exit-product').value,
        quantidade: parseInt(document.getElementById('exit-qty').value),
        valor: parseFloat(document.getElementById('exit-value').value),
        descricao: document.getElementById('exit-desc').value,
        data: new Date().toISOString()
    };
    const res = await fetchWithAuth('/api/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        const result = await res.json();
        showSuccess("Venda realizada!");
        if (confirm("Deseja emitir a NF-e agora?")) {
            emitirNFe(result.id, data.descricao, [{ produto: data.produto, qtd: data.quantidade, valor: data.valor }]);
        }
        loadDataFromAPI();
    }
}

async function emitirNFe(vendaId, cliente, itens) {
    const res = await fetchWithAuth('/api/nfe/gerar', {
        method: 'POST',
        body: JSON.stringify({ venda_id: vendaId, destinatario: cliente, itens })
    });
    if (res && res.ok) {
        showSuccess("NF-e Emitida com Sucesso!");
        showSection('nfe');
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
function closeUsuarioModal() { 
    const modal = document.getElementById('modal-usuario');
    if (modal) modal.classList.remove('active'); 
}

async function saveUsuario(event) {
    event.preventDefault();
    const id = document.getElementById('user-id').value;
    const data = {
        label: document.getElementById('user-label').value,
        username: document.getElementById('user-username').value,
        password: document.getElementById('user-password').value,
        role: document.getElementById('user-role').value
    };
    
    const url = id ? `/api/usuarios/${id}` : '/api/usuarios';
    const method = id ? 'PUT' : 'POST';
    
    const res = await fetchWithAuth(url, { method: method, body: JSON.stringify(data) });
    if (res && res.ok) { 
        showSuccess("Usuário salvo!"); 
        closeUsuarioModal(); 
        await loadDataFromAPI(); 
        if (currentSectionId === 'config') loadConfigData();
    }
}

async function deleteUsuario(id) {
    if (id == 1) { showError("Não é possível excluir o admin principal."); return; }
    if (!confirm("Excluir este funcionário?")) return;
    const res = await fetchWithAuth(`/api/usuarios/${id}`, { method: 'DELETE' });
    if (res && res.ok) { 
        showSuccess("Excluído!"); 
        await loadDataFromAPI(); 
        if (currentSectionId === 'config') loadConfigData();
    }
}

function updateFinanceKPIs() {
    let totalRevenue = 0, totalExpenses = 0;
    appData.transactions.forEach(t => {
        if (t.tipo === 'saida') totalRevenue += t.valor;
        if (t.tipo === 'entrada' || t.tipo === 'despesa') totalExpenses += t.valor;
    });
    const finIn = document.getElementById('fin-total-in');
    const finOut = document.getElementById('fin-total-out');
    const finBal = document.getElementById('fin-balance');
    if (finIn) finIn.innerText = `R$ ${totalRevenue.toLocaleString('pt-BR')}`;
    if (finOut) finOut.innerText = `R$ ${totalExpenses.toLocaleString('pt-BR')}`;
    if (finBal) finBal.innerText = `R$ ${(totalRevenue - totalExpenses).toLocaleString('pt-BR')}`;
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
    const res = await fetchWithAuth('/api/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) { 
        showSuccess("Despesa lançada!"); 
        loadDataFromAPI(); 
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
            <td><span class="badge ${t.tipo}">${t.tipo.toUpperCase()}</span></td>
            <td>${t.descricao}</td>
            <td style="color: ${t.tipo === 'saida' ? 'var(--primary)' : 'var(--danger)'}">R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
        `;
        tbody.appendChild(tr);
    });
}

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
            <td>R$ ${t.valor.toLocaleString('pt-BR')}</td>
            <td style="text-align: right;"><button class="btn-icon text-danger" onclick="deleteMovimentacao(${t.id})"><i class="fas fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteMovimentacao(id) {
    if (!confirm("Excluir este registro permanentemente?")) return;
    const res = await fetchWithAuth(`/api/movimentacoes/${id}`, { method: 'DELETE' });
    if (res && res.ok) { 
        showSuccess("Registro excluído!"); 
        await loadDataFromAPI(); 
        if (currentSectionId === 'estoque') renderStockTable();
        if (currentSectionId === 'dashboard') renderRecentTransactions();
    }
}

function openNFeModal() {
    showSection('saida');
    showSuccess("Selecione uma venda para emitir a nota.");
}

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
            <td><span class="badge entrada">${n.status.toUpperCase()}</span></td>
            <td style="text-align: right;">
                <button class="btn-icon" onclick="downloadXML(${n.id})" title="Baixar XML"><i class="fas fa-file-code"></i> Baixar XML</button>
                <button class="btn-icon" onclick="downloadPDF(${n.id})" title="Imprimir DANFE"><i class="fas fa-file-pdf"></i> Imprimir PDF</button>
            </td>`;
        tbody.appendChild(tr);
    });
}

async function downloadXML(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/api/nfe/${id}/xml`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NFe_${id}.xml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        showError("Erro ao baixar XML.");
    }
}

async function downloadPDF(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/api/nfe/${id}/pdf`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DANFE_${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (err) {
        showError("Erro ao baixar PDF.");
    }
}

function openSearchModal(type) {
    const modal = document.getElementById('modal-search');
    const input = document.getElementById('search-input');
    const typeInput = document.getElementById('search-type');
    
    if (modal) modal.classList.add('active');
    if (typeInput) typeInput.value = type;
    if (input) {
        input.value = '';
        input.placeholder = `Buscar ${type}...`;
        input.focus();
    }
    renderSearchList(type, '');
}

function renderSearchList(type, filter) {
    const list = document.getElementById('search-list');
    if (!list) return;
    list.innerHTML = '';
    const items = type === 'cliente' ? appData.clients : appData.suppliers;
    
    items.filter(i => i.nome.toLowerCase().includes(filter.toLowerCase())).forEach(i => {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.innerHTML = `<strong>${i.nome}</strong><br><small>${i.documento}</small>`;
        div.onclick = () => {
            const target = type === 'cliente' ? 'exit-client' : 'entry-supplier';
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.value = i.nome;
            const modal = document.getElementById('modal-search');
            if (modal) modal.classList.remove('active');
        };
        list.appendChild(div);
    });
}

function closeSearchModal() { 
    const modal = document.getElementById('modal-search');
    if (modal) modal.classList.remove('active'); 
}

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
        const listUser = document.getElementById('list-usuarios');
        if (listUser) {
            listUser.innerHTML = '';
            appData.users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${u.label}</td><td>${u.username}</td><td><span class="badge admin">${u.role.toUpperCase()}</span></td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick='openUsuarioModal(${JSON.stringify(u)})'><i class="fas fa-edit"></i></button>
                        <button class="btn-icon text-danger" onclick="deleteUsuario(${u.id})"><i class="fas fa-trash"></i></button>
                    </td>`;
                listUser.appendChild(tr);
            });
        }
        
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
    if (!confirm("⚠️ ATENÇÃO: Esta ação apagará todos os dados (exceto usuários). Deseja continuar?")) return;
    const res = await fetchWithAuth('/api/reset', { method: 'DELETE' });
    if (res && res.ok) { showSuccess("Sistema reiniciado!"); window.location.reload(); }
}

async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) { window.location.href = 'login.html'; return; }
    
    options.headers = { ...options.headers, 'Authorization': `Bearer ${token}` };
    if (options.body && !options.headers['Content-Type']) {
        options.headers['Content-Type'] = 'application/json';
    }

    try {
        const res = await fetch(API_URL + url, options);
        if (res.status === 401 || res.status === 403) { logout(); return; }
        return res;
    } catch (err) {
        showError("Erro de conexão com o servidor.");
        return null;
    }
}

function showSuccess(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.4s reverse forwards';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function showError(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastIn 0.4s reverse forwards';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

function checkLogin() { if (!localStorage.getItem('token')) window.location.href = 'login.html'; }
function logout() { localStorage.removeItem('token'); localStorage.removeItem('mm_user'); window.location.href = 'login.html'; }

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
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }
}

function renderFinanceChart() {
    const ctxFin = document.getElementById('financeChart');
    if (ctxFin) {
        if (financeChart) financeChart.destroy();
        const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];
        financeChart = new Chart(ctxFin, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    { label: 'Entradas', data: [12000, 19000, 15000, 25000, 22000, 30000], borderColor: '#1A5632', tension: 0.4 },
                    { label: 'Saídas', data: [8000, 15000, 12000, 18000, 16000, 22000], borderColor: '#E89C31', tension: 0.4 }
                ]
            },
            options: { maintainAspectRatio: false }
        });
    }
}

function selectIcon(el, icon) {
    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('prod-icone').value = icon;
}

function selectColor(el, color) {
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.remove('active');
        opt.style.borderColor = 'transparent';
    });
    el.classList.add('active');
    el.style.borderColor = 'var(--primary)';
    document.getElementById('prod-cor').value = color;
}
