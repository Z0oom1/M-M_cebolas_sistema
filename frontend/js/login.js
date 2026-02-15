// --- CONFIGURAÇÃO DE REDE (igual ao script.js) ---
// Electron (file:) → localhost; Web → domínio oficial. Base já inclui /api.
const isElectron = window.location.protocol === 'file:';
const API_URL = isElectron
    ? 'http://localhost:3000/api'
    : 'https://portalmmcebolas.com/api';

async function fazerLogin(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const oldText = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> AUTENTICANDO...';

    const username = document.getElementById('loginUser').value;
    const password = document.getElementById('loginPass').value;

    try {
        const response = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('mm_user', JSON.stringify({ user: data.user, role: data.role }));
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 100);
        } else {
            showLoginError(data.error || "Usuário ou senha incorretos.");
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    } catch (error) {
        showLoginError("Erro de conexão. Verifique se o servidor está online.");
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

    // LÓGICA DA BARRA DE CONTROLE (ELECTRON)
    const titlebar = document.getElementById('titlebar');
    if (isElectron) {
        if (titlebar) titlebar.style.display = 'flex';
        const { ipcRenderer } = require('electron');
        document.getElementById('closeBtn')?.addEventListener('click', () => ipcRenderer.send('close-app'));
        document.getElementById('minBtn')?.addEventListener('click', () => ipcRenderer.send('minimize-app'));
        document.getElementById('maxBtn')?.addEventListener('click', () => ipcRenderer.send('maximize-app'));
    } else {
        if (titlebar) titlebar.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formLogin');
    if (form) {
        form.addEventListener('submit', fazerLogin);
        console.log("Formulário de login vinculado com sucesso!");
    } else {
        console.error("Não encontrei o formulário com ID 'formLogin'");
    }
});