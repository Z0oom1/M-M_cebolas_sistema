// --- CONFIGURAÇÃO DE REDE ---
const isElectron = window.location.protocol === 'file:';
const API_URL = isElectron ? 'http://localhost:3000' : '';

async function fazerLogin(e) {
    e.preventDefault();
    const btn = e.submitter || e.target.querySelector('button');
    const oldText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Autenticando...';

    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('mm_user', JSON.stringify(data));
            window.location.href = 'home.html';
        } else {
            const err = await response.json();
            showLoginError(err.error || "Usuário ou senha incorretos.");
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    } catch (error) {
        console.error("Erro no login:", error);
        showLoginError("Erro de conexão com o servidor.");
        btn.disabled = false;
        btn.innerHTML = oldText;
    }
}

function showLoginError(msg) {
    let errEl = document.getElementById('login-error');
    if (!errEl) {
        errEl = document.createElement('div');
        errEl.id = 'login-error';
        errEl.className = 'error-message';
        document.querySelector('form').after(errEl);
    }
    errEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    errEl.style.display = 'block';
    
    // Shake animation
    const card = document.querySelector('.login-card');
    card.style.animation = 'none';
    card.offsetHeight; // trigger reflow
    card.style.animation = 'shake 0.5s ease';
}

window.onload = function() {
    const loading = document.getElementById('loading-screen');
    if(loading) {
        setTimeout(() => {
            loading.style.opacity = '0';
            setTimeout(() => loading.style.display = 'none', 500);
        }, 500);
    }
}

// --- LÓGICA DA BARRA DE CONTROLE (ELECTRON) ---
if (isElectron) {
    const { ipcRenderer } = require('electron');

    document.getElementById('closeBtn')?.addEventListener('click', () => ipcRenderer.send('close-app'));
    document.getElementById('minBtn')?.addEventListener('click', () => ipcRenderer.send('minimize-app'));
    document.getElementById('maxBtn')?.addEventListener('click', () => ipcRenderer.send('maximize-app'));
} else {
    // Ocultar barra de título se não for Electron
    const titlebar = document.getElementById('titlebar');
    if (titlebar) titlebar.style.display = 'none';
}
