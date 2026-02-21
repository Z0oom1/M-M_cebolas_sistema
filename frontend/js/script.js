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

// API base: Web e Electron usam o mesmo servidor (portalmmcebolas.com) para dados partilhados.
// Só localhost no browser usa :3000 para desenvolvimento local.
const API_URL = (function() {
    const host = window.location.hostname;
    const isElectron = window.location.protocol === 'file:' ||
        (typeof process !== 'undefined' && process.versions && process.versions.electron);
    if (isElectron) return 'https://portalmmcebolas.com/api'; // Electron ligado ao mesmo servidor que o site
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3000/api';
    return 'https://portalmmcebolas.com/api';
})();

/** Redirecionamento para login: na Web com path na raiz usar /pages/login.html; Electron mesma pasta. */
function getLoginUrl() {
    if (window.location.protocol === 'file:') return 'login.html';
    if (window.location.pathname.includes('/pages/')) return 'login.html';
    return '/pages/login.html';
}

window.onload = function() {
    checkLogin();
    checkEnvironment();
    loadDataFromAPI();
    // showSection('dashboard'); // Removido para permitir animação de entrada suave
    setupSelectors();
    
    // Som de abertura ao entrar no sistema (Startup)
    setTimeout(() => {
        playSystemSound('startup');
    }, 1000);
};

function checkEnvironment() {
    const isElectron = window.location.protocol === 'file:' ||
        (typeof process !== 'undefined' && process.versions && process.versions.electron);
    const titlebar = document.getElementById('titlebar');
    const windowControls = document.querySelector('.window-controls');

    // Barra superior sempre visível: mostra o nome do sistema
    if (titlebar) titlebar.style.display = 'flex';

    if (isElectron) {
        // Electron: mostrar botões de controle (minimizar, maximizar, fechar)
        if (windowControls) windowControls.style.display = 'flex';
        try {
            const { ipcRenderer } = require('electron');
            document.getElementById('closeBtn')?.addEventListener('click', () => ipcRenderer.send('close-app'));
            document.getElementById('minBtn')?.addEventListener('click', () => ipcRenderer.send('minimize-app'));
            document.getElementById('maxBtn')?.addEventListener('click', () => ipcRenderer.send('maximize-app'));
        } catch (e) {
            console.warn("Electron IPC não disponível:", e);
        }
    } else {
        // Web: esconder apenas os botões de controle (mantém a barra com o nome do sistema)
        if (windowControls) windowControls.style.display = 'none';
        // Layout sidebar/mainContent já está no CSS (top/marginTop 38px) quando a titlebar está visível
    }
}

