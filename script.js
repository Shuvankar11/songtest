// ==========================================
// 🔥 FIREBASE INITIALIZATION 🔥
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyCr88lb0doIqLsN4wObqUBIO5ILO84lg7Q",
    authDomain: "midnight-vibes.firebaseapp.com",
    databaseURL: "https://midnight-vibes-default-rtdb.firebaseio.com",
    projectId: "midnight-vibes",
    storageBucket: "midnight-vibes.firebasestorage.app",
    messagingSenderId: "792420257574",
    appId: "1:792420257574:web:1ceb9c6847fb0b523b3be7"
};

if(Object.keys(firebaseConfig).length > 0) {
    firebase.initializeApp(firebaseConfig);
}

const auth = window.firebase ? firebase.auth() : null;
const db = window.firebase ? firebase.firestore() : null;
let currentUser = null;
let globalHistory = [];

// ==========================================
// MUSIC PLAYER CORE
// ==========================================
const audio = document.getElementById('main-audio');
const seekSlider = document.getElementById('seek-slider');
const fullProgress = document.getElementById('full-progress');
const queueList = document.getElementById('queue-list');
const playlistView = document.getElementById('playlist-view');
const playlistList = document.getElementById('playlist-list');

// 🔥 UNIFIED QUEUE SYSTEM 🔥
const queues = { trending: [], suggested: [], playlist: [], search: [], liked: [], history: [] };
let currentQueue = [], currentIndex = 0; 

let isPlaying = false, canvasOn = false, isSeeking = false;
let searchTimeout;
let currentFetchId = 0; 
const fallbackImg = "logo.png";
let tempBase64Dp = "";

// ==========================================
// 🔥 BASS BOOST SYSTEM 🔥
// ==========================================
let audioCtx, bassFilter, sourceNode;
let isBassBoosted = false;

window.toggleBass = () => {
    try {
        if (!audioCtx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AudioContext();
            sourceNode = audioCtx.createMediaElementSource(audio);
            
            bassFilter = audioCtx.createBiquadFilter();
            bassFilter.type = "lowshelf";
            bassFilter.frequency.value = 80;
            bassFilter.gain.value = 0;

            sourceNode.connect(bassFilter);
            bassFilter.connect(audioCtx.destination);
        }

        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        isBassBoosted = !isBassBoosted;
        bassFilter.gain.value = isBassBoosted ? 8 : 0;

        const btn = document.getElementById('bass-btn');
        const icon = btn.querySelector('.material-symbols-outlined');
        
        if (isBassBoosted) {
            btn.classList.add('border-primary');
            icon.classList.add('text-primary');
            icon.classList.remove('text-on-surface-variant');
        } else {
            btn.classList.remove('border-primary');
            icon.classList.remove('text-primary');
            icon.classList.add('text-on-surface-variant');
        }
    } catch (e) {
        console.log("Bass Boost Error:", e);
    }
};

// ==========================================
// AUTH & DATABASE LOGIC
// ==========================================
if(auth) {
    auth.onAuthStateChanged(user => {
        currentUser = user;
        if(user) {
            db.collection('users').doc(user.uid).get().then(doc => {
                if(doc.exists) {
                    const data = doc.data();
                    document.getElementById('nav-default-dp').style.display = 'none';
                    const navDp = document.getElementById('nav-dp');
                    navDp.style.display = 'block';
                    navDp.src = data.dp || fallbackImg;
                    
                    document.getElementById('profile-name').innerText = data.name;
                    document.getElementById('profile-email').innerText = data.email;
                    document.getElementById('profile-gender').innerText = data.gender;
                    document.getElementById('profile-dp').src = data.dp || fallbackImg;

                    if(data.likes) { saveLikedSongs(data.likes); queues.liked = data.likes; }
                    if(data.history) { globalHistory = data.history; }
                    
                    if(data.lastPlayed && audio.src === '') restoreLastPlayedUI(data.lastPlayed);
                }
            });
        } else {
            document.getElementById('nav-default-dp').style.display = 'block';
            document.getElementById('nav-dp').style.display = 'none';
            const lastLocal = localStorage.getItem('mid_last_song');
            if(lastLocal && audio.src === '') restoreLastPlayedUI(JSON.parse(lastLocal));
        }
    });
} else {
    const lastLocal = localStorage.getItem('mid_last_song');
    if(lastLocal) restoreLastPlayedUI(JSON.parse(lastLocal));
}

function restoreLastPlayedUI(song) {
    currentQueue = [song]; currentIndex = 0;
    
    document.getElementById('mini-title').innerText = song.name;
    document.getElementById('mini-artist').innerText = song.artist;
    const mImg = document.getElementById('mini-img');
    mImg.style.display = 'block'; 
    mImg.src = song.img || fallbackImg;
    document.getElementById('mini-placeholder').style.display = 'none';
    
    document.getElementById('full-title').innerText = song.name;
    document.getElementById('full-artist').innerText = song.artist;
    document.getElementById('full-img').src = song.img || fallbackImg;
    
    audio.src = song.url;
    checkLikedStatus(song);

    setTimeout(() => { fetchSmartQueue(song); }, 500);
}

