// M&M Cebolas - Core Script
let appData = {
    transactions: [],
    products: [],
    clients: [],
    suppliers: []
};

let currentSectionId = 'dashboard';

// --- INICIALIZAÇÃO ---
window.onload = function() {
    const isElectronEnv = typeof window.process !== 'undefined' && window.process.type === 'renderer' || 
                         navigator.userAgent.toLowerCase().indexOf(' electron/') > -1;
    
    if (isElectronEnv) {
        document.body.classList.add('is-electron');
    }

    checkLogin();
    loadDataFromAPI();
    setupSelectors();
};

function setupSelectors() {
    // Icon Selector
    document.querySelectorAll('.icon-option').forEach(opt => {
        opt.onclick = () => {
            document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            document.getElementById('prod-icone').value = opt.dataset.icon;
        };
    });

    // Color Selector
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.onclick = () => {
            document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            document.getElementById('prod-cor').value = opt.dataset.color;
        };
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

    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 || response.status === 403) {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
        return;
    }
    return response;
}

async function loadDataFromAPI() {
    try {
        const [resMov, resProd] = await Promise.all([
            fetchWithAuth('/api/movimentacoes'),
            fetchWithAuth('/api/produtos')
        ]);

        if (resMov) appData.transactions = await resMov.json();
        if (resProd) appData.products = await resProd.json();

        showSection(currentSectionId);
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
    }
}

function showSection(id) {
    currentSectionId = id;
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
    
    // Injetar HTML da seção
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

// --- GESTÃO DE PRODUTOS ---
function openProdutoModal(data = null) {
    const modal = document.getElementById('modal-produto');
    modal.classList.add('active');

    document.getElementById('prod-id').value = data ? data.id : '';
    document.getElementById('prod-nome').value = data ? data.nome : '';
    document.getElementById('prod-ncm').value = data ? data.ncm : '07031019';
    document.getElementById('prod-preco').value = data ? data.preco_venda : '';
    document.getElementById('prod-min').value = data ? data.estoque_minimo : '100';
    
    // Reset Selectors
    const icone = data ? data.icone : 'fa-box';
    const cor = data ? data.cor : '#1A5632';
    
    document.getElementById('prod-icone').value = icone;
    document.getElementById('prod-cor').value = cor;

    document.querySelectorAll('.icon-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.icon === icone);
    });
    document.querySelectorAll('.color-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.color === cor);
    });
}

function closeProdutoModal() {
    document.getElementById('modal-produto').classList.remove('active');
}

async function saveProduto(event) {
    event.preventDefault();
    const id = document.getElementById('prod-id').value;
    const data = {
        nome: document.getElementById('prod-nome').value,
        ncm: document.getElementById('prod-ncm').value,
        preco_venda: parseFloat(document.getElementById('prod-preco').value),
        estoque_minimo: parseInt(document.getElementById('prod-min').value),
        icone: document.getElementById('prod-icone').value,
        cor: document.getElementById('prod-cor').value
    };

    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/produtos/${id}` : '/api/produtos';

    await fetchWithAuth(url, {
        method,
        body: JSON.stringify(data)
    });

    closeProdutoModal();
    loadDataFromAPI();
}

// --- NF-E ---
function generateNFe(type) {
    alert(`Gerando NF-e (${type})... Aguarde o processamento.`);
    // Simulação de geração para evitar erros de certificado inexistente no sandbox
    setTimeout(() => {
        const link = document.createElement('a');
        link.href = '#';
        link.onclick = () => alert('Download do PDF iniciado (Simulação)');
        alert('NF-e Gerada com Sucesso! Clique em OK para baixar o PDF de teste.');
    }, 2000);
}

// Outras funções auxiliares...
function logout() {
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

function checkLogin() {
    if (!localStorage.getItem('token')) window.location.href = 'login.html';
}
