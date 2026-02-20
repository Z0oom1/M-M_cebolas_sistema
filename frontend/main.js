// Electron: app desktop consome a API da VPS (https://portalmmcebolas.com.br) quando não for localhost.
// O frontend em script.js define API_URL dinamicamente (file:// → produção; localhost → :3000).
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Configuração básica do autoUpdater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

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

    // --- LÓGICA DE AUTO-UPDATE ---
    
    autoUpdater.on('update-available', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Atualização disponível',
            message: 'Uma nova versão está disponível. O download começará em segundo plano.',
            buttons: ['OK']
        });
    });

    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Atualização pronta',
            message: 'A atualização foi baixada e será instalada ao reiniciar o aplicativo.',
            buttons: ['Reiniciar agora', 'Depois'],
            defaultId: 0
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall();
            }
        });
    });

    autoUpdater.on('error', (err) => {
        console.error('Erro no auto-updater:', err);
    });

    // Verificar atualizações após a janela ser criada
    autoUpdater.checkForUpdatesAndNotify();
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