window.addEventListener('popstate', (e) => {
    document.getElementById('full-player').classList.remove('active');
    document.getElementById('full-player').style.transform = '';
    document.getElementById('auth-modal').style.display = 'none';
    document.getElementById('playlist-view').style.display = 'none';
    document.getElementById('history-view').style.display = 'none';

    if(e.state && e.state.overlay) {
        if(e.state.overlay === 'player') document.getElementById('full-player').classList.add('active');
        else if(e.state.overlay === 'auth') document.getElementById('auth-modal').style.display = 'flex';
        else if(e.state.overlay === 'playlist') document.getElementById('playlist-view').style.display = 'flex';
        else if(e.state.overlay === 'history') document.getElementById('history-view').style.display = 'flex';
    }
});

window.openAuthModal = () => {
    const modal = document.getElementById('auth-modal');
    modal.style.display = 'flex';
    history.pushState({overlay: 'auth'}, null, '#auth'); 
    if(currentUser) {
        document.getElementById('unauth-view').style.display = 'none'; document.getElementById('auth-logged-in').style.display = 'block';
    } else {
        document.getElementById('unauth-view').style.display = 'block'; document.getElementById('auth-logged-in').style.display = 'none';
    }
};
window.closeAuthModal = () => { document.getElementById('auth-modal').style.display = 'none'; if(location.hash === '#auth') history.back(); };

window.toggleAuthMode = (mode) => {
    if(mode === 'login') {
        document.getElementById('login-form').style.display = 'block'; document.getElementById('signup-form').style.display = 'none';
        document.getElementById('tab-login').classList.replace('border-transparent', 'border-primary'); document.getElementById('tab-login').classList.replace('text-on-surface-variant', 'text-primary');
        document.getElementById('tab-signup').classList.replace('border-primary', 'border-transparent'); document.getElementById('tab-signup').classList.replace('text-primary', 'text-on-surface-variant');
    } else {
        document.getElementById('login-form').style.display = 'none'; document.getElementById('signup-form').style.display = 'block';
        document.getElementById('tab-signup').classList.replace('border-transparent', 'border-primary'); document.getElementById('tab-signup').classList.replace('text-on-surface-variant', 'text-primary');
        document.getElementById('tab-login').classList.replace('border-primary', 'border-transparent'); document.getElementById('tab-login').classList.replace('text-primary', 'text-on-surface-variant');
    }
};

window.previewDp = (event) => {
    const file = event.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (e) => { tempBase64Dp = e.target.result; document.getElementById('signup-dp-preview').src = tempBase64Dp; document.getElementById('signup-dp-preview').style.display = 'block'; };
        reader.readAsDataURL(file);
    }
};

document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault(); if(!auth) return;
    const email = document.getElementById('signup-email').value; const pass = document.getElementById('signup-pass').value; const name = document.getElementById('signup-name').value; const gender = document.getElementById('signup-gender').value;
    try {
        const cred = await auth.createUserWithEmailAndPassword(email, pass);
        await db.collection('users').doc(cred.user.uid).set({ name: name, email: email, gender: gender, dp: tempBase64Dp, likes: [], history: [], lastPlayed: null });
        closeAuthModal(); alert("Account created successfully!");
    } catch(error) { alert(error.message); }
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault(); if(!auth) return;
    const email = document.getElementById('login-email').value; const pass = document.getElementById('login-pass').value;
    try { await auth.signInWithEmailAndPassword(email, pass); closeAuthModal(); } catch(error) { alert(error.message); }
});

window.logout = () => { auth.signOut(); closeAuthModal(); };
window.forgotPassword = () => { const email = document.getElementById('login-email').value; if(!email) return alert("Please enter your email first."); auth.sendPasswordResetEmail(email).then(() => alert("Reset link sent!")).catch(e => alert(e.message)); };
window.deleteAccount = () => { if(confirm("Are you sure you want to delete your account?")) { db.collection('users').doc(currentUser.uid).delete().then(() => { currentUser.delete().then(() => closeAuthModal()); }); } };

window.openHistoryView = () => {
    document.getElementById('auth-modal').style.display = 'none'; document.getElementById('history-view').style.display = 'flex'; history.pushState({overlay: 'history'}, null, '#history'); 
    const hList = document.getElementById('history-list'); queues.history = [...globalHistory].reverse();
    if(queues.history.length === 0) { hList.innerHTML = `<p class="text-center text-on-surface-variant py-10">No listening history found.</p>`; return; }
    hList.innerHTML = queues.history.map((s, i) => `
        <div onclick="loadAndPlay('history', ${i}, false)" class="flex items-center gap-4 glass-card p-3 rounded-xl cursor-pointer hover:bg-white/5 transition border border-transparent">
            <img src="${s.img}" onerror="this.onerror=null; this.src='${fallbackImg}'" class="w-14 h-14 rounded-lg object-cover">
            <div class="flex-1 overflow-hidden"><h4 class="text-sm font-bold truncate text-white">${s.name}</h4><p class="text-xs text-on-surface-variant truncate">${s.artist}</p></div>
            <span class="material-symbols-outlined text-primary">play_arrow</span>
        </div>
    `).join('');
};
window.closeHistoryView = () => { document.getElementById('history-view').style.display = 'none'; if(location.hash === '#history') history.back(); };

