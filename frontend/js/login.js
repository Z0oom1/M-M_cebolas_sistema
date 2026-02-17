// --- CONFIGURAÇÃO DE REDE E AMBIENTE ---
const isElectron = window.location.protocol === 'file:';
const API_URL = 'https://portalmmcebolas.com/api';

/** Determina o URL da Home baseado no ambiente */
function getHomeUrl() {
    if (window.location.protocol === 'file:') return 'home.html';
    if (window.location.pathname.includes('/pages/')) return 'home.html';
    return '/pages/home.html';
}

/** Função principal de Login */
async function fazerLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    const errorEl = document.getElementById('loginError');
    const card = document.getElementById('loginCard');
    
    if (!btn) return;
    
    const oldText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> AUTENTICANDO...';
    if (errorEl) errorEl.style.display = 'none';

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
            
            // Iniciar a experiência de transição Apple
            iniciarTransicaoApple();
        } else {
            showLoginError(data.error || "Usuário ou senha incorretos.");
            btn.disabled = false;
            btn.innerHTML = oldText;
            if (card) {
                card.classList.add('shake');
                setTimeout(() => card.classList.remove('shake'), 500);
            }
        }
    } catch (error) {
        showLoginError("Erro de conexão com o servidor.");
        btn.disabled = false;
        btn.innerHTML = oldText;
    }
}

/** Efeito de Carregamento e Transição estilo Apple */
function iniciarTransicaoApple() {
    const overlay = document.getElementById('loading-overlay');
    const progress = document.getElementById('progress-fill');
    const sound = document.getElementById('startup-sound');
    const body = document.body;

    // 1. Blur e Fade out na página atual
    body.classList.add('page-transition');

    setTimeout(() => {
        // 2. Ativar o overlay preto Apple
        if (overlay) {
            overlay.style.display = 'flex';
            setTimeout(() => overlay.style.opacity = '1', 50);
        }

        // 3. Som do MacBook Pro
        if (sound) {
            sound.volume = 0.6;
            sound.play().catch(e => console.warn("Autoplay bloqueado ou erro no som:", e));
        }

        // 4. Progresso da barra
        if (progress) {
            setTimeout(() => {
                progress.style.width = '100%';
            }, 100);
        }

        // 5. Redirecionamento final
        setTimeout(() => {
            window.location.replace(getHomeUrl());
        }, 3600); // Sincronizado com a animação da barra e som
    }, 600);
}

/** Exibição de Erros */
function showLoginError(msg) {
    const errorEl = document.getElementById('loginError');
    if (errorEl) {
        errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
        errorEl.style.display = 'block';
    }
}

/** Inicialização da Página */
window.onload = function() {
    // Remover loader inicial
    const loader = document.getElementById('initial-loader');
    if(loader) {
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 600);
        }, 400);
    }

    // Configuração Titlebar (Electron)
    if (isElectron) {
        const titlebar = document.getElementById('titlebar');
        if (titlebar) titlebar.style.display = 'flex';
        
        try {
            const { ipcRenderer } = require('electron');
            document.getElementById('closeBtn')?.addEventListener('click', () => ipcRenderer.send('close-app'));
            document.getElementById('minBtn')?.addEventListener('click', () => ipcRenderer.send('minimize-app'));
            document.getElementById('maxBtn')?.addEventListener('click', () => ipcRenderer.send('maximize-app'));
        } catch(e) {}
    }

    // Vincular formulário
    const form = document.getElementById('formLogin');
    if (form) {
        form.addEventListener('submit', fazerLogin);
    }
}
