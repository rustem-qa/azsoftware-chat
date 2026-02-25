/**
 * AZSoftware Firebase Application
 * Realtime Database ilə işləyən messenger
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    set, 
    onValue, 
    push, 
    update,
    remove,
    onDisconnect,
    serverTimestamp,
    query,
    orderByChild,
    limitToLast
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// 🔽 SİZİN CONFIG MƏLUMATLARINIZ - BURAYA YAPIŞDIRIN
const firebaseConfig = {
    apiKey: "AIzaSyBUj0C-F0MYDheMMhnvYrLlhovCIjMuNyA",
    authDomain: "azsoftware-chat.firebaseapp.com",
    databaseURL: "https://azsoftware-chat-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "azsoftware-chat",
    storageBucket: "azsoftware-chat.firebasestorage.app",
    messagingSenderId: "195768328928",
    appId: "1:195768328928:web:104fc8883aabf648d5a685"
};

// Firebase başlat
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

class AZSoftwareApp {
    constructor() {
        this.currentUser = null;
        this.contacts = [];
        this.currentChat = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.localStream = null;
        this.remoteStream = null;
        this.peerConnection = null;
        this.messagesRef = null;
        this.typingTimeout = null;
        this.callTimer = null;
        this.callStartTime = null;
        
        this.init();
    }

    async init() {
        // İstifadəçi yoxlaması
        const userData = localStorage.getItem('azsoftware_user');
        if (!userData && !window.location.href.includes('index.html')) {
            window.location.href = 'index.html';
            return;
        }

        if (userData) {
            this.currentUser = JSON.parse(userData);
            this.updateUI();
            this.setupFirebaseListeners();
            this.setupSearch();
            this.loadRecentFiles();
            this.markUserOnline();
        }
    }

    markUserOnline() {
        // İstifadəçini online et
        const userRef = ref(database, 'users/' + this.currentUser.id);
        update(userRef, {
            status: 'online',
            lastSeen: serverTimestamp()
        });
        
        // Disconnect olduqda offline et
        onDisconnect(userRef).update({
            status: 'offline',
            lastSeen: serverTimestamp()
        });
    }

    setupFirebaseListeners() {
        // 1. Bütün istifadəçiləri dinlə (realtime)
        const usersRef = ref(database, 'users');
        onValue(usersRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                this.contacts = Object.values(data).filter(u => u.id !== this.currentUser.id);
                this.renderContacts();
            }
        });

        // 2. Gələn zəngləri dinlə
        const callsRef = ref(database, 'calls/' + this.currentUser.id);
        onValue(callsRef, (snapshot) => {
            const callData = snapshot.val();
            if (callData && callData.status === 'incoming') {
                this.handleIncomingCall(callData);
            } else if (callData && callData.status === 'ended') {
                this.endCall();
            }
        });
    }

    updateUI() {
        const userNameEl = document.getElementById('currentUserName');
        const userDeptEl = document.getElementById('currentUserDept');
        
        if (userNameEl) userNameEl.textContent = this.currentUser.name;
        if (userDeptEl) userDeptEl.textContent = this.currentUser.department + ' • ID: ' + this.currentUser.id;
    }

    renderContacts() {
        const list = document.getElementById('employeeList');
        if (!list) return;
        
        if (this.contacts.length === 0) {
            list.innerHTML = '<div class="p-4 text-center text-slate-400 text-sm">Heç bir istifadəçi onlayn deyil</div>';
            return;
        }
        
        list.innerHTML = this.contacts.map(contact => {
            const statusColor = contact.status === 'online' ? 'bg-green-500' : 'bg-slate-400';
            const lastSeen = contact.lastSeen ? new Date(contact.lastSeen).toLocaleTimeString() : '';
            
            return `
            <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-primary/5 cursor-pointer transition-colors ${this.currentChat?.id === contact.id ? 'bg-primary/10 border-l-4 border-primary' : ''}" onclick="app.selectContact('${contact.id}')">
                <div class="relative">
                    <div class="size-12 rounded-full bg-slate-200 dark:bg-primary/20 flex items-center justify-center">
                        <span class="material-symbols-outlined text-slate-500 !text-[32px]">account_circle</span>
                    </div>
                    <div class="absolute bottom-0 right-0 size-3 ${statusColor} border-2 border-white dark:border-background-dark rounded-full"></div>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center">
                        <h3 class="text-sm font-semibold truncate">${contact.name}</h3>
                        <span class="text-[10px] text-slate-400">${contact.status === 'online' ? '●' : lastSeen}</span>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 truncate">${contact.department} • ID: ${contact.id}</p>
                </div>
            </div>
        `}).join('');
    }

    setupSearch() {
        const searchInput = document.getElementById('searchUserInput');
        if (!searchInput) return;
        
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            this.filterContacts(query);
        });
    }

    filterContacts(query) {
        const list = document.getElementById('employeeList');
        if (!list) return;
        
        if (!query) {
            this.renderContacts();
            return;
        }
        
        const filtered = this.contacts.filter(contact => 
            contact.id.toLowerCase().includes(query) || 
            contact.name.toLowerCase().includes(query) ||
            contact.department.toLowerCase().includes(query)
        );
        
        if (filtered.length === 0) {
            list.innerHTML = `<div class="p-4 text-center text-slate-400 text-sm">"${query}" üçün nəticə tapılmadı</div>`;
            return;
        }
        
        list.innerHTML = filtered.map(contact => {
            const statusColor = contact.status === 'online' ? 'bg-green-500' : 'bg-slate-400';
            return `
            <div class="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-primary/5 cursor-pointer transition-colors" onclick="app.selectContact('${contact.id}')">
                <div class="relative">
                    <div class="size-12 rounded-full bg-slate-200 dark:bg-primary/20 flex items-center justify-center">
                        <span class="material-symbols-outlined text-slate-500 !text-[32px]">account_circle</span>
                    </div>
                    <div class="absolute bottom-0 right-0 size-3 ${statusColor} border-2 border-white dark:border-background-dark rounded-full"></div>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex justify-between items-center">
                        <h3 class="text-sm font-semibold truncate">${contact.name}</h3>
                    </div>
                    <p class="text-xs text-slate-500 dark:text-slate-400 truncate">ID: ${contact.id} • ${contact.department}</p>
                </div>
            </div>
        `}).join('');
    }

    selectContact(contactId) {
        const contact = this.contacts.find(c => c.id === contactId);
        if (!contact) return;
        
        this.currentChat = contact;
        
        // UI yenilə
        document.getElementById('chatUserName').textContent = contact.name;
        document.getElementById('chatUserStatus').textContent = contact.department;
        document.getElementById('remoteUserName').textContent = contact.name;
        
        const statusDot = document.getElementById('chatUserStatusDot');
        statusDot.className = `absolute bottom-0 right-0 size-2.5 border-2 border-white dark:border-background-dark rounded-full ${contact.status === 'online' ? 'bg-green-500' : 'bg-slate-400'}`;
        
        // Mesajları dinləməyə başla
        this.listenToMessages(contactId);
        
        // Typing dinlə
        this.listenToTyping(contactId);
        
        // UI seçili vəziyyətini yenilə
        this.renderContacts();
    }

    listenToMessages(contactId) {
        // Chat ID yarat (kiçik ID birinci)
        const chatId = [this.currentUser.id, contactId].sort().join('_');
        const messagesRef = ref(database, 'messages/' + chatId);
        const messagesQuery = query(messagesRef, orderByChild('timestamp'));
        
        const container = document.getElementById('messagesContainer');
        container.innerHTML = '';
        
        onValue(messagesQuery, (snapshot) => {
            const data = snapshot.val();
            container.innerHTML = '';
            
            if (!data) {
                container.innerHTML = '<div class="flex items-center justify-center h-full text-slate-400"><p>Hələ mesaj yoxdur. Söhbətə başlayın!</p></div>';
                return;
            }
            
            Object.values(data).sort((a, b) => a.timestamp - b.timestamp).forEach(msg => {
                const isSent = msg.senderId === this.currentUser.id;
                this.appendMessageToUI(msg, isSent);
            });
            
            container.scrollTop = container.scrollHeight;
        });
        
        this.messagesRef = messagesRef;
    }

    listenToTyping(contactId) {
        const typingRef = ref(database, `typing/${contactId}`);
        onValue(typingRef, (snapshot) => {
            const data = snapshot.val();
            const indicator = document.getElementById('typingIndicator');
            if (data && data.to === this.currentUser.id && data.typing) {
                indicator.classList.remove('hidden');
            } else {
                indicator.classList.add('hidden');
            }
        });
    }

    onTyping() {
        if (!this.currentChat) return;
        
        const typingRef = ref(database, `typing/${this.currentUser.id}`);
        set(typingRef, {
            to: this.currentChat.id,
            typing: true,
            timestamp: serverTimestamp()
        });
        
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            set(typingRef, {
                to: this.currentChat.id,
                typing: false,
                timestamp: serverTimestamp()
            });
        }, 3000);
    }

    async sendMessage() {
        const input = document.getElementById('messageInput');
        const text = input.value.trim();
        
        if (!text || !this.currentChat) {
            if (!this.currentChat) alert('Zəhmət olmasa əvvəlcə bir istifadəçi seçin');
            return;
        }

        const chatId = [this.currentUser.id, this.currentChat.id].sort().join('_');
        const messagesRef = ref(database, 'messages/' + chatId);
        
        const message = {
            text: text,
            sender: this.currentUser.name,
            senderId: this.currentUser.id,
            receiverId: this.currentChat.id,
            type: 'text',
            timestamp: Date.now()
        };

        try {
            await push(messagesRef, message);
            input.value = '';
            
            const typingRef = ref(database, `typing/${this.currentUser.id}`);
            set(typingRef, { typing: false });
            
        } catch (error) {
            console.error('Mesaj göndərilmədi:', error);
            alert('Mesaj göndərilmədi: ' + error.message);
        }
    }

    async handleFileSelect(event) {
        const files = event.target.files;
        if (!files.length || !this.currentChat) {
            alert('Zəhmət olmasa əvvəlcə bir istifadəçi seçin');
            return;
        }
        
        for (const file of files) {
            const base64 = await this.fileToBase64(file);
            
            const chatId = [this.currentUser.id, this.currentChat.id].sort().join('_');
            const messagesRef = ref(database, 'messages/' + chatId);
            
            const message = {
                type: 'file',
                fileName: file.name,
                fileSize: file.size,
                fileType: file.type,
                fileData: base64,
                sender: this.currentUser.name,
                senderId: this.currentUser.id,
                receiverId: this.currentChat.id,
                timestamp: Date.now()
            };
            
            try {
                await push(messagesRef, message);
                this.addToRecentFiles(message);
            } catch (error) {
                alert('Fayl göndərilmədi: ' + error.message);
            }
        }
        
        event.target.value = '';
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    getFileIcon(fileType) {
        if (fileType?.includes('pdf')) return 'description';
        if (fileType?.includes('image')) return 'image';
        if (fileType?.includes('video')) return 'videocam';
        if (fileType?.includes('audio')) return 'audio_file';
        if (fileType?.includes('word') || fileType?.includes('document')) return 'article';
        if (fileType?.includes('excel') || fileType?.includes('sheet')) return 'table_chart';
        return 'article';
    }

    appendMessageToUI(message, isSent) {
        const container = document.getElementById('messagesContainer');
        
        if (container.querySelector('.text-slate-400')) {
            container.innerHTML = '';
        }
        
        const div = document.createElement('div');
        
        if (isSent) {
            div.className = 'flex items-end justify-end gap-3 ml-auto max-w-[70%] mb-4';
            if (message.type === 'file') {
                div.innerHTML = `
                    <div class="flex flex-col items-end gap-1">
                        <span class="text-[11px] text-slate-400 mr-1">Mən, ${new Date(message.timestamp).toLocaleTimeString()}</span>
                        <div class="bg-primary/5 dark:bg-primary/20 border border-primary/20 p-3 rounded-xl flex items-center gap-4 w-64">
                            <div class="size-10 bg-red-500 rounded flex items-center justify-center shrink-0">
                                <span class="material-symbols-outlined text-white">${this.getFileIcon(message.fileType)}</span>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="text-sm font-semibold truncate">${message.fileName}</h4>
                                <p class="text-[10px] text-slate-400 uppercase">${this.formatFileSize(message.fileSize)}</p>
                            </div>
                            <a href="${message.fileData}" download="${message.fileName}" class="material-symbols-outlined text-primary hover:bg-primary/10 rounded p-1 cursor-pointer">download</a>
                        </div>
                    </div>
                    <div class="size-12 rounded-full bg-slate-200 dark:bg-primary/20 flex items-center justify-center">
                        <span class="material-symbols-outlined text-slate-500 !text-[32px]">account_circle</span>
                    </div>
                `;
            } else if (message.type === 'audio') {
                div.innerHTML = `
                    <div class="flex flex-col items-end gap-1">
                        <span class="text-[11px] text-slate-400 mr-1">Mən, ${new Date(message.timestamp).toLocaleTimeString()}</span>
                        <div class="bg-primary text-white p-3 rounded-2xl rounded-br-none shadow-lg shadow-primary/10 w-64">
                            <div class="flex items-center gap-3">
                                <button class="material-symbols-outlined" onclick="app.playAudio('${message.fileData}')">play_arrow</button>
                                <div class="flex-1 h-8 flex items-center gap-0.5">
                                    <div class="w-1 h-3 bg-white/40 rounded-full"></div>
                                    <div class="w-1 h-5 bg-white rounded-full"></div>
                                    <div class="w-1 h-4 bg-white/60 rounded-full"></div>
                                    <div class="w-1 h-6 bg-white rounded-full"></div>
                                    <div class="w-1 h-2 bg-white/40 rounded-full"></div>
                                </div>
                                <span class="text-[10px] font-mono">${message.duration || '0:24'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="size-12 rounded-full bg-slate-200 dark:bg-primary/20 flex items-center justify-center">
                        <span class="material-symbols-outlined text-slate-500 !text-[32px]">account_circle</span>
                    </div>
                `;
            } else {
                div.innerHTML = `
                    <div class="flex flex-col items-end gap-1">
                        <span class="text-[11px] text-slate-400 mr-1">Mən, ${new Date(message.timestamp).toLocaleTimeString()}</span>
                        <div class="bg-primary text-white p-3 rounded-2xl rounded-br-none shadow-lg shadow-primary/10 max-w-md">
                            <p class="text-sm">${message.text}</p>
                        </div>
                    </div>
                    <div class="size-12 rounded-full bg-slate-200 dark:bg-primary/20 flex items-center justify-center">
                        <span class="material-symbols-outlined text-slate-500 !text-[32px]">account_circle</span>
                    </div>
                `;
            }
        } else {
            div.className = 'flex items-end gap-3 max-w-[70%] mb-4';
            if (message.type === 'file') {
                div.innerHTML = `
                    <div class="size-12 rounded-full bg-slate-200 dark:bg-primary/20 flex items-center justify-center">
                        <span class="material-symbols-outlined text-slate-500 !text-[32px]">account_circle</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-[11px] text-slate-400 ml-1">${message.sender}, ${new Date(message.timestamp).toLocaleTimeString()}</span>
                        <div class="bg-slate-100 dark:bg-primary/10 p-3 rounded-2xl rounded-bl-none">
                            <div class="bg-primary/5 dark:bg-primary/20 border border-primary/20 p-3 rounded-xl flex items-center gap-4 w-64">
                                <div class="size-10 bg-red-500 rounded flex items-center justify-center shrink-0">
                                    <span class="material-symbols-outlined text-white">${this.getFileIcon(message.fileType)}</span>
                                </div>
                                <div class="flex-1 min-w-0">
                                    <h4 class="text-sm font-semibold truncate">${message.fileName}</h4>
                                    <p class="text-[10px] text-slate-400 uppercase">${this.formatFileSize(message.fileSize)}</p>
                                </div>
                                <a href="${message.fileData}" download="${message.fileName}" class="material-symbols-outlined text-primary hover:bg-primary/10 rounded p-1 cursor-pointer">download</a>
                            </div>
                        </div>
                    </div>
                `;
            } else if (message.type === 'audio') {
                div.innerHTML = `
                    <div class="size-12 rounded-full bg-slate-200 dark:bg-primary/20 flex items-center justify-center">
                        <span class="material-symbols-outlined text-slate-500 !text-[32px]">account_circle</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-[11px] text-slate-400 ml-1">${message.sender}, ${new Date(message.timestamp).toLocaleTimeString()}</span>
                        <div class="bg-slate-100 dark:bg-primary/10 p-3 rounded-2xl rounded-bl-none w-64">
                            <div class="flex items-center gap-3">
                                <button class="material-symbols-outlined text-primary" onclick="app.playAudio('${message.fileData}')">play_arrow</button>
                                <div class="flex-1 h-8 flex items-center gap-0.5">
                                    <div class="w-1 h-3 bg-primary/40 rounded-full"></div>
                                    <div class="w-1 h-5 bg-primary rounded-full"></div>
                                    <div class="w-1 h-4 bg-primary/60 rounded-full"></div>
                                    <div class="w-1 h-6 bg-primary rounded-full"></div>
                                    <div class="w-1 h-2 bg-primary/40 rounded-full"></div>
                                </div>
                                <span class="text-[10px] text-slate-500 font-mono">${message.duration || '0:24'}</span>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                div.innerHTML = `
                    <div class="size-12 rounded-full bg-slate-200 dark:bg-primary/20 flex items-center justify-center">
                        <span class="material-symbols-outlined text-slate-500 !text-[32px]">account_circle</span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <span class="text-[11px] text-slate-400 ml-1">${message.sender}, ${new Date(message.timestamp).toLocaleTimeString()}</span>
                        <div class="bg-slate-100 dark:bg-primary/10 p-3 rounded-2xl rounded-bl-none max-w-md">
                            <p class="text-sm">${message.text}</p>
                        </div>
                    </div>
                `;
            }
        }
        
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    playAudio(dataUrl) {
        const audio = new Audio(dataUrl);
        audio.play();
    }

    async toggleRecording() {
        const btn = document.getElementById('recordBtn');
        
        if (!this.mediaRecorder) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                this.mediaRecorder = new MediaRecorder(stream);
                this.recordedChunks = [];
                
                this.mediaRecorder.ondataavailable = (e) => {
                    if (e.data.size > 0) this.recordedChunks.push(e.data);
                };
                
                this.mediaRecorder.onstop = async () => {
                    const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                    const reader = new FileReader();
                    reader.onload = async () => {
                        if (!this.currentChat) return;
                        
                        const chatId = [this.currentUser.id, this.currentChat.id].sort().join('_');
                        const messagesRef = ref(database, 'messages/' + chatId);
                        
                        const message = {
                            type: 'audio',
                            fileData: reader.result,
                            fileName: `voice_${Date.now()}.webm`,
                            fileSize: blob.size,
                            fileType: 'audio/webm',
                            duration: '0:24',
                            sender: this.currentUser.name,
                            senderId: this.currentUser.id,
                            receiverId: this.currentChat.id,
                            timestamp: Date.now()
                        };
                        
                        await push(messagesRef, message);
                    };
                    reader.readAsDataURL(blob);
                    
                    stream.getTracks().forEach(track => track.stop());
                    this.mediaRecorder = null;
                };
                
                this.mediaRecorder.start();
                btn.classList.add('recording');
                
            } catch (err) {
                alert('Mikrofon icazəsi verilmədi!');
            }
        } else {
            this.mediaRecorder.stop();
            btn.classList.remove('recording');
        }
    }

    async startVideoCall() {
        if (!this.currentChat) {
            alert('Zəhmət olmasa əvvəlcə bir istifadəçi seçin');
            return;
        }
        
        document.getElementById('callModal').classList.add('active');
        document.getElementById('callTitle').textContent = `Video Zəng - ${this.currentChat.name}`;
        
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;
            
            const callRef = ref(database, 'calls/' + this.currentChat.id);
            await set(callRef, {
                from: this.currentUser.id,
                fromName: this.currentUser.name,
                type: 'video',
                status: 'incoming',
                timestamp: serverTimestamp()
            });
            
            this.showActiveCall();
            
        } catch (err) {
            alert('Kamera/Mikrofon icazəsi verilmədi!');
            this.endCall();
        }
    }

    async startAudioCall() {
        if (!this.currentChat) {
            alert('Zəhmət olmasa əvvəlcə bir istifadəçi seçin');
            return;
        }
        
        document.getElementById('callModal').classList.add('active');
        document.getElementById('callTitle').textContent = `Səsli Zəng - ${this.currentChat.name}`;
        
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;
            
            const callRef = ref(database, 'calls/' + this.currentChat.id);
            await set(callRef, {
                from: this.currentUser.id,
                fromName: this.currentUser.name,
                type: 'audio',
                status: 'incoming',
                timestamp: serverTimestamp()
            });
            
            this.showActiveCall();
            
        } catch (err) {
            alert('Mikrofon icazəsi verilmədi!');
            this.endCall();
        }
    }

    handleIncomingCall(callData) {
        const accept = confirm(`${callData.fromName} sizə ${callData.type === 'video' ? 'video' : 'səsli'} zəng edir. Cavab verirsiniz?`);
        
        if (accept) {
            if (callData.type === 'video') {
                this.startVideoCall();
            } else {
                this.startAudioCall();
            }
            
            const callRef = ref(database, 'calls/' + this.currentUser.id);
            update(callRef, { status: 'accepted' });
        } else {
            const callRef = ref(database, 'calls/' + this.currentUser.id);
            update(callRef, { status: 'rejected' });
        }
    }

    showActiveCall() {
        document.getElementById('activeCallBox').classList.remove('hidden');
        document.getElementById('noCallMessage').classList.add('hidden');
        document.getElementById('callStatus').textContent = this.currentChat ? this.currentChat.name : 'Zəng';
        
        this.callStartTime = Date.now();
        this.callTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');
            document.getElementById('callDuration').textContent = `${mins}:${secs}`;
        }, 1000);
    }

    async shareScreen() {
        if (!this.currentChat) {
            alert('Zəhmət olmasa əvvəlcə bir istifadəçi seçin');
            return;
        }
        
        document.getElementById('callModal').classList.add('active');
        document.getElementById('callTitle').textContent = `Ekran Paylaşımı - ${this.currentChat.name}`;
        
        try {
            this.localStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            const localVideo = document.getElementById('localVideo');
            localVideo.srcObject = this.localStream;
            
            const callRef = ref(database, 'calls/' + this.currentChat.id);
            await set(callRef, {
                from: this.currentUser.id,
                fromName: this.currentUser.name,
                type: 'screen',
                status: 'incoming',
                timestamp: serverTimestamp()
            });
            
            this.showActiveCall();
            
        } catch (err) {
            alert('Ekran paylaşımı icazəsi verilmədi!');
            this.endCall();
        }
    }

    async endCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        
        if (this.callTimer) {
            clearInterval(this.callTimer);
            this.callTimer = null;
        }
        
        if (this.currentChat) {
            const callRef = ref(database, 'calls/' + this.currentChat.id);
            await set(callRef, {
                status: 'ended',
                endedAt: serverTimestamp()
            });
        }
        
        document.getElementById('callModal').classList.remove('active');
        document.getElementById('activeCallBox').classList.add('hidden');
        document.getElementById('noCallMessage').classList.remove('hidden');
        document.getElementById('callDuration').textContent = '00:00';
    }

    toggleVideo() {
        if (this.localStream) {
            const track = this.localStream.getVideoTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                const btn = document.getElementById('videoBtn');
                btn.style.background = track.enabled ? '#334155' : '#ef4444';
            }
        }
    }

    toggleAudio() {
        if (this.localStream) {
            const track = this.localStream.getAudioTracks()[0];
            if (track) {
                track.enabled = !track.enabled;
                const btn = document.getElementById('audioBtn');
                btn.style.background = track.enabled ? '#334155' : '#ef4444';
            }
        }
    }

    addToRecentFiles(message) {
        let recentFiles = JSON.parse(localStorage.getItem('azsoftware_recent_files') || '[]');
        recentFiles.unshift({
            name: message.fileName,
            size: message.fileSize,
            type: message.fileType,
            date: new Date().toISOString(),
            data: message.fileData
        });
        if (recentFiles.length > 10) recentFiles = recentFiles.slice(0, 10);
        localStorage.setItem('azsoftware_recent_files', JSON.stringify(recentFiles));
        this.loadRecentFiles();
    }

    loadRecentFiles() {
        const container = document.getElementById('recentFilesList');
        if (!container) return;
        
        const recentFiles = JSON.parse(localStorage.getItem('azsoftware_recent_files') || '[]');
        
        if (recentFiles.length === 0) {
            container.innerHTML = '<div class="text-center text-slate-400 text-sm py-4">Hələ fayl paylaşılmayıb</div>';
            return;
        }
        
        container.innerHTML = recentFiles.map(file => `
            <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-primary/10 cursor-pointer group">
                <div class="size-8 bg-primary/20 rounded flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all">
                    <span class="material-symbols-outlined text-[18px]">${this.getFileIcon(file.type)}</span>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="text-xs font-semibold truncate">${file.name}</p>
                    <p class="text-[10px] text-slate-400">${this.formatFileSize(file.size)}</p>
                </div>
            </div>
        `).join('');
    }

    loadAllFiles() {
        alert('Bütün fayllar Firebase Storage-da saxlanılır. Bu funksiya tezliklə əlavə ediləcək.');
    }

    async exportData() {
        try {
            const snapshot = await new Promise((resolve) => {
                const messagesRef = ref(database, 'messages');
                onValue(messagesRef, resolve, { onlyOnce: true });
            });
            
            const data = {
                user: this.currentUser,
                messages: snapshot.val(),
                exportDate: new Date().toISOString()
            };
            
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `azsoftware_backup_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            
            alert('Yedək faylı yükləndi!');
        } catch (error) {
            alert('Yedək alınmadı: ' + error.message);
        }
    }

    async logout() {
        const userRef = ref(database, 'users/' + this.currentUser.id);
        await update(userRef, {
            status: 'offline',
            lastSeen: serverTimestamp()
        });
        
        localStorage.removeItem('azsoftware_user');
        window.location.href = 'index.html';
    }
}

// Global app instance
window.app = new AZSoftwareApp();

document.addEventListener('DOMContentLoaded', () => {
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') window.app.sendMessage();
        });
    }
});