// ==========================================
// API FETCH & DASHBOARD INITIALIZATION
// ==========================================
// 🔥 EXPANDED CATEGORY QUERIES FOR TRUE RANDOMNESS 🔥
const categoryQueries = {
    'hindi': [
        'latest bollywood hits', 'top hindi romantic', '90s evergreen hindi', 'hindi party anthem', 
        'best of arijit singh', 'kumar sanu hits', 'bollywood lofi chill', 'hindi indie pop', 
        'viral hindi songs', '2000s bollywood hits', 'new hindi songs', 'classic bollywood', 
        'bollywood dance hits', 'udit narayan hits', 'shreya ghoshal romantic', 'sad emotional bollywood'
    ],
    'bengali': [
        'latest bengali hits', 'bengali romantic songs', 'rabindra sangeet classic', 'bengali folk', 
        'best of arijit singh bengali', 'bengali lofi', 'kolkata indie', 'bengali retro hits', 
        'jeets gan', 'dev bengali hits', 'shreya ghoshal bengali', 'anupam roy hits'
    ],
    'punjabi': [
        'latest punjabi pop', 'punjabi bhangra party', 'diljit dosanjh hits', 'ap dhillon', 
        'punjabi romantic', 'punjabi hip hop', 'old punjabi hits', 'punjabi workout', 
        'sidhu moose wala', 'karan aujla', 'hardy sandhu', 'punjabi sad hits'
    ],
    'english': [
        'billboard hot 100', 'latest english pop', 'classic rock 80s', 'english edm', 
        'viral tiktok songs english', 'chill pop english', '90s english hits', 'top english acoustic', 
        'justin bieber', 'taylor swift hits', 'the weeknd', 'lofi beats english'
    ]
};
let currentCategory = 'hindi';

function decode(str) { let txt = document.createElement('textarea'); txt.innerHTML = str || ''; return txt.value; }

function renderGrid(songs, targetId, queueName) {
    const grid = document.getElementById(targetId);
    grid.innerHTML = songs.slice(0, 16).map((s, i) => `
        <div onclick="loadAndPlay('${queueName}', ${i}, true)" class="glass-card p-3 rounded-2xl cursor-pointer hover:border-primary/50 transition-all duration-300 group border border-transparent hover:border-primary/20">
            <div class="relative w-full aspect-square mb-3 overflow-hidden rounded-xl">
                <img src="${s.img}" onerror="this.onerror=null; this.src='${fallbackImg}'" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                <div class="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div class="w-12 h-12 bg-primary rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(181,164,255,0.6)]">
                        <span class="material-symbols-outlined text-[#0c0d18] text-3xl" style="font-variation-settings: 'FILL' 1;">play_arrow</span>
                    </div>
                </div>
            </div>
            <h3 class="font-headline font-bold text-sm line-clamp-1 text-white">${s.name}</h3><p class="font-body text-[11px] text-on-surface-variant truncate mt-0.5">${s.artist}</p>
        </div>
    `).join('');
}

async function bootApp() {
    const grid = document.getElementById('trending-grid');
    grid.innerHTML = `
        <div class="col-span-full py-12 flex flex-col items-center justify-center gap-4">
            <span class="material-symbols-outlined animate-spin text-primary text-5xl">sync</span>
            <p class="text-sm font-bold text-primary animate-pulse">Waking up servers...</p>
            <p class="text-xs text-on-surface-variant">This may take up to 10 seconds on first load.</p>
        </div>`;
    await refreshTrending();
    loadSuggestedSection();
}

document.addEventListener("DOMContentLoaded", bootApp);

async function fetchAPI(query, limit = 40) {
    let q = query.replace(/original/gi, '').trim(); if(!q) return [];
    const apis = [ 
        `https://saavn.me/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`, 
        `https://saavn.dev/api/search/songs?query=${encodeURIComponent(q)}&limit=${limit}`, 
        `https://jiosaavn-api-privatecvc2.vercel.app/search/songs?query=${encodeURIComponent(q)}&limit=${limit}` 
    ];
    
    const fetchWithTimeout = (url, ms) => Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms))
    ]);

    for (let url of apis) {
        try {
            const res = await fetchWithTimeout(url, 15000); 
            if (!res.ok) continue; 
            const json = await res.json(); 
            let results = json.data?.results || json.data || json.results;
            if (results && results.length > 0) {
                let rawSongs = results.map(s => {
                    let img = s.image && Array.isArray(s.image) ? s.image[s.image.length-1]?.url || s.image[s.image.length-1]?.link : fallbackImg; if(typeof s.image === 'string') img = s.image;
                    let mediaUrl = s.downloadUrl && Array.isArray(s.downloadUrl) ? s.downloadUrl[s.downloadUrl.length-1]?.url || s.downloadUrl[s.downloadUrl.length-1]?.link : s.media_url || s.url;
                    return {
                        name: decode(s.name || s.title || 'Unknown'), artist: decode(s.artists?.primary?.[0]?.name || s.primaryArtists || 'Artist'),
                        img: (img || fallbackImg).replace('http://', 'https://').replace('150x150', '500x500'), url: (mediaUrl || '').replace('http://', 'https://'), language: (s.language || '').toLowerCase() 
                    };
                }).filter(s => s.url);
                let uniqueSongs = []; let names = new Set();
                for(let s of rawSongs) { let baseName = s.name.toLowerCase().replace(/\[.*?\]|\(.*?\)/g, "").split('-')[0].trim(); if(!names.has(baseName)) { names.add(baseName); uniqueSongs.push(s); } }
                if(uniqueSongs.length > 0) return uniqueSongs.sort(() => Math.random() - 0.5); 
            }
        } catch(e) {
            console.log("API taking too long, trying next...");
        }
    }
    return [];
}

