const USERS = [
    { username: 'admin', role: 'admin', label: 'Administrador' },
    { username: 'estoque', role: 'user', label: 'Gerente de Estoque' },
    { username: 'vendas', role: 'user', label: 'Vendas' }
];



function fazerLogin(e) {
    e.preventDefault();
    const user = document.getElementById('loginUser').value;
    const pass = document.getElementById('loginPass').value;

    // Login Simples
    if (pass === '123') {
        const foundUser = USERS.find(u => u.username.toLowerCase() === user.toLowerCase());
        if(foundUser) {
            sessionStorage.setItem('mm_user', JSON.stringify(foundUser));
            
            // --- CORREÇÃO AQUI ---
            // Como login.html e home.html estão na mesma pasta, use apenas o nome do arquivo
            window.location.href = 'home.html'; 
            
        } else {
            alert("Usuário não encontrado.");
        }
    } else {
        alert("Senha incorreta.");
    }
}

function abrirSwitcher() {
    const lista = document.getElementById('listaContas');
    lista.innerHTML = '';
    USERS.forEach(u => {
        const div = document.createElement('div');
        div.className = 'account-item';
        div.innerHTML = `
            <div style="width:30px; height:30px; background:#1A5632; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center;">${u.username[0].toUpperCase()}</div>
            <div><strong>${u.username}</strong><br><small>${u.label}</small></div>
        `;
        div.onclick = () => {
            document.getElementById('loginUser').value = u.username;
            document.getElementById('loginPass').value = '123';
            document.getElementById('modalSwitcher').style.display = 'none';
        };
        lista.appendChild(div);
    });
    document.getElementById('modalSwitcher').style.display = 'flex';
    
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