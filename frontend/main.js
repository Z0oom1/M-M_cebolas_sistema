// Electron: app desktop consome a API da VPS (https://portalmmcebolas.com.br) quando não for localhost.
// O frontend em script.js define API_URL dinamicamente (file:// → produção; localhost → :3000).
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        autoHideMenuBar: true,
        backgroundColor: '#000000',
        title: 'M&M Cebolas',
        icon: path.join(__dirname, 'Imgs', 'Logo_M&M_Cebolas.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            autoplayPolicy: 'no-user-gesture-required'
        }
    });

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