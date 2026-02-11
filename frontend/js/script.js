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

function animateKPIs() {
    const kpis = document.querySelectorAll('.kpi-card h3');
    kpis.forEach(kpi => {
        const finalValue = kpi.innerText;
        if (finalValue.includes('R$')) {
            // Animação simples para valores monetários
            kpi.style.opacity = '0';
            kpi.style.transform = 'translateY(10px)';
            setTimeout(() => {
                kpi.style.transition = 'all 0.5s ease';
                kpi.style.opacity = '1';
                kpi.style.transform = 'translateY(0)';
            }, 100);
        }
    });
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
                setTimeout(() => {
                    loading.style.display = 'none';
                    animateKPIs();
                }, 500);
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
    } else if(id === 'nfe') {
        loadNFe();
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
        const [cliRes, fornRes, prodRes] = await Promise.all([
            fetch(`${API_URL}/api/clientes`),
            fetch(`${API_URL}/api/fornecedores`),
            fetch(`${API_URL}/api/produtos`)
        ]);
        
        const clientes = await cliRes.json();
        const fornecedores = await fornRes.json();
        const produtos = await prodRes.json();

        renderCadastroList('list-clientes', clientes, 'cliente');
        renderCadastroList('list-fornecedores', fornecedores, 'fornecedor');
        renderProdutoList(produtos);
    } catch (e) { 
        console.error(e);
        alert("Erro ao carregar listas de cadastro.");
    }
}

