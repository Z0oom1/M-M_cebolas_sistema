// --- CONFIGURAÇÃO DE REDE ---
const isElectron = window.location.protocol === 'file:';
const API_URL = isElectron ? 'http://localhost:3000' : '';

let appData = {
    transactions: [],
    fixedTax: 0,
    config: { minStock: 100 }
};

let currentUser = null;
let contextTargetId = null; 
let contextMenu = null;     
let currentSelectionTarget = null; // Variável para controlar quem chamou a busca (Lupa)

// --- INICIALIZAÇÃO ---
window.onload = function() {
    checkLogin();
    loadDataFromAPI(); 
    
    contextMenu = document.getElementById('context-menu');
    
    // Fechar menus ao clicar fora
    document.addEventListener('click', (e) => {
        if (contextMenu) contextMenu.style.display = 'none';
        if (e.target.classList.contains('modal-overlay')) {
            closeEditModal();
            closeStockDetails();
            closeSelectionModal();
        }
    });

    initDateInputs();
    initUserInfo();
};

// --- AUTENTICAÇÃO E LOGIN ---
// --- AUTENTICAÇÃO E LOGIN (CORRIGIDA) ---
function checkLogin() {
    const session = sessionStorage.getItem('mm_user');
    
    // Verifica se já estamos na página de login para evitar o Loop Infinito
    const isLoginPage = window.location.pathname.includes('login.html');

    // CASO 1: Estou na tela de Login e já estou logado -> Vai pra Home
    if (isLoginPage && session) {
        window.location.replace('home.html');
        return;
    }

    // CASO 2: Estou na tela de Login e NÃO estou logado -> Fica quieto (Não faz nada)
    if (isLoginPage && !session) {
        return;
    }

    // CASO 3: Estou na Home (ou outra) e NÃO estou logado -> Chuta pro Login
    if (!isLoginPage && !session) {
        window.location.replace('login.html'); 
        return;
    }
    
    // Se passou por tudo, carrega o usuário
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

// --- CARREGAMENTO DE DADOS ---
async function loadDataFromAPI() {
    try {
        const response = await fetch(`${API_URL}/api/movimentacoes`);
        const data = await response.json();

        if(Array.isArray(data)) {
            // Traduz dados do banco para o app
            appData.transactions = data.map(item => {
                return {
                    id: item.id,
                    desc: item.descricao || "Sem Descrição",
                    productType: item.produto, 
                    qty: Number(item.quantidade || 0),
                    value: Number(item.valor || 0),
                    date: item.data,
                    type: item.tipo
                };
            });

            updateDashboard(); 
            
            const loading = document.getElementById('loading-screen');
            if(loading) {
                loading.style.opacity = '0';
                setTimeout(() => loading.style.display = 'none', 500);
            }
        }
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
    }
}

// --- NAVEGAÇÃO ---
// Guardamos a função original para estender ela
const originalShowSection = function(id, btn) {
    document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(id);
    if(target) target.classList.add('active');
    
    if(btn) {
        document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }
    if(window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('active');
};

// Sobrescrevemos para carregar cadastros se a aba for 'cadastro'
window.showSection = function(id, btn) {
    originalShowSection(id, btn);
    if(id === 'cadastro') {
        loadCadastros();
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

function initDateInputs() {
    const today = new Date().toISOString().split('T')[0];
    document.querySelectorAll('input[type="date"]').forEach(el => el.value = today);
}

// --- GESTÃO DE CADASTROS (CLIENTES E FORNECEDORES) ---

async function loadCadastros() {
    try {
        const [cliRes, fornRes] = await Promise.all([
            fetch(`${API_URL}/api/clientes`),
            fetch(`${API_URL}/api/fornecedores`)
        ]);
        
        const clientes = await cliRes.json();
        const fornecedores = await fornRes.json();

        renderCadastroList('list-clientes', clientes, 'cliente');
        renderCadastroList('list-fornecedores', fornecedores, 'fornecedor');
    } catch (e) { 
        console.error(e);
        alert("Erro ao carregar listas de cadastro.");
    }
}

function renderCadastroList(elementId, list, type) {
    const el = document.getElementById(elementId);
    if(!el) return;
    el.innerHTML = '';
    
    if(list.length === 0) {
        el.innerHTML = '<div style="padding:15px; color:#999; text-align:center;">Nenhum registro encontrado.</div>';
        return;
    }

    list.forEach(item => {
        el.innerHTML += `
            <div class="list-item" style="display:flex; justify-content:space-between; padding:10px; border-bottom:1px solid #eee; align-items:center;">
                <span style="font-weight:500;">${item.nome}</span>
                <div class="list-actions" style="display:flex; gap:10px;">
                    <button onclick="editCadastro(${item.id}, '${type}')" style="background:none; border:none; cursor:pointer; color:#E89C31;" title="Editar"><i class="fas fa-pen"></i></button>
                    <button onclick="deleteCadastro(${item.id}, '${type}')" style="background:none; border:none; cursor:pointer; color:#EF4444;" title="Excluir"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
}

// Adicionar (Chamado pelo botão +)
async function addCadastro(type) {
    // Impede o form de dar refresh se estiver dentro de um form
    if(event) event.preventDefault();

    const inputId = type === 'cliente' ? 'new-cliente' : 'new-fornecedor';
    const endpoint = type === 'cliente' ? 'clientes' : 'fornecedores';
    const input = document.getElementById(inputId);
    const nome = input.value;

    if(!nome) {
        alert("Por favor, digite um nome.");
        return;
    }

    try {
        await fetch(`${API_URL}/api/${endpoint}`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome })
        });
        
        input.value = ''; // Limpa o campo
        loadCadastros();  // Recarrega a lista
        alert("Cadastrado com sucesso!");
    } catch(e) {
        alert("Erro ao cadastrar.");
    }
}

// Excluir
async function deleteCadastro(id, type) {
    if(!confirm('Tem certeza que deseja excluir?')) return;
    
    const endpoint = type === 'cliente' ? 'clientes' : 'fornecedores';
    try {
        await fetch(`${API_URL}/api/${endpoint}/${id}`, { method: 'DELETE' });
        loadCadastros();
    } catch(e) {
        alert("Erro ao excluir.");
    }
}

// Editar
async function editCadastro(id, type) {
    const newName = prompt("Digite o novo nome:");
    if(!newName) return;

    const endpoint = type === 'cliente' ? 'clientes' : 'fornecedores';
    try {
        // Assume que o backend tem rota PUT /api/clientes/:id
        await fetch(`${API_URL}/api/${endpoint}/${id}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ nome: newName })
        });
        loadCadastros();
    } catch(e) {
        alert("Erro ao editar (verifique se o servidor suporta edição).");
    }
}

// --- MODAL DE SELEÇÃO (LUPA) ---

async function openSelectionModal(type) {
    currentSelectionTarget = type; // Guarda quem chamou (entry-source ou exit-client)
    const modal = document.getElementById('modal-selection');
    const title = document.getElementById('selection-title');
    const listContainer = document.getElementById('selection-list');
    
    if(!modal) return;

    modal.classList.add('active');
    listContainer.innerHTML = '<div style="padding:20px; text-align:center;">Carregando...</div>';
    
    const endpoint = type === 'cliente' ? 'clientes' : 'fornecedores';
    if(title) title.innerText = type === 'cliente' ? 'Selecionar Cliente' : 'Selecionar Fornecedor';
    
    try {
        const res = await fetch(`${API_URL}/api/${endpoint}`);
        const list = await res.json();
        
        listContainer.innerHTML = '';
        if(list.length === 0) {
            listContainer.innerHTML = '<div style="padding:15px; color:#999; text-align:center;">Nenhum cadastro encontrado.</div>';
        }
        
        list.forEach(item => {
            const div = document.createElement('div');
            div.className = 'selection-item';
            div.style.padding = "10px";
            div.style.borderBottom = "1px solid #eee";
            div.style.cursor = "pointer";
            div.innerText = item.nome;
            // Ao clicar no item, preenche o input e fecha modal
            div.onclick = () => selectEntity(item.nome);
            div.onmouseover = () => { div.style.background = "#f5f5f5"; };
            div.onmouseout = () => { div.style.background = "transparent"; };
            listContainer.appendChild(div);
        });
    } catch(e) {
        listContainer.innerHTML = 'Erro ao carregar lista.';
    }
}

function selectEntity(name) {
    // Define qual input vai receber o valor
    const inputId = currentSelectionTarget === 'cliente' ? 'exit-client' : 'entry-source';
    const input = document.getElementById(inputId);
    if(input) input.value = name;
    closeSelectionModal();
}

function closeSelectionModal() {
    const modal = document.getElementById('modal-selection');
    if(modal) modal.classList.remove('active');
    const search = document.getElementById('search-selection');
    if(search) search.value = '';
}

function filterSelectionList() {
    const term = document.getElementById('search-selection').value.toLowerCase();
    const items = document.querySelectorAll('#selection-list div'); // Pega as divs criadas dinamicamente
    items.forEach(item => {
        const text = item.innerText.toLowerCase();
        item.style.display = text.includes(term) ? 'block' : 'none';
    });
}

// --- FUNÇÃO PARA CLICAR NO CARD DE DISPONIBILIDADE ---
function selectProductFromCard(type) {
    const select = document.getElementById('exit-type');
    if(select) {
        select.value = type;
        // Feedback visual rápido
        select.style.borderColor = '#E89C31';
        setTimeout(() => {
            select.style.borderColor = '';
        }, 500);
    }
}

// --- AÇÕES DO USUÁRIO (ENTRADA, SAÍDA, DESPESA) ---

async function handleEntry(e) {
    e.preventDefault();
    
    const qty = parseInt(document.getElementById('entry-qty').value) || 0;
    let rawValue = parseFloat(document.getElementById('entry-cost').value) || 0;
    
    const calcModeEl = document.querySelector('input[name="entry-calc-mode"]:checked');
    const calcMode = calcModeEl ? calcModeEl.value : 'total';
    let finalValue = (calcMode === 'unit') ? (rawValue * qty) : rawValue;

    const entryData = {
        desc: document.getElementById('entry-source').value,
        productType: document.getElementById('entry-type').value,
        qty: qty,
        value: finalValue,
        date: document.getElementById('entry-date').value
    };

    await sendTransactionToAPI('/api/entrada', entryData);
    e.target.reset();
    
    const radioTotal = document.querySelector('input[name="entry-calc-mode"][value="total"]');
    if(radioTotal) radioTotal.checked = true;
}

async function handleExit(e) {
    e.preventDefault();
    const qty = parseInt(document.getElementById('exit-qty').value);
    const type = document.getElementById('exit-type').value;

    const grouped = getGroupedStock();
    const currentStock = grouped[type] ? grouped[type].netQty : 0;

    if(qty > currentStock) { 
        alert(`Erro: Estoque insuficiente de Cebola ${type}.\nDisponível: ${currentStock} cx.`); 
        return; 
    }
    
    const exitData = {
        desc: document.getElementById('exit-client').value,
        productType: type,
        qty: qty,
        value: parseFloat(document.getElementById('exit-value').value),
        date: document.getElementById('exit-date').value
    };

    await sendTransactionToAPI('/api/saida', exitData);
    e.target.reset();
}

async function handleExpense(e) {
    e.preventDefault();
    const expData = {
        desc: document.getElementById('exp-desc').value,
        value: parseFloat(document.getElementById('exp-val').value),
        date: new Date().toISOString().split('T')[0]
    };
    await sendTransactionToAPI('/api/despesa', expData);
    document.getElementById('exp-desc').value = '';
    document.getElementById('exp-val').value = '';
}

async function sendTransactionToAPI(endpoint, data) {
    try {
        const response = await fetch(API_URL + endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            alert('Salvo com sucesso!');
            loadDataFromAPI(); // Recarrega a tela
        } else {
            alert('Erro ao salvar no servidor.');
        }
    } catch (error) {
        alert('Erro de conexão com o servidor.');
    }
}

// --- EDIÇÃO E EXCLUSÃO (MOVIMENTAÇÕES) ---

async function deleteItem() {
    if(!contextTargetId) return;
    if(confirm('Tem certeza? Isso apagará o registro permanentemente.')) {
        try {
            await fetch(`${API_URL}/api/movimentacoes/${contextTargetId}`, { method: 'DELETE' });
            if(contextMenu) contextMenu.style.display = 'none';
            closeStockDetails();
            loadDataFromAPI(); 
        } catch (error) {
            alert('Erro ao excluir.');
        }
    }
}

async function saveEdit(e) {
    e.preventDefault();
    const id = Number(document.getElementById('edit-id').value);
    const qty = parseInt(document.getElementById('edit-qty').value);
    let rawVal = parseFloat(document.getElementById('edit-val').value);
    
    const modeEl = document.querySelector('input[name="edit-calc-mode"]:checked');
    const mode = modeEl ? modeEl.value : 'total';
    const finalVal = (mode === 'unit') ? (rawVal * qty) : rawVal;

    const editData = {
        desc: document.getElementById('edit-desc').value,
        productType: document.getElementById('edit-type').value,
        qty: qty,
        value: finalVal
    };

    try {
        await fetch(`${API_URL}/api/movimentacoes/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(editData)
        });
        closeEditModal();
        closeStockDetails();
        loadDataFromAPI();
        alert('Atualizado!');
    } catch (error) {
        alert('Erro ao editar.');
    }
}

// --- MODAIS E MENUS DE CONTEXTO ---

function showContextMenu(e, id) {
    e.preventDefault();
    contextTargetId = id;
    if(contextMenu) {
        contextMenu.style.display = 'block';
        let x = e.clientX, y = e.clientY;
        if(window.innerWidth - x < 180) x -= 160; 
        contextMenu.style.top = `${y}px`;
        contextMenu.style.left = `${x}px`;
    }
}

function openEditModal() {
    if(!contextTargetId) return;
    if(contextMenu) contextMenu.style.display = 'none';

    const item = appData.transactions.find(t => t.id === Number(contextTargetId));
    if(!item) { alert("Item não encontrado."); return; }

    const modal = document.getElementById('modal-edit');
    if(modal) {
        document.getElementById('edit-id').value = item.id;
        document.getElementById('edit-desc').value = item.desc;
        document.getElementById('edit-type').value = item.productType;
        document.getElementById('edit-qty').value = item.qty;
        document.getElementById('edit-val').value = item.value;
        const radio = document.querySelector('input[name="edit-calc-mode"][value="total"]');
        if(radio) radio.checked = true;
        modal.classList.add('active');
    }
}

function closeEditModal() {
    const modal = document.getElementById('modal-edit');
    if(modal) modal.classList.remove('active');
}

function openStockDetails(type, data, avgCost, totalValue) {
    const modal = document.getElementById('modal-stock-details');
    if(!modal) return;

    document.getElementById('detail-title').innerText = `Estoque: Cebola ${type}`;
    document.getElementById('detail-summary').innerHTML = `
        <div class="detail-box"><label>Quantidade Atual</label><strong>${data.netQty} Caixas</strong></div>
        <div class="detail-box"><label>Valor Total</label><strong style="color:var(--success)">R$ ${totalValue.toFixed(2)}</strong></div>
    `;

    const tbody = document.getElementById('detail-table-body');
    tbody.innerHTML = '';
    const sortedEntries = [...data.entries].sort((a,b) => b.id - a.id);

    if(sortedEntries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Nenhuma entrada registrada.</td></tr>';
    } else {
        sortedEntries.forEach(t => {
            let unitPrice = t.qty > 0 ? (t.value / t.qty) : 0;
            const tr = document.createElement('tr');
            tr.oncontextmenu = (e) => showContextMenu(e, t.id);
            tr.innerHTML = `<td>${formatDate(t.date)}</td><td>${t.desc}</td><td>${t.qty}</td><td>R$ ${unitPrice.toFixed(2)}</td><td>R$ ${t.value.toFixed(2)}</td>`;
            tbody.appendChild(tr);
        });
    }
    modal.classList.add('active');
}

function closeStockDetails() {
    const modal = document.getElementById('modal-stock-details');
    if(modal) modal.classList.remove('active');
}

// --- CÁLCULOS E DASHBOARD ---

function getGroupedStock() {
    let grouped = {
        'Amarela': { netQty: 0, totalBuyValue: 0, totalBuyQty: 0, entries: [] },
        'Roxa':    { netQty: 0, totalBuyValue: 0, totalBuyQty: 0, entries: [] },
        'Branca':  { netQty: 0, totalBuyValue: 0, totalBuyQty: 0, entries: [] }
    };

    if (!appData.transactions) return grouped;

    appData.transactions.forEach(t => {
        if (!grouped[t.productType]) return;

        let qty = Number(t.qty || 0);
        let val = Number(t.value || 0);
        let isBuy = (t.type === 'buy' || t.type === 'entrada');
        let isSell = (t.type === 'sell' || t.type === 'saida');

        if(isBuy) {
            grouped[t.productType].netQty += qty;
            grouped[t.productType].totalBuyQty += qty;
            grouped[t.productType].totalBuyValue += val;
            grouped[t.productType].entries.push(t);
        } else if (isSell) {
            grouped[t.productType].netQty -= qty;
        }
    });
    return grouped;
}

function updateDashboard() {
    try {
        const grouped = getGroupedStock();
        
        let totalQty = grouped.Amarela.netQty + grouped.Roxa.netQty + grouped.Branca.netQty;
        let rev = 0, exp = 0;

        appData.transactions.forEach(t => {
            let val = Number(t.value || 0);
            if(t.type === 'sell' || t.type === 'saida') rev += val;
            if(t.type === 'buy' || t.type === 'entrada' || t.type === 'despesa' || t.type === 'expense') exp += val;
        });
        exp += (appData.fixedTax || 0);

        safeText('dash-stock', totalQty + " Cx");
        safeText('dash-revenue', "R$ " + rev.toFixed(2));
        safeText('dash-expenses', "R$ " + exp.toFixed(2));
        safeText('dash-profit', "R$ " + (rev - exp).toFixed(2));

        const breakdown = document.getElementById('stock-breakdown');
        if(breakdown) {
            breakdown.innerHTML = `
                <div class="stock-pill ama"><i class="fas fa-circle" style="font-size:0.5rem"></i> A: ${grouped.Amarela.netQty}</div>
                <div class="stock-pill rox"><i class="fas fa-circle" style="font-size:0.5rem"></i> R: ${grouped.Roxa.netQty}</div>
                <div class="stock-pill bra"><i class="fas fa-circle" style="font-size:0.5rem"></i> B: ${grouped.Branca.netQty}</div>
            `;
        }

        updateTables();
        renderGroupedStockCards(grouped);
        // Chama a função atualizada que adiciona o clique
        updateSaidaStockDisplay(grouped); 
        updateCharts(rev, exp, grouped);
    } catch (e) { console.error("Erro dashboard", e); }
}

function updateTables() {
    const recentBody = document.getElementById('recent-table-body');
    const finBody = document.getElementById('financial-table-body');
    
    if(recentBody) recentBody.innerHTML = '';
    if(finBody) finBody.innerHTML = '';

    const sorted = [...appData.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));

    sorted.forEach(t => {
        let isBuy = (t.type === 'buy' || t.type === 'entrada');
        let isSell = (t.type === 'sell' || t.type === 'saida');
        let label = isBuy ? 'Compra' : (isSell ? 'Venda' : 'Despesa');
        
        if(recentBody) {
            recentBody.innerHTML += `
                <tr>
                    <td>${label}</td><td>${t.productType}</td><td>${t.desc}</td><td>${t.qty || '-'}</td><td>R$ ${t.value.toFixed(2)}</td><td>${formatDate(t.date)}</td>
                </tr>`;
        }
        if(finBody) {
            const tr = document.createElement('tr');
            tr.oncontextmenu = (e) => showContextMenu(e, t.id);
            tr.innerHTML = `<td>${formatDate(t.date)}</td><td>${t.desc}</td><td>${label}</td><td style="color:var(--success)">${isSell ? 'R$ '+t.value.toFixed(2) : '-'}</td><td style="color:var(--danger)">${!isSell ? 'R$ '+t.value.toFixed(2) : '-'}</td>`;
            finBody.appendChild(tr);
        }
    });
}

function renderGroupedStockCards(grouped) {
    const grid = document.getElementById('stock-grid');
    if (!grid) return;
    grid.innerHTML = '';
    ['Amarela', 'Roxa', 'Branca'].forEach(type => {
        const data = grouped[type];
        let color = type==='Amarela'?'#F57F17':(type==='Roxa'?'#7B1FA2':'#666');
        let badge = type==='Amarela'?'badge-ama':(type==='Roxa'?'badge-rox':'badge-bra');
        let avg = data.totalBuyQty > 0 ? (data.totalBuyValue/data.totalBuyQty) : 0;
        let tot = data.netQty * avg;

        const card = document.createElement('div');
        card.className = 'panel'; card.style.cursor='pointer';
        card.onclick = () => openStockDetails(type, data, avg, tot);
        card.innerHTML = `
            <div style="padding:15px; border-bottom:1px solid var(--border); display:flex; justify-content:space-between;"><span class="badge ${badge}">${type}</span><i class="fas fa-list-ul" style="color:#ccc"></i></div>
            <div style="padding:25px; text-align:center;"><h3 style="color:${color}; font-size:2.5rem; margin:0;">${data.netQty}</h3><small style="color:#888;">Caixas</small></div>
            <div style="background:#f9fafb; padding:12px; border-top:1px solid #eee; display:flex; justify-content:space-between; font-size:0.85rem;"><span>Med: R$ ${avg.toFixed(2)}</span><span style="color:var(--primary)">Tot: R$ ${tot.toFixed(2)}</span></div>
        `;
        grid.appendChild(card);
    });
}

// --- ATUALIZA O DISPLAY DA SAÍDA E ADICIONA CLIQUE ---
function updateSaidaStockDisplay(grouped) {
    const box = document.getElementById('saida-stock-display');
    if(box) {
        box.innerHTML = '';
        ['Amarela', 'Roxa', 'Branca'].forEach(type => {
            let color = type==='Amarela'?'#F57F17':(type==='Roxa'?'#7B1FA2':'#333');
            let div = document.createElement('div');
            div.className = 'mini-stock-card';
            div.style.cursor = 'pointer'; // Mostra que é clicável
            div.title = "Clique para selecionar este produto";
            
            // ADICIONA O EVENTO DE CLIQUE PARA SELECIONAR
            div.onclick = () => selectProductFromCard(type);

            if(grouped[type].netQty <= 0) div.classList.add('alert');
            div.innerHTML = `<span>${type}</span><h4 style="color:${color}">${grouped[type].netQty} Cx</h4>`;
            box.appendChild(div);
        });
    }
}

let cFin = null, cStk = null;
function updateCharts(rev, exp, grouped) {
    const ctxF = document.getElementById('financeChart');
    const ctxS = document.getElementById('stockChart');
    if(!ctxF || !ctxS) return;
    if(cFin) cFin.destroy(); if(cStk) cStk.destroy();

    cFin = new Chart(ctxF, { type: 'bar', data: { labels: ['Entrada', 'Saída', 'Lucro'], datasets: [{ data: [rev, exp, rev-exp], backgroundColor: ['#10B981', '#EF4444', '#E89C31'] }] }, options: { plugins: {legend:{display:false}}, responsive:true, maintainAspectRatio:false } });
    cStk = new Chart(ctxS, { type: 'doughnut', data: { labels: ['Amarela', 'Roxa', 'Branca'], datasets: [{ data: [grouped.Amarela.netQty, grouped.Roxa.netQty, grouped.Branca.netQty], backgroundColor: ['#F57F17', '#7B1FA2', '#BDBDBD'] }] }, options: { cutout:'70%', responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} } });
}

function updateTax(e) { e.preventDefault(); appData.fixedTax = parseFloat(document.getElementById('tax-value').value); updateDashboard(); alert('Taxa Atualizada'); }
function clearAllData() { if(confirm('Resetar sistema?')) fetch(`${API_URL}/api/reset`, {method:'DELETE'}).then(()=>{alert('Resetado'); loadDataFromAPI();}); }
function safeText(id, txt) { const el = document.getElementById(id); if(el) el.innerText = txt; }
function formatDate(d) { return d ? d.split('-').reverse().join('/') : '-'; }