async function fetchSection(query, targetId) {
    let myFetchId = ++currentFetchId; const grid = document.getElementById(targetId);
    let songs = await fetchAPI(query, 30);
    
    if (songs.length === 0) {
        songs = await fetchAPI(query, 30);
    }

    if (myFetchId !== currentFetchId) return; 
    
    if(songs.length > 0) { 
        queues.trending = songs; renderGrid(queues.trending, targetId, 'trending'); 
    } else {
        grid.innerHTML = `<div class="col-span-full text-center py-10 flex flex-col items-center"><p class="text-on-surface-variant mb-4 font-bold">Servers are still waking up.</p><button onclick="refreshTrending()" class="px-5 py-2.5 bg-primary text-[#0c0d18] rounded-full text-sm font-bold shadow-lg hover:scale-95 transition">Try Again Now</button></div>`;
    }
}

window.setCategory = (btn, cat) => {
    currentCategory = cat; document.querySelectorAll('.lang-btn').forEach(b => { b.classList.remove('bg-primary', 'text-[#0c0d18]'); b.classList.add('bg-surface-container', 'text-on-surface'); });
    btn.classList.remove('bg-surface-container', 'text-on-surface'); btn.classList.add('bg-primary', 'text-[#0c0d18]'); refreshTrending();
}

window.refreshTrending = async () => { 
    document.getElementById('trending-grid').innerHTML = `<div class="col-span-full py-10 flex justify-center"><span class="material-symbols-outlined animate-spin text-primary text-4xl">sync</span></div>`;
    let randomQuery = categoryQueries[currentCategory][Math.floor(Math.random() * categoryQueries[currentCategory].length)];
    await fetchSection(randomQuery, 'trending-grid'); 
}

async function loadSuggestedSection() {
    const lastArtist = localStorage.getItem('mid_last_artist');
    if (lastArtist && lastArtist !== 'Unknown' && lastArtist !== 'Artist') {
        let songs = await fetchAPI(lastArtist + " hits", 15);
        if(songs.length === 0) songs = await fetchAPI(lastArtist + " hits", 15);
        if (songs.length > 0) {
            document.getElementById('suggested-section').style.display = 'block'; queues.suggested = songs; 
            document.getElementById('suggested-grid').innerHTML = queues.suggested.slice(0, 6).map((s, i) => `
                <div onclick="loadAndPlay('suggested', ${i}, true)" class="w-36 min-w-[144px] glass-card p-3 rounded-2xl cursor-pointer hover:border-tertiary/30 transition shrink-0 group">
                    <img src="${s.img}" onerror="this.onerror=null; this.src='${fallbackImg}'" class="w-full aspect-square rounded-xl object-cover mb-2 group-hover:scale-105 transition-transform">
                    <h4 class="font-headline font-bold text-sm text-white truncate">${s.name}</h4><p class="font-body text-[10px] text-on-surface-variant truncate">${s.artist}</p>
                </div>
            `).join('');
        }
    }
}

async function openPlaylistView(title, query) {
    document.getElementById('playlist-title').innerText = title; playlistView.style.display = 'flex'; history.pushState({overlay: 'playlist'}, null, '#playlist'); 
    playlistList.innerHTML = `<p class="text-center text-primary animate-pulse py-10">Loading Playlist...</p>`; 
    let songs = await fetchAPI(query, 30);
    if(songs.length === 0) songs = await fetchAPI(query, 30); 
    if(songs.length > 0) {
        queues.playlist = songs;
        playlistList.innerHTML = queues.playlist.map((s, i) => `
            <div onclick="loadAndPlay('playlist', ${i}, false)" class="flex items-center gap-4 glass-card p-3 rounded-xl cursor-pointer hover:bg-white/5 transition border border-transparent hover:border-primary/30">
                <img src="${s.img}" onerror="this.onerror=null; this.src='${fallbackImg}'" class="w-14 h-14 rounded-lg object-cover">
                <div class="flex-1 overflow-hidden"><h4 class="text-sm font-bold truncate text-white">${s.name}</h4><p class="text-xs text-on-surface-variant truncate mt-0.5">${s.artist}</p></div>
                <span class="material-symbols-outlined text-primary">play_arrow</span>
            </div>
        `).join('');
    } else {
        playlistList.innerHTML = `<p class="text-center text-on-surface-variant py-10">Failed to load playlist. Please go back and try again.</p>`;
    }
}
window.closePlaylistView = () => { playlistView.style.display = 'none'; if(location.hash === '#playlist') history.back(); }