function renderProdutoList(list) {
    const el = document.getElementById('list-produtos');
    if(!el) return;
    el.innerHTML = '';
    
    if(list.length === 0) {
        el.innerHTML = '<div style="padding:15px; color:#999; text-align:center;">Nenhum produto cadastrado.</div>';
        return;
    }

    list.forEach(item => {
        el.innerHTML += `
            <div class="list-item" style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr; padding:10px; border-bottom:1px solid #eee; align-items:center;">
                <span style="font-weight:500;">${item.nome}</span>
                <span style="color:#666; font-size:0.85rem;">${item.ncm || '-'}</span>
                <span style="font-weight:600; color:var(--success);">R$ ${Number(item.preco_venda).toFixed(2)}</span>
                <div class="list-actions" style="display:flex; gap:10px; justify-content:flex-end;">
                    <button onclick="openProdutoModal(${item.id})" style="background:none; border:none; cursor:pointer; color:#E89C31;" title="Editar"><i class="fas fa-pen"></i></button>
                    <button onclick="deleteProduto(${item.id})" style="background:none; border:none; cursor:pointer; color:#EF4444;" title="Excluir"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
}

// --- GESTÃO DE PRODUTOS ---

function openProdutoModal(id = null) {
    const modal = document.getElementById('modal-produto');
    const title = document.getElementById('produto-modal-title');
    const form = modal.querySelector('form');
    
    document.getElementById('prod-id').value = id || '';
    title.innerText = id ? 'Editar Produto' : 'Novo Produto';
    
    if (id) {
        fetch(`${API_URL}/api/produtos`)
            .then(res => res.json())
            .then(list => {
                const item = list.find(i => i.id == id);
                if (item) {
                    document.getElementById('prod-nome').value = item.nome || '';
                    document.getElementById('prod-ncm').value = item.ncm || '';
                    document.getElementById('prod-preco').value = item.preco_venda || '';
                    document.getElementById('prod-min').value = item.estoque_minimo || '100';
                }
            });
    } else {
        form.reset();
        document.getElementById('prod-min').value = '100';
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

    try {
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
            alert("Produto salvo com sucesso!");
        } else {
            alert("Erro ao salvar produto.");
        }
    } catch(e) {
        alert("Erro na conexão.");
    }
}

async function deleteProduto(id) {
    if(!confirm('Tem certeza que deseja excluir este produto?')) return;
    try {
        await fetch(`${API_URL}/api/produtos/${id}`, { method: 'DELETE' });
        loadCadastros();
    } catch(e) {
        alert("Erro ao excluir.");
    }
}

// --- GESTÃO DE NF-e ---

async function loadNFe() {
    try {
        const res = await fetch(`${API_URL}/api/nfe`);
        const list = await res.json();
        renderNFeList(list);
    } catch (e) {
        console.error(e);
    }
}

function renderNFeList(list) {
    const el = document.getElementById('nfe-table-body');
    if(!el) return;
    el.innerHTML = '';
    
    if(list.length === 0) {
        el.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#999;">Nenhuma nota emitida.</td></tr>';
        return;
    }

    list.forEach(item => {
        const date = new Date(item.data_emissao).toLocaleDateString('pt-BR');
        const statusClass = item.status === 'gerado_e_assinado' ? 'badge-in' : 'badge-out';
        el.innerHTML += `
            <tr>
                <td>${date}</td>
                <td style="font-family:monospace; font-size:0.8rem;">${item.chave_acesso}</td>
                <td><span class="badge ${statusClass}">${item.status.replace(/_/g, ' ')}</span></td>
                <td>
                    <button onclick="downloadXML('${item.id}')" class="btn-sm" style="color: var(--primary);" title="Baixar XML"><i class="fas fa-download"></i> Baixar XML</button>
                </td>
            </tr>
        `;
    });
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

// --- MODAL DE CADASTRO (CLIENTES E FORNECEDORES) ---

function openCadastroModal(type, id = null) {
    const modal = document.getElementById('modal-cadastro');
    const title = document.getElementById('cadastro-modal-title');
    const form = modal.querySelector('form');
    
    document.getElementById('cadastro-id').value = id || '';
    document.getElementById('cadastro-type').value = type;
    
    title.innerText = (id ? 'Editar ' : 'Novo ') + (type === 'cliente' ? 'Cliente' : 'Fornecedor');
    
    if (id) {
        // Carregar dados para edição
        fetch(`${API_URL}/api/${type === 'cliente' ? 'clientes' : 'fornecedores'}`)
            .then(res => res.json())
            .then(list => {
                const item = list.find(i => i.id == id);
                if (item) {
                    document.getElementById('cad-nome').value = item.nome || '';
                    document.getElementById('cad-documento').value = item.documento || '';
                    document.getElementById('cad-ie').value = item.ie || '';
                    document.getElementById('cad-email').value = item.email || '';
                    document.getElementById('cad-telefone').value = item.telefone || '';
                }
            });
    } else {
        form.reset();
    }
    
    modal.classList.add('active');
}

function closeCadastroModal() {
    document.getElementById('modal-cadastro').classList.remove('active');
}

async function lookupDocumento() {
    const doc = document.getElementById('cad-documento').value.replace(/\D/g, '');
    if (doc.length !== 14) {
        alert("A busca automática está disponível apenas para CNPJ (14 dígitos).");
        return;
    }

    const btn = event.currentTarget;
    const originalIcon = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true;

    try {
        // Usando a API pública BrasilAPI para consulta de CNPJ
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
        if (res.ok) {
            const data = await res.json();
            document.getElementById('cad-nome').value = data.razao_social || data.nome_fantasia || '';
            document.getElementById('cad-email').value = data.email || '';
            document.getElementById('cad-telefone').value = data.ddd_telefone_1 || '';
            alert("Dados encontrados e preenchidos!");
        } else {
            alert("CNPJ não encontrado ou erro na busca.");
        }
    } catch (e) {
        alert("Erro ao conectar com o serviço de busca.");
    } finally {
        btn.innerHTML = originalIcon;
        btn.disabled = false;
    }
}

async function saveCadastro(e) {
    e.preventDefault();
    const id = document.getElementById('cadastro-id').value;
    const type = document.getElementById('cadastro-type').value;
    const endpoint = type === 'cliente' ? 'clientes' : 'fornecedores';
    
    const data = {
        nome: document.getElementById('cad-nome').value,
        documento: document.getElementById('cad-documento').value,
        ie: document.getElementById('cad-ie').value,
        email: document.getElementById('cad-email').value,
        telefone: document.getElementById('cad-telefone').value
    };

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `${API_URL}/api/${endpoint}/${id}` : `${API_URL}/api/${endpoint}`;
        
        const res = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });

        if (res.ok) {
            closeCadastroModal();
            loadCadastros();
            alert("Salvo com sucesso!");
        } else {
            alert("Erro ao salvar.");
        }
    } catch(e) {
        alert("Erro na conexão.");
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

// Substituir a chamada de edição antiga pela nova
function editCadastro(id, type) {
    openCadastroModal(type, id);
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

    const res = await sendTransactionToAPI('/api/saida', exitData);
    if (res && res.id) {
        if (confirm("Venda registrada! Deseja emitir a NF-e agora?")) {
            gerarNFe(res.id, exitData.desc);
        }
    }
    e.target.reset();
}

async function gerarNFe(vendaId, clienteNome) {
    try {
        const res = await fetch(`${API_URL}/api/nfe/gerar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ venda_id: vendaId, cliente: clienteNome })
        });
        if (res.ok) {
            const data = await res.json();
            alert(`NF-e Autorizada com sucesso!\nChave: ${data.chave}`);
            if (window.location.hash === '#nfe' || document.getElementById('nfe').classList.contains('active')) {
                loadNFe();
            }
        }
    } catch (e) {
        alert("Erro ao emitir NF-e.");
    }
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
            const result = await response.json();
            alert('Salvo com sucesso!');
            loadDataFromAPI(); // Recarrega a tela
            return result;
        } else {
            alert('Erro ao salvar no servidor.');
            return null;
        }
    } catch (error) {
        alert('Erro de conexão com o servidor.');
        return null;
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

function exportToExcel() {
    const rows = [
        ["Data", "Descrição", "Categoria", "Entrada (R$)", "Saída (R$)"]
    ];

    const sorted = [...appData.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));
    sorted.forEach(t => {
        let isBuy = (t.type === 'buy' || t.type === 'entrada');
        let isSell = (t.type === 'sell' || t.type === 'saida');
        let label = isBuy ? 'Compra' : (isSell ? 'Venda' : 'Despesa');
        rows.push([
            formatDate(t.date),
            t.desc,
            label,
            isSell ? t.value.toFixed(2) : "0.00",
            !isSell ? t.value.toFixed(2) : "0.00"
        ]);
    });

    let csvContent = "data:text/csv;charset=utf-8," 
        + rows.map(e => e.join(";")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `relatorio_financeiro_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
// --- LÓGICA DE EMISSÃO DE NF-e ---

function openEmissaoModal() {
    document.getElementById('modal-emissao-nfe').classList.add('active');
}

function closeEmissaoModal() {
    document.getElementById('modal-emissao-nfe').classList.remove('active');
}

async function emitirNFe(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-emitir-nfe');
    const originalText = btn.innerText;
    btn.innerText = 'Processando...';
    btn.disabled = true;

    try {
        const clienteId = document.getElementById('nfe-cliente-id').value;
        const produtoId = document.getElementById('nfe-produto-id').value;
        const qtd = parseFloat(document.getElementById('nfe-qtd').value);
        const valor = parseFloat(document.getElementById('nfe-valor').value);

        // Buscar dados completos do cliente e produto
        const [clientes, produtos] = await Promise.all([
            fetch(`${API_URL}/api/clientes`).then(res => res.json()),
            fetch(`${API_URL}/api/produtos`).then(res => res.json())
        ]);

        const cliente = clientes.find(c => c.id == clienteId);
        const produto = produtos.find(p => p.id == produtoId);

        const dadosEmissao = {
            venda_id: Math.floor(Math.random() * 1000000), // Simulação de ID de venda
            emitente: {
                cnpj: '56.421.395/0001-50',
                nome: 'M E M HF COMERCIO DE CEBOLAS LTDA',
                fantasia: 'M&M CEBOLAS',
                ie: '562345678110',
                endereco: {
                    xLgr: 'RUA TESTE',
                    nro: '123',
                    xBairro: 'CENTRO',
                    cMun: '3541406',
                    xMun: 'PRESIDENTE PRUDENTE',
                    UF: 'SP',
                    CEP: '19010000',
                    cPais: '1058',
                    xPais: 'BRASIL'
                }
            },
            destinatario: {
                nome: cliente.nome,
                documento: cliente.documento,
                ie: cliente.ie,
                email: cliente.email,
                endereco: {
                    xLgr: 'RUA DESTINO',
                    nro: '456',
                    xBairro: 'BAIRRO DESTINO',
                    cMun: '3541406',
                    xMun: 'PRESIDENTE PRUDENTE',
                    UF: 'SP',
                    CEP: '19010000',
                    cPais: '1058',
                    xPais: 'BRASIL'
                }
            },
            itens: [{
                id: produto.id,
                nome: produto.nome,
                ncm: produto.ncm,
                quantidade: qtd,
                valor: valor
            }]
        };

        const response = await fetch(`${API_URL}/api/nfe/gerar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dadosEmissao)
        });

        if (response.ok) {
            const result = await response.json();
            alert(`NF-e Gerada com Sucesso!\nChave: ${result.chave}`);
            closeEmissaoModal();
            loadNFe();
        } else {
            const error = await response.json();
            alert(`Erro ao emitir NF-e: ${error.error}`);
        }
    } catch (error) {
        console.error(error);
        alert('Erro de conexão ao emitir NF-e.');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function downloadXML(id) {
    window.open(`${API_URL}/api/nfe/download/${id}`, '_blank');
}

// Atualizar a função de seleção para suportar NF-e
const originalOpenSelectionModal = window.openSelectionModal;
window.openSelectionModal = function(type, context = 'entry') {
    currentSelectionTarget = context;
    // Chamada original se existir ou lógica customizada
    const modal = document.getElementById('modal-selection');
    const title = document.getElementById('selection-title');
    title.innerText = 'Selecionar ' + (type === 'cliente' ? 'Cliente' : (type === 'fornecedor' ? 'Fornecedor' : 'Produto'));
    
    const listContainer = document.getElementById('selection-list');
    listContainer.innerHTML = '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
    
    fetch(`${API_URL}/api/${type === 'produto' ? 'produtos' : (type === 'cliente' ? 'clientes' : 'fornecedores')}`)
        .then(res => res.json())
        .then(data => {
            listContainer.innerHTML = '';
            data.forEach(item => {
                const div = document.createElement('div');
                div.className = 'selection-item';
                div.style.padding = '10px';
                div.style.borderBottom = '1px solid #eee';
                div.style.cursor = 'pointer';
                div.innerHTML = `<strong>${item.nome}</strong>`;
                div.onclick = () => {
                    if (context === 'nfe') {
                        document.getElementById(`nfe-${type}-nome`).value = item.nome;
                        document.getElementById(`nfe-${type}-id`).value = item.id;
                        if (type === 'produto') {
                            document.getElementById('nfe-valor').value = item.preco_venda || '';
                        }
                    } else {
                        // Lógica original para entradas/saídas
                        const input = type === 'fornecedor' ? 'entry-source' : 'exit-dest';
                        const el = document.getElementById(input);
                        if(el) el.value = item.nome;
                    }
                    closeSelectionModal();
                };
                listContainer.appendChild(div);
            });
        });

    modal.classList.add('active');
};
