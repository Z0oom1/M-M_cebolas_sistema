// --- CONFIGURAÇÃO DE REDE ---
// Nota: localStorage é sensível ao protocolo e domínio. Se logar em http://72.60.8.186,
// os dados não aparecem em https://portalmmcebolas.com. Use sempre o mesmo URL para login e Home.
const isElectron = window.location.protocol === 'file:';

// Padronização da URL com /api no final (igual ao script.js)
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
            const data = await response.json();
            localStorage.setItem('token', data.token);
            localStorage.setItem('mm_user', JSON.stringify(data));
            
            // Troque o redirecionamento direto por este com timeout:
            setTimeout(() => {
                window.location.href = 'home.html';
            }, 100); 
        } else {
            showLoginError(data.error || "Usuário ou senha incorretos.");
            btn.disabled = false;
            btn.innerHTML = oldText;
        }
    } catch (error) {
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

// No final do login.js
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('formLogin');
    if (form) {
        // Removemos o atributo onsubmit do HTML e controlamos tudo por aqui
        form.addEventListener('submit', async (e) => {
            e.preventDefault(); // Trava o recarregamento da página imediatamente
            await fazerLogin(e); // Chama a sua função de login
        });
        console.log("Formulário de login vinculado com sucesso!");
    }
});