function getLikedSongs() { return JSON.parse(localStorage.getItem('mid_liked')) || []; }
function saveLikedSongs(songs) { localStorage.setItem('mid_liked', JSON.stringify(songs)); if(currentUser && db) { db.collection('users').doc(currentUser.uid).update({ likes: songs }); } }

window.openLikedSongs = () => {
    const liked = getLikedSongs(); document.getElementById('playlist-title').innerText = "❤️ Your Liked Songs"; playlistView.style.display = 'flex'; history.pushState({overlay: 'playlist'}, null, '#playlist'); 
    if(liked.length === 0) { playlistList.innerHTML = `<p class="text-center text-on-surface-variant py-10">No liked songs.</p>`; return; }
    queues.liked = liked; 
    playlistList.innerHTML = queues.liked.map((s, i) => `
        <div onclick="loadAndPlay('liked', ${i}, false)" class="flex items-center gap-4 glass-card p-3 rounded-xl cursor-pointer hover:bg-white/5 transition border border-transparent hover:border-tertiary/30">
            <img src="${s.img}" onerror="this.onerror=null; this.src='${fallbackImg}'" class="w-14 h-14 rounded-lg object-cover">
            <div class="flex-1 overflow-hidden"><h4 class="text-sm font-bold truncate text-white">${s.name}</h4><p class="text-xs text-tertiary truncate mt-0.5">Liked</p></div>
            <span class="material-symbols-outlined text-tertiary">play_arrow</span>
        </div>
    `).join('');
};

window.toggleLike = () => {
    if(!currentQueue[currentIndex]) return; const song = currentQueue[currentIndex]; let liked = getLikedSongs(); const exists = liked.findIndex(s => s.url === song.url);
    if(exists > -1) liked.splice(exists, 1); else liked.unshift(song); saveLikedSongs(liked); checkLikedStatus(song);
};
function checkLikedStatus(song) {
    if(!song) return; const liked = getLikedSongs().some(s => s.url === song.url); const icon = document.getElementById('like-icon'); icon.innerText = 'favorite';
    if(liked) { icon.classList.add('text-tertiary'); icon.style.fontVariationSettings = "'FILL' 1"; } else { icon.classList.remove('text-tertiary'); icon.style.fontVariationSettings = "'FILL' 0"; }
}

// 🔥 SMART SEARCH SYSTEM 🔥
window.handleLiveSearch = (val) => {
    const clearBtn = document.getElementById('clear-search'); const container = document.getElementById('search-results-container'); const dash = document.getElementById('main-dashboard');
    clearBtn.style.display = val.trim() ? 'block' : 'none'; if(!val.trim()) { container.style.display = 'none'; dash.style.display = 'block'; return; }
    container.style.display = 'block'; dash.style.display = 'none'; document.getElementById('live-search-grid').innerHTML = `<p class="text-center text-primary animate-pulse py-10">Searching...</p>`;
    
    clearTimeout(searchTimeout); searchTimeout = setTimeout(async () => {
        let query = val.trim();
        let lowerQ = query.toLowerCase();
        
        // Map generic inputs to high quality API keywords
        const smartMap = {
            'old songs': '90s evergreen bollywood hits',
            'old hindi songs': '90s evergreen bollywood hits',
            '90s songs': '90s evergreen bollywood hits',
            '80s songs': '80s classic bollywood',
            'new songs': 'latest trending hits',
            'latest songs': 'latest trending hits',
            'top songs': 'top bollywood hits',
            'top hindi songs': 'top bollywood hits',
            'trending songs': 'viral trending hits',
            'trending': 'viral trending hits',
            'love songs': 'top romantic hits',
            'romantic songs': 'top romantic hits',
            'sad songs': 'sad emotional bollywood',
            'party songs': 'party anthem hits',
            'workout songs': 'gym workout motivational',
            'bhakti songs': 'top devotional bhajan',
            'lofi': 'bollywood lofi chill'
        };

        if(smartMap[lowerQ]) {
            query = smartMap[lowerQ];
        } else {
            if (lowerQ.includes('old songs')) query = lowerQ.replace('old songs', '90s evergreen hits');
            else if (lowerQ.includes('top songs')) query = lowerQ.replace('top songs', 'top hits');
            else if (lowerQ.includes('trending songs')) query = lowerQ.replace('trending songs', 'viral hits');
        }

        const songs = await fetchAPI(query, 30); 
        const rGrid = document.getElementById('live-search-grid');
        
        if(songs.length > 0) {
            queues.search = songs; 
            rGrid.innerHTML = queues.search.map((s, i) => `
                <div onclick="loadAndPlay('search', ${i}, true)" class="flex items-center gap-4 glass-card p-3 rounded-xl cursor-pointer hover:bg-white/5 transition">
                    <img src="${s.img}" onerror="this.onerror=null; this.src='${fallbackImg}'" class="w-14 h-14 rounded-lg object-cover shadow-md shrink-0">
                    <div class="flex-1 overflow-hidden"><h4 class="text-sm font-bold truncate text-white">${s.name}</h4><p class="text-xs text-on-surface-variant truncate">${s.artist}</p></div>
                    <span class="material-symbols-outlined text-primary">play_arrow</span>
                </div>
            `).join('');
        } else { 
            rGrid.innerHTML = `<p class="text-center text-on-surface-variant py-10">No songs found for "${val}". Try another keyword.</p>`; 
        }
    }, 600); 
}
window.clearSearch = () => { document.getElementById('search-input').value = ''; handleLiveSearch(''); }

