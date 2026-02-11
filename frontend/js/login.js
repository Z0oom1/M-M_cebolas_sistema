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
            const user = await response.json();
            sessionStorage.setItem('mm_user', JSON.stringify(user));
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
        errEl.style.color = '#ef4444';
        errEl.style.background = '#fee2e2';
        errEl.style.padding = '10px';
        errEl.style.borderRadius = '8px';
        errEl.style.marginTop = '15px';
        errEl.style.fontSize = '0.85rem';
        errEl.style.textAlign = 'center';
        errEl.style.fontWeight = '600';
        document.querySelector('form').after(errEl);
    }
    errEl.innerText = msg;
    errEl.style.display = 'block';
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