function setupSelectors() {
    // Mantido para compatibilidade
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
            fetchWithAuth('/fornecedores').then(r => r && r.ok ? r.json() : [])
        ];

        if (isAdmin) {
            promises.push(fetchWithAuth('/usuarios').then(r => r && r.ok ? r.json() : []));
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
/* adicionar */
function playLoginSound() {
    const audio = new Audio('../sounds/mac-startup.mp3');
    audio.volume = 0.5;
    audio.play().catch(err => console.log("Interação necessária para tocar áudio:", err));
}
function finalizarLoading() {
    const loadingScreen = document.getElementById('loading-screen');
    const mainContent = document.getElementById('main-layout');

    if (loadingScreen) {
        // Inicia o sumiço visual do loading
        loadingScreen.style.opacity = '0';
        loadingScreen.style.transition = 'opacity 0.5s ease';

        setTimeout(() => {
            loadingScreen.style.display = 'none';
            
            // ✅ ADICIONAR: O som toca APENAS AQUI, no milissegundo que o loading some
            const audio = new Audio('../sounds/mac-startup.mp3');
            audio.volume = 0.5;
            audio.play().catch(e => console.log("Áudio aguardando interação"));

            if (mainContent) {
                mainContent.style.display = 'block';
                mainContent.classList.add('fade-in-system'); // Sua animação de entrada
            }
        }, 500); // Tempo exato da transição de opacidade
    }
}


function initSection(id) {
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || (userData.user ? userData.user.role : null);
    const isAdmin = userRole === 'admin';

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
        
        // Lógica para alternar entre SVG personalizado e ícone FontAwesome
        let iconHTML = '';
        if (p.icone === 'onion') {
            iconHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
                    <path d="M12.74 2.458c0-1.333 1.658-1.981 2.553-.959l1.182 1.354L17.657 1.5c.895-1.023 2.553-.375 2.553.958v1.83c0 .738.44 1.405 1.136 1.712c4.464 1.892 7.604 6.325 7.604 11.488c0 6.076-4.349 11.146-10.11 12.25v.01c0 .69-.56 1.25-1.25 1.25h-2.16c-.69 0-1.25-.56-1.25-1.25v-.005C8.458 28.632 4 23.438 4 17.478c0-5.166 3.143-9.589 7.608-11.48a1.86 1.86 0 0 0 1.132-1.7v-1.84Zm2 1.449v.39a3.86 3.86 0 0 1-2.346 3.54l-.004.002c-.184.077-.364.16-.542.248c-1.96 2.085-3.118 5.341-3.118 8.84c0 5.31 2.645 9.753 6.153 10.805c-1.346-2.014-2.063-6.514-2.063-10.814c0-3.76.5-7.21 1.37-9.44l.75.29c-.82 2.11-1.31 5.53-1.31 9.15c0 3.03.33 5.88.94 8.02c.552 1.949 1.2 2.82 1.69 3.022c.147.003.295.003.441 0c.489-.203 1.137-1.074 1.689-3.022c.6-2.14.94-4.98.94-8.02c0-3.61-.49-7.03-1.31-9.15l.75-.29c.87 2.24 1.37 5.68 1.37 9.44c-.007 4.3-.72 8.801-2.064 10.814c3.508-1.05 6.154-5.494 6.154-10.804c0-3.495-1.155-6.746-3.109-8.832a10.358 10.358 0 0 0-.56-.257l-.012-.005a3.874 3.874 0 0 1-2.339-3.546v-.381l-.635.726a1.456 1.456 0 0 1-2.186.016l-.006-.007l-.643-.735ZM9.67 9.52A10.437 10.437 0 0 0 6 17.478c0 3.797 2.18 7.24 5.335 9.08c-.365-.372-.71-.786-1.035-1.24c-1.61-2.25-2.49-5.23-2.49-8.39c0-2.728.67-5.326 1.86-7.407Zm11.817 17.167a10.474 10.474 0 0 0 5.463-9.2c0-3.176-1.416-6.025-3.649-7.947c1.184 2.078 1.849 4.668 1.849 7.387c0 3.16-.88 6.14-2.49 8.39a10.42 10.42 0 0 1-1.173 1.37Z" />
                </svg>`;
        } else {
            iconHTML = `<i class="fas ${p.icone || 'fa-box'}"></i>`;
        }
    
        card.innerHTML = `
            <div class="product-icon-circle" style="background: ${p.cor}20; color: ${p.cor}">
                ${iconHTML}
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
function selectColor(el, color) {
    document.querySelectorAll('.color-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('prod-cor').value = color;
}
function selectIcon(el, icon) {
    document.querySelectorAll('.icon-option').forEach(opt => opt.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('prod-icone').value = icon;
}

function loadCadastros() {
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || (userData.user ? userData.user.role : null);
    const isAdmin = userRole === 'admin';
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

    const endpoint = type === 'cliente' ? '/clientes' : '/fornecedores';
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
    animateTrash(`deleteCadastro('${type}', ${id})`);
    const res = await fetchWithAuth(`/cadastros/${type}/${id}`, { method: 'DELETE' });
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
        
        // Atualiza a interface visual das opções
        document.querySelectorAll('.icon-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('onclick').includes(`'${data.icone}'`));
        });
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.classList.toggle('active', opt.getAttribute('onclick').includes(`'${data.cor}'`));
        });
    } else {
        document.getElementById('prod-id').value = '';
        document.querySelector('#modal-produto form').reset();
        
        // Define padrões para novo produto
        const firstIcon = document.querySelector('.icon-option');
        const firstColor = document.querySelector('.color-option');
        if (firstIcon) selectIcon(firstIcon, 'fa-circle');
        if (firstColor) selectColor(firstColor, '#1A5632');
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
        const res = await fetchWithAuth('/produtos', {
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

async function saveEntrada(event) { await saveMovimentacao('entrada', event); }
async function saveSaida(event) { await saveMovimentacao('saida', event); }

async function saveMovimentacao(type, event) {
    event.preventDefault();
    const prefix = type === 'entrada' ? 'entry' : 'exit';
    const data = {
        tipo: type,
        produto: document.getElementById(`${prefix}-product`).value,
        quantidade: parseInt(document.getElementById(`${prefix}-qty`).value),
        valor: parseFloat(document.getElementById(`${prefix}-value`).value),
        descricao: document.getElementById(`${prefix}-desc`).value,
        data: document.getElementById(`${prefix}-date`).value || new Date().toISOString()
    };

    const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
    if (res && res.ok) {
        showSuccess("Movimentação registrada!");
        await loadDataFromAPI();
        event.target.reset();
        if (type === 'saida' && confirm("Deseja emitir NF-e para esta venda?")) {
            const result = await res.json();
            gerarNFe(result.id, data.descricao, [{ produto: data.produto, qtd: data.quantidade, valor: data.valor }]);
        }
    } else {
        const err = await res.json();
        showError("Erro ao salvar: " + (err.error || "Erro desconhecido"));
    }
}

async function gerarNFe(vendaId, destinatario, itens) {
    showSuccess("Gerando NF-e...");
    const res = await fetchWithAuth('/nfe/gerar', {
        method: 'POST',
        body: JSON.stringify({ venda_id: vendaId, destinatario, itens })
    });
    if (res && res.ok) {
        showAnimatedCheck(); // Animação bonita de check verde com blur
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
const res = await fetchWithAuth('/movimentacoes', { method: 'POST', body: JSON.stringify(data) });
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
    animateTrash(`deleteMovimentacao(${id})`);
    const res = await fetchWithAuth(`/movimentacoes/${id}`, { method: 'DELETE' });
    if (res && res.ok) { 
        showSuccess("Registro excluído!"); 
        await loadDataFromAPI(); 
        if (currentSectionId === 'estoque') renderStockTable();
        if (currentSectionId === 'dashboard') renderRecentTransactions();
    }
}

let nfeSearchTimeout = null;
function debounceSearchNFe() {
    clearTimeout(nfeSearchTimeout);
    nfeSearchTimeout = setTimeout(() => {
        loadNFeTable();
    }, 500);
}

async function loadNFeTable() {
    const tbody = document.getElementById('nfe-table-body');
    if (!tbody) return;
    
    const searchInput = document.getElementById('nfe-search');
    const searchTerm = searchInput ? searchInput.value : '';
    
    const res = await fetchWithAuth(`/nfe${searchTerm ? '?search=' + encodeURIComponent(searchTerm) : ''}`);
    if (!res) return;
    const data = await res.json();
    tbody.innerHTML = '';
    
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || (userData.user ? userData.user.role : null);
    const isAdmin = userRole === 'admin';
    
    if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 6 : 5}" style="text-align:center;padding:30px;color:var(--text-muted);">Nenhuma nota fiscal encontrada</td></tr>`;
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
                ${isAdmin ? `<button class="btn-icon text-danger" onclick="deleteNFe(${n.id})" title="Remover NFe"><i class="fas fa-trash"></i></button>` : ''}
            </td>`;
        tbody.appendChild(tr);
    });
}

async function deleteNFe(id) {
    if (!confirm("Deseja realmente remover esta NFe? Ela não aparecerá mais para os usuários.")) return;
    animateTrash(`deleteNFe(${id})`);
    const res = await fetchWithAuth(`/nfe/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess("NFe removida com sucesso!");
        loadNFeTable();
    } else {
        showError("Erro ao remover NFe.");
    }
}

async function updateNFeModo(modo) {
    const res = await fetchWithAuth('/configs', {
        method: 'POST',
        body: JSON.stringify({ chave: 'nfe_modo', valor: modo })
    });
    if (res && res.ok) {
        showSuccess(`Modo alterado para ${modo.toUpperCase()}`);
    } else {
        showError("Erro ao alterar modo.");
    }
}

async function saveCertPassword() {
    const pass = document.getElementById('cert-password').value;
    const res = await fetchWithAuth('/configs', {
        method: 'POST',
        body: JSON.stringify({ chave: 'cert_password', valor: pass })
    });
    if (res && res.ok) {
        showSuccess("Senha do certificado salva!");
    } else {
        showError("Erro ao salvar senha.");
    }
}

async function downloadXML(id) {
    const token = localStorage.getItem('token');
    try {
        const res = await fetch(`${API_URL}/nfe/${id}/xml`, {
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
        const res = await fetch(`${API_URL}/nfe/${id}/pdf`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error("Erro ao baixar PDF");
        
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; // Garante que o elemento não aparece
        a.href = url;
        a.download = `DANFE_${id}.pdf`;
        document.body.appendChild(a); // Necessário para Firefox
        a.click();
        window.URL.revokeObjectURL(url); // Limpa a memória
        a.remove();
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
    const userData = JSON.parse(localStorage.getItem('mm_user') || '{}');
    const userRole = userData.role || (userData.user ? userData.user.role : null);
    const isAdmin = userRole === 'admin';

    const res = await fetchWithAuth('/configs');
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

    // Esconder seção de modo NFe se não for admin
    const nfeModoPanel = document.querySelector('.panel:has(input[name="nfe_modo"])');
    if (nfeModoPanel && !isAdmin) {
        nfeModoPanel.style.display = 'none';
    }
    
    if (isAdmin) {
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
    const mmUser = localStorage.getItem('mm_user');
    if (!token || !mmUser) { window.location.href = getLoginUrl(); return; }
    
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
    const userDataRaw = localStorage.getItem('mm_user');

    if (!token || !userDataRaw) {
        console.warn("Sessão não encontrada, redirecionando...");
        window.location.href = getLoginUrl();
        return;
    }

    try {
        const userData = JSON.parse(userDataRaw);
        // Verifica se o objeto foi lido corretamente antes de prosseguir
        if (!userData || typeof userData !== 'object') {
            throw new Error("Dados de sessão corrompidos");
        }
    } catch (e) {
        console.error("Erro na validação:", e);
        logout();
    }
}

function logout() {
    localStorage.clear();
    window.location.href = getLoginUrl();
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

    const res = await fetchWithAuth('/usuarios', { method: 'POST', body: JSON.stringify(data) });
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
    const res = await fetchWithAuth(`/usuarios/${id}`, { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess("Usuário excluído!");
        await loadDataFromAPI();
        loadConfigData();
    }
}

async function loadLogs() {
    const listLogs = document.getElementById('list-logs');
    if (!listLogs) return;
    
    const res = await fetchWithAuth('/logs');
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

function updateDocMask() {
    const type = document.getElementById('edit-doc-type').value;
    const input = document.getElementById('edit-doc');
    const label = document.getElementById('label-doc');
    if (type === 'CNPJ') {
        label.innerText = 'CNPJ';
        input.placeholder = '00.000.000/0000-00';
    } else {
        label.innerText = 'CPF';
        input.placeholder = '000.000.000-00';
    }
}

async function consultarDocumento() {
    const doc = document.getElementById('edit-doc').value.replace(/\D/g, '');
    const type = document.getElementById('edit-doc-type').value;
    
    if (!doc) {
        showError("Digite um documento para consultar.");
        return;
    }

    showSuccess("Consultando documento...");
    
    try {
        const res = await fetchWithAuth(`/consultar/${type}/${doc}`);
        if (res && res.ok) {
            const data = await res.json();
            if (type === 'CNPJ') {
                document.getElementById('edit-nome').value = data.razao_social || data.nome || '';
                document.getElementById('edit-end').value = `${data.logradouro}, ${data.numero}, ${data.bairro}, ${data.municipio} - ${data.uf}`;
                document.getElementById('edit-email').value = data.email || '';
                document.getElementById('edit-tel').value = data.telefone || '';
            } else {
                document.getElementById('edit-nome').value = data.nome || '';
            }
            showSuccess("Dados preenchidos!");
        } else {
            const err = await res.json();
            showError("Erro na consulta: " + (err.error || "Documento não encontrado"));
        }
    } catch (err) {
        showError("Erro ao conectar com o serviço de consulta.");
    }
}

async function saveCertPassword() {
    const password = document.getElementById('cert-password').value;
    const res = await fetchWithAuth('/configs', {
        method: 'POST',
        body: JSON.stringify({ chave: 'cert_password', valor: password })
    });
    if (res && res.ok) showSuccess("Senha do certificado salva!");
}

async function updateNFeModo(modo) {
    const res = await fetchWithAuth('/configs', {
        method: 'POST',
        body: JSON.stringify({ chave: 'nfe_modo', valor: modo })
    });
    if (res && res.ok) {
        showSuccess(`Ambiente alterado para ${modo.toUpperCase()}!`);
    } else {
        showError("Erro ao alterar ambiente.");
    }
}

async function resetSystem() {
    if (!confirm("TEM CERTEZA? Esta ação é irreversível e apagará todos os dados de movimentações, clientes e fornecedores.")) return;
    const res = await fetchWithAuth('/reset', { method: 'DELETE' });
    if (res && res.ok) {
        showSuccess("Sistema resetado com sucesso!");
        window.location.reload();
    }
}
/** --- FUNÇÕES DE ANIMAÇÃO E SOM (SOLICITADAS) --- */

function playSystemSound(id) {
    const sound = document.getElementById(`sound-${id}`);
    if (sound) {
        sound.currentTime = 0;
        sound.play().catch(err => console.warn("Som bloqueado:", err));
    }
}

function showAnimatedCheck() {
    const overlay = document.getElementById('confirmation-overlay');
    if (!overlay) return;
    
    overlay.classList.add('active');
    playSystemSound('success');
    
    setTimeout(() => {
        overlay.classList.remove('active');
    }, 2500);
}

function animateTrash(elementId) {
    const trash = document.getElementById('trash-container');
    const sourceEl = document.querySelector(`[onclick*="${elementId}"]`) || document.getElementById(elementId);
    
    if (!trash) return;

    // 1. Mostrar lixeira
    trash.classList.add('active');
    
    // 2. Criar "arquivo" voador se tivermos o elemento de origem
    if (sourceEl) {
        const rect = sourceEl.getBoundingClientRect();
        const trashRect = trash.getBoundingClientRect();
        
        const file = document.createElement('div');
        file.className = 'flying-file';
        file.innerHTML = '<i class="fas fa-file-alt"></i>';
        file.style.left = `${rect.left}px`;
        file.style.top = `${rect.top}px`;
        document.body.appendChild(file);
        
        // Animar para a lixeira
        setTimeout(() => {
            file.style.transition = 'all 0.8s cubic-bezier(0.55, 0, 0.1, 1)';
            file.style.left = `${trashRect.left + 20}px`;
            file.style.top = `${trashRect.top + 10}px`;
            file.style.transform = 'scale(0.1) rotate(360deg)';
            file.style.opacity = '0';
        }, 50);
        
        setTimeout(() => file.remove(), 900);
    }
    
    // 3. Efeito de impacto na lixeira e som
    setTimeout(() => {
        trash.classList.add('shake');
        playSystemSound('trash');
        setTimeout(() => trash.classList.remove('shake'), 400);
    }, 800);
    
    // 4. Esconder lixeira
    setTimeout(() => {
        trash.classList.remove('active');
    }, 2500);
}

// Interceptar funções existentes para adicionar animações
const originalShowSuccess = showSuccess;
showSuccess = function(msg) {
    originalShowSuccess(msg);
    if (msg.toLowerCase().includes('sucesso') || msg.toLowerCase().includes('salvo') || msg.toLowerCase().includes('gerada')) {
        // Se for NFe ou algo importante, mostra o check grande
        if (msg.toLowerCase().includes('nf-e') || msg.toLowerCase().includes('venda')) {
            showAnimatedCheck();
        }
    }
    if (msg.toLowerCase().includes('excluído') || msg.toLowerCase().includes('removido')) {
        // A animação de lixeira é chamada manualmente nos deletes para pegar o ID do elemento
    }
};
