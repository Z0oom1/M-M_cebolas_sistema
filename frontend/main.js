// Adicionamos 'ipcMain' para receber os comandos dos botões
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
    // Cria a janela do navegador.
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false, // REMOVE a moldura/barra padrão do Windows
        autoHideMenuBar: true, // Garante que nenhum menu antigo apareça
        backgroundColor: '#000000', // Evita o "piscar" branco ao abrir
        icon: path.join(__dirname, 'Imgs', 'Logo_M&M_Cebolas.png'),
        webPreferences: {
            // Suas configurações originais (mantendo compatibilidade com seu código)
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // CARREGA A PÁGINA INICIAL
    win.loadFile(path.join(__dirname, 'pages', 'login.html'));

    // --- LÓGICA DOS BOTÕES PERSONALIZADOS ---
    
    // Recebe o comando de minimizar vindo do HTML
    ipcMain.on('minimize-app', () => {
        win.minimize();
    });

    // Recebe o comando de maximizar/restaurar
    ipcMain.on('maximize-app', () => {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    });

    // Recebe o comando de fechar
    ipcMain.on('close-app', () => {
        win.close();
    });

    // Limpeza: Remove os ouvintes quando a janela for fechada para evitar erros de memória
    win.on('closed', () => {
        ipcMain.removeAllListeners('minimize-app');
        ipcMain.removeAllListeners('maximize-app');
        ipcMain.removeAllListeners('close-app');
    });

    // (Opcional) Abre o DevTools
    // win.webContents.openDevTools(); 
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});