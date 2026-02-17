// --- CONFIGURAÇÃO DE REDE ---
const isElectron = window.location.protocol === 'file:';
const API_URL = 'https://portalmmcebolas.com/api';

function getHomeUrl() {
    if (window.location.protocol === 'file:') return 'home.html';
    if (window.location.pathname.includes('/pages/')) return 'home.html';
    return '/pages/home.html';
}

async function fazerLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    if (!btn) return;
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
            
            // Iniciar Efeito Apple de Loading
            iniciarTransicaoApple();
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

function iniciarTransicaoApple() {
    const overlay = document.getElementById('loading-overlay');
    const progress = document.getElementById('progress-fill');
    const sound = document.getElementById('startup-sound');
    const body = document.body;

    // 1. Aplicar Blur Suave na página de login
    body.classList.add('page-transition');

    setTimeout(() => {
        // 2. Mostrar Overlay Preto estilo Apple
        overlay.style.display = 'flex';
        setTimeout(() => overlay.style.opacity = '1', 10);

        // 3. Tocar Som do MacBook Pro
        if (sound) {
            sound.play().catch(e => console.log("Erro ao tocar som:", e));
        }

        // 4. Animar barra de progresso
        setTimeout(() => {
            progress.style.width = '100%';
        }, 100);

        // 5. Redirecionar após o carregamento
        setTimeout(() => {
            const homeUrl = getHomeUrl();
            window.location.replace(homeUrl);
        }, 3500); // Tempo para a barra encher e o som tocar
    }, 800);
}

function showLoginError(msg) {
    let errEl = document.getElementById('login-error');
    if (!errEl) {
        errEl = document.createElement('div');
        errEl.id = 'login-error';
        errEl.style.color = '#ef4444';
        errEl.style.marginTop = '15px';
        errEl.style.fontWeight = '600';
        document.querySelector('form').after(errEl);
    }
    errEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${msg}`;
    
    const card = document.querySelector('.login-card');
    card.style.animation = 'none';
    card.offsetHeight; 
    card.style.animation = 'shake 0.5s ease';
}

window.onload = function() {
    const loader = document.getElementById('initial-loader');
    if(loader) {
        setTimeout(() => {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 500);
        }, 500);
    }

    const titlebar = document.getElementById('titlebar');
    if (isElectron) {
        if (titlebar) titlebar.style.display = 'flex';
    }

    const form = document.getElementById('formLogin');
    if (form) {
        form.addEventListener('submit', fazerLogin);
    }
}