async function fetchSmartQueue(song) {
    const btn = document.getElementById('load-more-btn');
    if(btn) btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[18px]">sync</span> Fetching...`;
    else queueList.innerHTML = `<p class="text-xs text-primary animate-pulse">Analyzing vibe...</p>`;

    let lang = (song.language && song.language !== 'unknown') ? song.language : currentCategory;
    let baseTitle = song.name.replace(/\[.*?\]|\(.*?\)/g, "").split('-')[0].trim().toLowerCase();

    let artistsList = song.artist ? song.artist.split(',').map(a => a.trim()) : [];
    let primaryArtist = artistsList[0] || '';
    let secondaryArtist = artistsList.length > 1 ? artistsList[1] : '';

    let queriesToTry = [];
    if (primaryArtist) queriesToTry.push(`${primaryArtist} hits`);
    if (secondaryArtist) queriesToTry.push(`${secondaryArtist} hits`);
    if (primaryArtist) queriesToTry.push(`${primaryArtist} best of`);
    queriesToTry.push(`top ${lang} hits`); 

    let newSongs = [];
    let remixSongs = []; 

    for (let q of queriesToTry) {
        if (newSongs.length >= 15) break; 

        let songs = await fetchAPI(q, 30);

        songs.forEach(s => {
            let sBaseTitle = s.name.replace(/\[.*?\]|\(.*?\)/g, "").split('-')[0].trim().toLowerCase();
            
            let isExactDuplicate = currentQueue.some(cq => cq.url === s.url) || 
                                   newSongs.some(ns => ns.url === s.url) || 
                                   remixSongs.some(rs => rs.url === s.url);
            
            if (!isExactDuplicate && s.name.toLowerCase().trim() !== song.name.toLowerCase().trim()) {
                if (sBaseTitle === baseTitle) {
                    remixSongs.push(s); 
                } else {
                    newSongs.push(s);
                }
            }
        });
    }

    if (newSongs.length > 0 || remixSongs.length > 0) {
        newSongs = newSongs.sort(() => Math.random() - 0.5);
        remixSongs = remixSongs.sort(() => Math.random() - 0.5).slice(0, 3);
        currentQueue.push(...newSongs.slice(0, 12), ...remixSongs);
    }
    
    renderUpNextUI(); 
}

function renderUpNextUI() {
    if(currentQueue.length > 0) {
        let html = currentQueue.map((sq, i) => {
            let isPlaying = (i === currentIndex);
            let titleColor = isPlaying ? 'text-primary' : 'text-white';
            let bgClass = isPlaying ? 'bg-white/5 border border-primary/20' : 'hover:bg-white/5 border border-transparent';
            let opacityClass = i < currentIndex ? 'opacity-50' : 'opacity-100';
            
            return `
            <div id="queue-item-${i}" onclick="playFromUpNext(${i})" class="flex items-center gap-3 p-2 rounded-xl cursor-pointer transition ${bgClass} ${opacityClass}">
                <img src="${sq.img}" onerror="this.onerror=null; this.src='${fallbackImg}'" class="w-12 h-12 rounded-lg object-cover shadow-md shrink-0"/>
                <div class="overflow-hidden flex-1"><h4 class="text-sm font-bold ${titleColor} truncate">${sq.name}</h4><p class="text-xs text-on-surface-variant truncate">${sq.artist}</p></div>
                ${isPlaying ? '<span class="material-symbols-outlined text-primary text-[18px]">equalizer</span>' : ''}
            </div>`;
        }).join('');
        
        html += `
            <button id="load-more-btn" onclick="loadMoreUpNext()" class="w-full py-3 mt-2 rounded-xl border border-white/5 bg-white/5 text-xs font-bold text-on-surface-variant hover:bg-white/10 hover:text-white transition flex items-center justify-center gap-2">
                <span class="material-symbols-outlined text-[18px]">expand_more</span> Load More
            </button>
        `;
        queueList.innerHTML = html;
    } else { 
        queueList.innerHTML = `<p class="text-xs text-on-surface-variant animate-pulse">Fetching more vibes...</p>`; 
    }
}

window.loadMoreUpNext = async () => {
    let baseSong = currentQueue[currentIndex];
    await fetchSmartQueue(baseSong); 
};

