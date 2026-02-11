// --- CONFIGURAÇÃO DE REDE ---
const isElectron = window.location.protocol === 'file:';
const API_URL = isElectron ? 'http://localhost:3000' : '';

async function fazerLogin(e) {
    e.preventDefault();
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
            alert(err.error || "Erro ao fazer login.");
        }
    } catch (error) {
        console.error("Erro no login:", error);
        alert("Erro de conexão com o servidor.");
    }
}

async function abrirSwitcher() {
    const lista = document.getElementById('listaContas');
    lista.innerHTML = '<div style="padding:20px; text-align:center;"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
    document.getElementById('modalSwitcher').style.display = 'flex';

    try {
        const response = await fetch(`${API_URL}/api/usuarios`);
        const users = await response.json();
        
        lista.innerHTML = '';
        users.forEach(u => {
            const div = document.createElement('div');
            div.className = 'account-item';
            div.innerHTML = `
                <div style="width:30px; height:30px; background:#1A5632; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center;">${u.username[0].toUpperCase()}</div>
                <div><strong>${u.username}</strong><br><small>${u.label}</small></div>
            `;
            div.onclick = () => {
                document.getElementById('loginUser').value = u.username;
                document.getElementById('loginPass').value = '';
                document.getElementById('loginPass').focus();
                document.getElementById('modalSwitcher').style.display = 'none';
            };
            lista.appendChild(div);
        });
    } catch (error) {
        lista.innerHTML = '<div style="padding:20px; color:red;">Erro ao carregar usuários.</div>';
    }
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