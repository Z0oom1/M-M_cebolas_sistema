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
    // Mantido para compatibilidade
}

async function loadDataFromAPI() {
    try {
        const user = JSON.parse(localStorage.getItem('mm_user') || '{}');
        const isAdmin = user.role === 'admin';

        const promises = [
            fetchWithAuth('/api/movimentacoes').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/api/produtos').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/api/clientes').then(r => r && r.ok ? r.json() : []),
            fetchWithAuth('/api/fornecedores').then(r => r && r.ok ? r.json() : [])
        ];

        if (isAdmin) {
            promises.push(fetchWithAuth('/api/usuarios').then(r => r && r.ok ? r.json() : []));
        } else {
            promises.push(Promise.resolve([]));
        }

        const [trans, prods, clis, sups, usrs] = await Promise.all(promises);
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
        if (isAdmin) {
            loadLogs();
        } else {
            const adminSelectors = [
                '#admin-users-panel', 
                '#admin-logs-panel',
                '#admin-entities-panel', 
                '#admin-products-panel', 
                '#admin-danger-panel'
            ];
            adminSelectors.forEach(selector => {
                const elements = document.querySelectorAll(selector);
                elements.forEach(el => el.style.display = 'none');
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
            <td><span class="badge ${t.tipo}">${t.tipo === 'entrada' ? 'COMPRA' : (t.tipo === 'saida' ? 'VENDA' : t.tipo.toUpperCase())}</span></td>
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
            <div class="product-icon-circle" style="background: ${p.cor}20; color: ${p.cor}">
                <i class="fas ${p.icone || 'fa-box'}"></i>
            </div>
            <div class="product-name">${p.nome}</div>
            <div class="product-stock">${qty} Cx</div>
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
    
    const priceInput = document.getElementById(section === 'entrada' ? 'entry-value' : 'exit-value');
    if (priceInput && p.preco_venda) {
        priceInput.value = p.preco_venda;
    }

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
                <button class="btn-icon text-danger" onclick="deleteCadastro('produto', ${p.id})"><i class="fas fa-trash"></i></button></td>` : '<td>-</td>';
            tr.innerHTML = `<td><i class="fas ${p.icone || 'fa-box'}" style="color: ${p.cor}"></i> ${p.nome}</td><td>${p.ncm}</td>
                <td>R$ ${p.preco_venda.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>${actions}`;
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

    const endpoint = type === 'cliente' ? '/api/clientes' : '/api/fornecedores';
    try {
        const res = await fetchWithAuth(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
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
    } catch (err) {
        showError("Erro na conexão com o servidor.");
    }
}

async function deleteCadastro(type, id) {
    if (!confirm(`Excluir este ${type} permanentemente?`)) return;
    const res = await fetchWithAuth(`/api/cadastros/${type}/${id}`, { method: 'DELETE' });
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
    } else {
        document.getElementById('prod-id').value = '';
        document.querySelector('#modal-produto form').reset();
    }
}

function closeProdutoModal() {
    const modal = document.getElementById('modal-produto');
    if (modal) modal.classList.remove('active');
}

async function saveProduto(event) {
    event.preventDefault();
    const id = document.getElementById('prod-id').value;
    const data = {
        id: id || null,
        nome: document.getElementById('prod-nome').value,
        ncm: document.getElementById('prod-ncm').value,
        preco_venda: parseFloat(document.getElementById('prod-preco').value),
        icone: document.getElementById('prod-icone').value,
        cor: document.getElementById('prod-cor').value
    };

    try {
        const res = await fetchWithAuth('/api/produtos', {
            method: 'POST',
            body: JSON.stringify(data)
        });
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
    } catch (err) {
        showError("Erro na conexão.");
    }
}

async function saveMovimentacao(type, event) {
    event.preventDefault();
    const prefix = type === 'entrada' ? 'entry' : 'exit';
    const data = {
        tipo: type,
        produto: document.getElementById(`${prefix}-product`).value,
        quantidade: parseInt(document.getElementById(`${prefix}-qty`).value),
        valor: parseFloat(document.getElementById(`${prefix}-value`).value),
        descricao: document.getElementById(`${prefix}-desc`).value,
        data: document.getElementById(`${prefix}-data`).value || new Date().toISOString()
    };

    const res = await fetchWithAuth('/api/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess("Movimentação registrada!");
        await loadDataFromAPI();
        event.target.reset();
        if (type === 'saida' && confirm("Deseja emitir NF-e para esta venda?")) {
            const result = await res.json();
            gerarNFe(result.id, data.descricao, [{ produto: data.produto, qtd: data.quantidade, valor: data.valor }]);
        }
    }
}

async function gerarNFe(vendaId, destinatario, itens) {
    showSuccess("Gerando NF-e...");
    const res = await fetchWithAuth('/api/nfe/gerar', {
        method: 'POST',
        body: JSON.stringify({ venda_id: vendaId, destinatario, itens })
    });
    if (res && res.ok) {
        showSuccess("NF-e gerada com sucesso!");
        showSection('nfe');
    } else {
        const err = await res.json();
        showError("Erro ao gerar NF-e: " + (err.error || "Erro desconhecido"));
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
    if (finIn) finIn.innerText = `R$ ${totalRevenue.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (finOut) finOut.innerText = `R$ ${totalExpenses.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
    if (finBal) finBal.innerText = `R$ ${(totalRevenue - totalExpenses).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
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
            <td><span class="badge ${t.tipo}">${t.tipo === 'entrada' ? 'COMPRA' : (t.tipo === 'saida' ? 'VENDA' : t.tipo.toUpperCase())}</span></td>
            <td>${t.produto}</td>
            <td>${t.descricao}</td>
            <td>${t.quantidade}</td>
            <td>R$ ${t.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
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
                <button class="btn-icon" onclick="downloadXML(${n.id})" title="Baixar XML"><i class="fas fa-file-code"></i> XML</button>
                <button class="btn-icon" onclick="downloadPDF(${n.id})" title="Imprimir DANFE"><i class="fas fa-file-pdf"></i> PDF</button>
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
        if (!res.ok) throw new Error("Erro ao baixar XML");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NFe_${id}.xml`;
        a.click();
    } catch (err) {
        showError(err.message);
    }
}

async function downloadPDF(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/api/nfe/${id}/pdf`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Erro ao baixar PDF");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DANFE_${id}.pdf`;
        a.click();
    } catch (err) {
        showError(err.message);
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
            const target = type === 'cliente' ? 'exit-desc' : 'entry-desc';
            const targetEl = document.getElementById(target);
            if (targetEl) targetEl.value = i.nome;
            closeSearchModal();
        };
        list.appendChild(div);
    });
}

function closeSearchModal() { 
    const modal = document.getElementById('modal-search');
    if (modal) modal.classList.remove('active'); 
}

async function loadConfigData() {
    const res = await fetchWithAuth('/api/configs');
    if (res && res.ok) {
        const configs = await res.json();
        if (configs.nfe_modo) {
            const radio = document.querySelector(`input[name="nfe_modo"][value="${configs.nfe_modo}"]`);
            if (radio) radio.checked = true;
        }
        if (configs.cert_password) {
            const passInput = document.getElementById('cert-password');
            if (passInput) passInput.value = configs.cert_password;
        }
    }
    
    const user = JSON.parse(localStorage.getItem('mm_user') || '{}');
    if (user.role === 'admin') {
        const listUser = document.getElementById('list-usuarios');
        if (listUser) {
            listUser.innerHTML = '';
            appData.users.forEach(u => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${u.label}</td><td>${u.username}</td><td><span class="badge ${u.role}">${u.role.toUpperCase()}</span></td>
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
                tr.innerHTML = `<td>${c.nome}</td><td style="text-align: right;">
                    <button class="btn-icon" onclick='openEditModal("cliente", ${JSON.stringify(c)})'><i class="fas fa-edit"></i></button>
                    <button class="btn-icon text-danger" onclick="deleteCadastro('cliente', ${c.id})"><i class="fas fa-trash"></i></button></td>`;
                listCliConfig.appendChild(tr);
            });
        }

        const listFornConfig = document.getElementById('config-list-fornecedores');
        if (listFornConfig) {
            listFornConfig.innerHTML = '';
            appData.suppliers.forEach(f => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td>${f.nome}</td><td style="text-align: right;">
                    <button class="btn-icon" onclick='openEditModal("fornecedor", ${JSON.stringify(f)})'><i class="fas fa-edit"></i></button>
                    <button class="btn-icon text-danger" onclick="deleteCadastro('fornecedor', ${f.id})"><i class="fas fa-trash"></i></button></td>`;
                listFornConfig.appendChild(tr);
            });
        }

        const listProdConfig = document.getElementById('config-list-produtos');
        if (listProdConfig) {
            listProdConfig.innerHTML = '';
            appData.products.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `<td><i class="fas ${p.icone || 'fa-box'}" style="color: ${p.cor}"></i> ${p.nome}</td>
                    <td>R$ ${p.preco_venda.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</td>
                    <td style="text-align: right;">
                        <button class="btn-icon" onclick='openProdutoModal(${JSON.stringify(p)})'><i class="fas fa-edit"></i></button>
                        <button class="btn-icon text-danger" onclick="deleteCadastro('produto', ${p.id})"><i class="fas fa-trash"></i></button></td>`;
                listProdConfig.appendChild(tr);
            });
        }
    }
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
        console.error("Erro na requisição:", err);
        return null;
    }
}

function checkLogin() {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return;
    }
    
    const user = JSON.parse(localStorage.getItem('mm_user') || '{}');
    // Restringir acesso ao menu de configurações apenas para Admin
    const configBtn = document.querySelector('.nav-item[onclick*="config"]');
    if (configBtn && user.role !== 'admin') {
        configBtn.style.display = 'none';
    }
}

function logout() {
    localStorage.clear();
    window.location.href = 'login.html';
}

function showSuccess(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast success';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function showError(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function renderCharts(stockMap) {
    // Implementação simplificada para evitar erros se o Chart.js não estiver pronto
    const ctx = document.getElementById('stockChart');
    if (!ctx) return;
    if (stockChart) stockChart.destroy();
    stockChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(stockMap),
            datasets: [{
                label: 'Estoque Atual (Cx)',
                data: Object.values(stockMap),
                backgroundColor: '#1A5632'
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

function renderFinanceChart() {
    const ctx = document.getElementById('financeChart');
    if (!ctx) return;
    // Lógica de gráfico financeiro aqui
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

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

    const res = await fetchWithAuth('/api/usuarios', { method: 'POST', body: JSON.stringify(data) });
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
    const res = await fetchWithAuth(`/api/usuarios/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess("Usuário excluído!");
        await loadDataFromAPI();
        loadConfigData();
    }
}

async function loadLogs() {
    const listLogs = document.getElementById('list-logs');
    if (!listLogs) return;
    
    const res = await fetchWithAuth('/api/logs');
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