window.playFromUpNext = (index) => { 
    if (index === currentIndex) return; 
    let clickedSong = currentQueue.splice(index, 1)[0];
    if (index > currentIndex) {
        currentQueue.splice(currentIndex + 1, 0, clickedSong);
        currentIndex++;
    } else {
        currentIndex--;
        currentQueue.splice(currentIndex + 1, 0, clickedSong);
        currentIndex++;
    }
    loadAndPlay(null, currentIndex, false); 
}

window.loadAndPlay = (queueContext, index, fromUser = false) => {
    if (queueContext && queues[queueContext]) {
        if (queueContext === 'trending' || queueContext === 'suggested' || queueContext === 'search') {
            currentQueue = [queues[queueContext][index]]; 
            currentIndex = 0; 
        } else {
            currentQueue = [...queues[queueContext]];
            currentIndex = index;
        }
    } else if (queueContext === null) {
        currentIndex = index;
    }

    const song = currentQueue[currentIndex]; 
    if(!song) return;

    document.getElementById('seek-slider').value = 0; document.getElementById('full-progress').style.width = '0%';
    document.getElementById('mini-progress').style.width = '0%'; document.getElementById('curr-time').innerText = '0:00'; document.getElementById('total-time').innerText = '0:00';
    document.getElementById('mini-title').innerText = document.getElementById('full-title').innerText = song.name;
    document.getElementById('mini-artist').innerText = document.getElementById('full-artist').innerText = song.artist;
    const mImg = document.getElementById('mini-img'); mImg.style.display = 'block'; mImg.src = document.getElementById('full-img').src = song.img || fallbackImg;
    document.getElementById('mini-placeholder').style.display = 'none';

    localStorage.setItem('mid_last_song', JSON.stringify(song));
    if(currentUser && db && window.firebase) {
        const uniqueHistory = globalHistory.filter(s => s.url !== song.url); uniqueHistory.push(song); if(uniqueHistory.length > 50) uniqueHistory.shift(); 
        globalHistory = uniqueHistory; db.collection('users').doc(currentUser.uid).update({ lastPlayed: song, history: globalHistory });
    }

    audio.src = song.url;
    const playPromise = audio.play();
    if (playPromise !== undefined) { playPromise.then(_ => { isPlaying = true; updatePlayIcons(); }).catch(e => { isPlaying = false; updatePlayIcons(); }); }

    checkLikedStatus(song);
    if (window.MusicControls) setupMediaSession(song);
    
    renderUpNextUI();
    
    if(fromUser) { 
        localStorage.setItem('mid_last_artist', song.artist.split(',')[0]); 
        setTimeout(() => { fetchSmartQueue(song); }, 500); 
    } 
    else { 
        if(currentQueue.length - currentIndex < 5) setTimeout(() => { fetchSmartQueue(song); }, 500); 
    }

    if(canvasOn) document.getElementById('canvas-video').play();
};

window.togglePlay = () => { if (!audio.src) return; isPlaying ? audio.pause() : audio.play(); }

window.playNext = async () => { 
    if (currentIndex < currentQueue.length - 1) {
        currentIndex++;
        loadAndPlay(null, currentIndex, false); 
    } else { 
        let btn = document.getElementById('load-more-btn');
        if(btn) btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[18px]">sync</span> Loading Next...`;
        await fetchSmartQueue(currentQueue[currentIndex]);
        if (currentIndex < currentQueue.length - 1) {
            currentIndex++;
        } else {
            currentIndex = 0;
        }
        loadAndPlay(null, currentIndex, false); 
    } 
}

window.playPrevious = () => { 
    currentIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length; 
    loadAndPlay(null, currentIndex, false); 
}

function updatePlayIcons() { 
    document.getElementById('mini-play-icon').innerText = isPlaying ? 'pause' : 'play_arrow'; 
    document.getElementById('full-play-icon').innerText = isPlaying ? 'pause' : 'play_arrow'; 
    if (window.MusicControls) window.MusicControls.updateIsPlaying(isPlaying);
}

// ==========================================
// 🔥 AUDIO TIME UPDATE & SEEKING 🔥
// ==========================================
function updateOSPlayerPosition() {
    if (!audio.duration || isNaN(audio.duration) || audio.duration === Infinity) return;
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.setPositionState({
                duration: audio.duration, playbackRate: audio.playbackRate || 1, position: audio.currentTime
            });
        } catch (e) {}
    }
}

audio.addEventListener('loadedmetadata', () => { 
    document.getElementById('total-time').innerText = formatTime(audio.duration); 
    if ('mediaSession' in navigator && !window.MusicControls) setupMediaSession(currentQueue[currentIndex]);
    updateOSPlayerPosition(); 
});

audio.addEventListener('canplay', () => { document.getElementById('total-time').innerText = formatTime(audio.duration); });
audio.onplaying = () => { isPlaying = true; updatePlayIcons(); updateOSPlayerPosition(); }; 
audio.onpause = () => { isPlaying = false; updatePlayIcons(); updateOSPlayerPosition(); };

seekSlider.addEventListener('input', (e) => { isSeeking = true; fullProgress.style.width = `${e.target.value}%`; });
seekSlider.addEventListener('change', (e) => { 
    if(audio.duration) audio.currentTime = (e.target.value / 100) * audio.duration; 
    isSeeking = false; 
    updateOSPlayerPosition();
});

audio.addEventListener('timeupdate', () => {
    if(audio.duration && !isNaN(audio.duration)) {
        const pctTime = (audio.currentTime / audio.duration) * 100;
        if(!isSeeking) { seekSlider.value = pctTime; fullProgress.style.width = `${pctTime}%`; }
        document.getElementById('mini-progress').style.width = `${pctTime}%`;
        document.getElementById('curr-time').innerText = formatTime(audio.currentTime);
    }
});

audio.addEventListener('ended', playNext);
function formatTime(s) { if(isNaN(s)) return "0:00"; let m = Math.floor(s/60), sec = Math.floor(s%60); return `${m}:${sec < 10 ? '0'+sec : sec}`; }

// ==========================================
// 🔥 NATIVE & WEB MEDIA SESSION 🔥
// ==========================================
function setupMediaSession(song) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({ title: song.name, artist: song.artist, artwork: [{ src: song.img || fallbackImg, sizes: '500x500', type: 'image/jpeg' }] });
        navigator.mediaSession.setActionHandler('play', togglePlay); navigator.mediaSession.setActionHandler('pause', togglePlay);
        navigator.mediaSession.setActionHandler('previoustrack', playPrevious); navigator.mediaSession.setActionHandler('nexttrack', playNext);
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (audio.duration) { audio.currentTime = details.seekTime; updateOSPlayerPosition(); }
        });
    }

    if (window.MusicControls) {
        window.MusicControls.create({
            track       : song.name,
            artist      : song.artist,
            cover       : song.img || fallbackImg,
            isPlaying   : true,
            dismissable : false,
            hasPrev     : true,
            hasNext     : true,
            hasClose    : true,
            ticker      : 'Now playing ' + song.name,
            playIcon    : 'media_play',
            pauseIcon   : 'media_pause',
            prevIcon    : 'media_prev',
            nextIcon    : 'media_next',
            closeIcon   : 'media_close',
            notificationIcon: 'icon'
        }, () => {}, () => {});

        window.MusicControls.subscribe((action) => {
            const message = JSON.parse(action).message;
            switch(message) {
                case 'music-controls-next': playNext(); break;
                case 'music-controls-previous': playPrevious(); break;
                case 'music-controls-pause': togglePlay(); break;
                case 'music-controls-play': togglePlay(); break;
                case 'music-controls-destroy': closeFullPlayer(); audio.pause(); break;
            }
        });
        window.MusicControls.listen();
        window.MusicControls.updateIsPlaying(isPlaying);
    }
}

const playerEl = document.getElementById('full-player');
const swipeArea = document.getElementById('player-swipe-area');
window.openFullPlayer = () => { if(audio.src && audio.src !== location.href) { playerEl.classList.add('active'); history.pushState({overlay: 'player'}, null, '#player'); } };
window.closeFullPlayer = () => { playerEl.classList.remove('active'); playerEl.style.transform = ''; if(location.hash === '#player') history.back(); }

let startY = 0, currentY = 0, isDragging = false;
swipeArea.addEventListener('touchstart', e => { startY = e.touches[0].clientY; isDragging = true; playerEl.style.transition = 'none'; }, {passive: true});
swipeArea.addEventListener('touchmove', e => { if(!isDragging) return; currentY = e.touches[0].clientY; let diff = currentY - startY; if(diff > 0) playerEl.style.transform = `translateY(${diff}px)`; }, {passive: true});
swipeArea.addEventListener('touchend', () => { isDragging = false; playerEl.style.transition = 'transform 0.35s cubic-bezier(0.33, 1, 0.68, 1)'; if(currentY - startY > 120) closeFullPlayer(); else playerEl.style.transform = 'translateY(0)'; });

window.toggleCanvas = () => { canvasOn = !canvasOn; playerEl.classList.toggle('canvas-on', canvasOn); const vid = document.getElementById('canvas-video'); const btn = document.getElementById('canvas-btn'); canvasOn ? vid.play() : vid.pause(); btn.classList.toggle('text-primary', canvasOn); btn.classList.toggle('text-on-surface-variant', !canvasOn); };

document.addEventListener('deviceready', () => {
    document.addEventListener('backbutton', (e) => {
        e.preventDefault();
        const fPlayer = document.getElementById('full-player'); const aModal = document.getElementById('auth-modal'); const hView = document.getElementById('history-view'); const pView = document.getElementById('playlist-view');
        if (fPlayer.classList.contains('active')) closeFullPlayer();
        else if (aModal.style.display === 'flex') closeAuthModal();
        else if (hView.style.display === 'flex') closeHistoryView();
        else if (pView.style.display === 'flex') closePlaylistView();
        else { if (window.Capacitor && window.Capacitor.Plugins.App) window.Capacitor.Plugins.App.minimizeApp(); else if (navigator.app) navigator.app.exitApp(); }
    }, false);
}, false);
