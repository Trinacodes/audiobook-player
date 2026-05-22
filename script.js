// Audiobook Player - Fixed version with better continuity

document.addEventListener('DOMContentLoaded', function() {
    
    // DOM elements
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const loadingDiv = document.getElementById('loadingMessage');
    const bookListDiv = document.getElementById('bookList');
    const playerDiv = document.getElementById('player');
    const bookTitle = document.getElementById('bookTitle');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const playBtn = document.getElementById('playBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const stopBtn = document.getElementById('stopBtn');
    const backwardBtn = document.getElementById('backwardBtn');
    const forwardBtn = document.getElementById('forwardBtn');
    const closePlayerBtn = document.getElementById('closePlayer');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const clearBooksBtn = document.getElementById('clearBooksBtn');
    const refreshBooksBtn = document.getElementById('refreshBooksBtn');
    const voiceMaleBtn = document.getElementById('voiceMaleBtn');
    const voiceFemaleBtn = document.getElementById('voiceFemaleBtn');
    
    // App state
    let books = [];
    let currentBook = null;
    let currentChunkIndex = 0;
    let currentPositionInChunk = 0; // Track position within current chunk
    let isPlaying = false;
    let isPaused = false;
    let currentSpeed = 1;
    let currentUtterance = null;
    let currentVoice = null;
    let preferredGender = 'male';
    let currentChunkText = '';
    
    // Auto-resume when page becomes visible again
    let wasPlayingBeforeHidden = false;
    
    // Dark Mode
    function initDarkMode() {
        const savedMode = localStorage.getItem('darkMode');
        if (savedMode === 'enabled') {
            document.body.classList.add('dark-mode');
            if (darkModeToggle) darkModeToggle.textContent = '☀️ Light Mode';
        }
    }
    
    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
        if (darkModeToggle) darkModeToggle.textContent = isDark ? '☀️ Light Mode' : '🌙 Dark Mode';
    }
    
    if (darkModeToggle) darkModeToggle.addEventListener('click', toggleDarkMode);
    initDarkMode();
    
    // Handle page visibility (tab switching)
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            // Tab became hidden - remember if we were playing
            wasPlayingBeforeHidden = isPlaying && !isPaused;
            if (wasPlayingBeforeHidden) {
                // Speech will stop automatically, just remember state
                console.log('Tab hidden, speech will pause');
            }
        } else {
            // Tab became visible again
            if (wasPlayingBeforeHidden && currentBook) {
                console.log('Tab visible, resuming playback...');
                // Small delay to let browser recover
                setTimeout(() => {
                    if (currentBook && wasPlayingBeforeHidden) {
                        resumeFromCurrentPosition();
                    }
                }, 100);
            }
        }
    });
    
    // Handle page focus (after notifications, etc.)
    window.addEventListener('focus', function() {
        if (wasPlayingBeforeHidden && currentBook && !isPlaying) {
            console.log('Page focused, resuming...');
            setTimeout(() => {
                resumeFromCurrentPosition();
            }, 100);
        }
    });
    
    // Resume from exact position
    function resumeFromCurrentPosition() {
        if (!currentBook) return;
        
        // Cancel any ongoing speech
        if (currentUtterance) {
            window.speechSynthesis.cancel();
        }
        
        // Get the current chunk
        const chunk = currentBook.chunks[currentChunkIndex];
        if (!chunk) return;
        
        // If we have a position marker, start from there
        let textToSpeak = chunk;
        if (currentPositionInChunk > 0 && currentPositionInChunk < chunk.length) {
            textToSpeak = chunk.substring(currentPositionInChunk);
            console.log(`Resuming at position ${currentPositionInChunk}/${chunk.length}`);
        }
        
        speakText(textToSpeak, true);
        isPlaying = true;
        isPaused = false;
        wasPlayingBeforeHidden = false;
    }
    
    // Speak text with position tracking
    function speakText(text, isResume = false) {
        if (!text || text.trim().length === 0) {
            nextChunk();
            return;
        }
        
        currentChunkText = text;
        
        currentUtterance = new SpeechSynthesisUtterance(text);
        if (currentVoice) {
            currentUtterance.voice = currentVoice;
        }
        currentUtterance.rate = currentSpeed;
        currentUtterance.lang = 'en-US';
        
        // Track progress within the chunk
        let lastCharIndex = 0;
        currentUtterance.onboundary = (event) => {
            if (event.name === 'word' || event.name === 'sentence') {
                // Update position based on character index
                lastCharIndex = event.charIndex;
                currentPositionInChunk = lastCharIndex;
                
                // Save position periodically
                if (currentBook) {
                    localStorage.setItem(`book_pos_${currentBook.id}`, JSON.stringify({
                        chunkIndex: currentChunkIndex,
                        position: currentPositionInChunk
                    }));
                }
            }
        };
        
        currentUtterance.onend = () => {
            if (isPlaying && !isPaused) {
                // Finished current chunk, move to next
                currentPositionInChunk = 0;
                nextChunk();
            }
        };
        
        currentUtterance.onerror = (e) => {
            console.error('Speech error:', e);
            if (e.error === 'interrupted' || e.error === 'canceled') {
                // This is expected when pausing, don't treat as error
                return;
            }
            isPlaying = false;
        };
        
        window.speechSynthesis.speak(currentUtterance);
    }
    
    function nextChunk() {
        if (!currentBook) return;
        
        currentChunkIndex++;
        currentPositionInChunk = 0;
        
        if (currentChunkIndex >= currentBook.chunks.length) {
            // Book finished
            stopPlayback();
            alert('🎉 Finished reading the book!');
            return;
        }
        
        currentBook.currentChunk = currentChunkIndex;
        saveBooks();
        updateProgress();
        
        // Speak next chunk
        const nextText = currentBook.chunks[currentChunkIndex];
        speakText(nextText);
    }
    
    function previousChunk() {
        if (!currentBook) return;
        
        currentChunkIndex = Math.max(0, currentChunkIndex - 1);
        currentPositionInChunk = 0;
        currentBook.currentChunk = currentChunkIndex;
        saveBooks();
        updateProgress();
        
        // Cancel current and start previous chunk
        if (currentUtterance) {
            window.speechSynthesis.cancel();
        }
        speakText(currentBook.chunks[currentChunkIndex]);
    }
    
    // Improved pause that preserves position
    function pause() {
        if (isPlaying && !isPaused && currentUtterance) {
            window.speechSynthesis.pause();
            isPaused = true;
            isPlaying = false;
            console.log('Paused at position:', currentPositionInChunk);
        }
    }
    
    // Improved play that resumes from exact position
    function play() {
        if (!currentBook) {
            alert('Select a book first');
            return;
        }
        
        // Check if speech is paused
        if (isPaused && currentUtterance) {
            window.speechSynthesis.resume();
            isPlaying = true;
            isPaused = false;
            return;
        }
        
        // If we have a saved position, resume from there
        if (currentBook && currentPositionInChunk > 0) {
            resumeFromCurrentPosition();
            return;
        }
        
        // Start from current chunk beginning
        if (currentBook && currentBook.chunks[currentChunkIndex]) {
            if (currentUtterance) {
                window.speechSynthesis.cancel();
            }
            speakText(currentBook.chunks[currentChunkIndex]);
            isPlaying = true;
            isPaused = false;
        }
    }
    
    // Stop and reset position
    function stopPlayback() {
        if (currentUtterance) {
            window.speechSynthesis.cancel();
        }
        isPlaying = false;
        isPaused = false;
        wasPlayingBeforeHidden = false;
        
        // Don't reset position, keep it
        if (currentBook) {
            saveBooks();
        }
    }
    
    // Seek backward (~10 seconds of text)
    function backward() {
        if (!currentBook) return;
        
        const wasPlaying = isPlaying && !isPaused;
        
        if (currentUtterance) {
            window.speechSynthesis.cancel();
        }
        
        // Move back roughly 200 characters (~10 seconds of speech)
        const seekAmount = 300;
        let newPosition = currentPositionInChunk - seekAmount;
        
        if (newPosition <= 0) {
            // Go to previous chunk
            if (currentChunkIndex > 0) {
                currentChunkIndex--;
                currentPositionInChunk = currentBook.chunks[currentChunkIndex].length - seekAmount;
                if (currentPositionInChunk < 0) currentPositionInChunk = 0;
            } else {
                currentPositionInChunk = 0;
            }
        } else {
            currentPositionInChunk = newPosition;
        }
        
        currentBook.currentChunk = currentChunkIndex;
        saveBooks();
        updateProgress();
        
        if (wasPlaying) {
            resumeFromCurrentPosition();
        }
    }
    
    // Seek forward (~10 seconds of text)
    function forward() {
        if (!currentBook) return;
        
        const wasPlaying = isPlaying && !isPaused;
        const currentChunk = currentBook.chunks[currentChunkIndex];
        const seekAmount = 300;
        let newPosition = currentPositionInChunk + seekAmount;
        
        if (newPosition >= currentChunk.length) {
            // Go to next chunk
            if (currentChunkIndex < currentBook.chunks.length - 1) {
                currentChunkIndex++;
                currentPositionInChunk = 0;
            } else {
                currentPositionInChunk = currentChunk.length;
            }
        } else {
            currentPositionInChunk = newPosition;
        }
        
        if (currentUtterance) {
            window.speechSynthesis.cancel();
        }
        
        currentBook.currentChunk = currentChunkIndex;
        saveBooks();
        updateProgress();
        
        if (wasPlaying) {
            resumeFromCurrentPosition();
        }
    }
    
    // Rest of your existing functions (splitIntoChunks, saveBooks, loadBooks, processTxtFile, etc.)
    // Keep them exactly as they were, just add position saving to saveBooks:
    
    function splitIntoChunks(text) {
        const chunks = [];
        for (let i = 0; i < text.length; i += 2000) {
            chunks.push(text.substring(i, i + 2000));
        }
        return chunks;
    }
    
    function saveBooks() {
        const toSave = books.map(b => ({
            id: b.id,
            title: b.title,
            type: b.type,
            fullText: b.fullText,
            currentChunk: b.currentChunk || 0
        }));
        localStorage.setItem('audiobooks', JSON.stringify(toSave));
        
        // Save current position for active book
        if (currentBook) {
            localStorage.setItem(`book_pos_${currentBook.id}`, JSON.stringify({
                chunkIndex: currentChunkIndex,
                position: currentPositionInChunk
            }));
        }
    }
    
    function loadBooks() {
        const saved = localStorage.getItem('audiobooks');
        if (saved) {
            books = JSON.parse(saved);
            renderBookList();
        }
    }
    
    // Update playBook to load saved position
    function playBook(index) {
        if (currentUtterance) {
            window.speechSynthesis.cancel();
            currentUtterance = null;
        }
        
        currentBook = books[index];
        
        // Load saved position
        const savedPos = localStorage.getItem(`book_pos_${currentBook.id}`);
        if (savedPos) {
            const pos = JSON.parse(savedPos);
            currentChunkIndex = pos.chunkIndex;
            currentPositionInChunk = pos.position;
            currentBook.currentChunk = currentChunkIndex;
        } else {
            currentChunkIndex = currentBook.currentChunk || 0;
            currentPositionInChunk = 0;
        }
        
        if (bookTitle) bookTitle.textContent = currentBook.title;
        if (playerDiv) playerDiv.classList.remove('hidden');
        
        updateProgress();
        // Don't auto-start, let user press play
    }
    
    function updateProgress() {
        if (!currentBook || !progressBar || !progressText) return;
        const percent = ((currentChunkIndex + (currentPositionInChunk / (currentBook.chunks[currentChunkIndex]?.length || 1))) / currentBook.chunks.length) * 100;
        progressBar.style.width = Math.min(100, percent) + '%';
        progressText.textContent = Math.floor(Math.min(100, percent)) + '%';
    }
    
    // Set voice based on gender preference
    function setVoiceByGender(gender) {
        preferredGender = gender;
        const voices = window.speechSynthesis.getVoices();
        
        if (gender === 'female') {
            currentVoice = voices.find(voice => 
                voice.name.toLowerCase().includes('female') ||
                voice.name.toLowerCase().includes('samantha') ||
                voice.name.toLowerCase().includes('victoria') ||
                voice.name.toLowerCase().includes('zira')
            );
            if (!currentVoice) {
                currentVoice = voices.find(voice => voice.lang.startsWith('en'));
            }
        } else {
            currentVoice = voices.find(voice => 
                voice.name.toLowerCase().includes('male') ||
                voice.name.toLowerCase().includes('david') ||
                voice.name.toLowerCase().includes('mark')
            );
            if (!currentVoice) {
                currentVoice = voices.find(voice => voice.lang.startsWith('en'));
            }
        }
        
        if (!currentVoice && voices.length > 0) {
            currentVoice = voices[0];
        }
    }
    
    function setVoice(gender, btnElement) {
        preferredGender = gender;
        setVoiceByGender(gender);
        
        document.querySelectorAll('.voice-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (btnElement) btnElement.classList.add('active');
        
        if (isPlaying && currentBook) {
            const wasPlaying = isPlaying && !isPaused;
            if (wasPlaying) {
                resumeFromCurrentPosition();
            }
        }
    }
    
    function setSpeed(speed, btnElement) {
        currentSpeed = speed;
        
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (btnElement) btnElement.classList.add('active');
        
        if (isPlaying && currentBook) {
            const wasPlaying = isPlaying && !isPaused;
            if (wasPlaying) {
                resumeFromCurrentPosition();
            }
        }
    }
    
    function loadVoices() {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length === 0) {
            window.speechSynthesis.addEventListener('voiceschanged', () => {
                setVoiceByGender(preferredGender);
            });
        } else {
            setVoiceByGender(preferredGender);
        }
    }
    
    function hidePlayer() {
        stopPlayback();
        if (playerDiv) playerDiv.classList.add('hidden');
        currentBook = null;
    }
    
    function clearAllBooks() {
        if (confirm('Are you sure you want to delete ALL books? This cannot be undone.')) {
            books = [];
            localStorage.removeItem('audiobooks');
            // Clear all position data
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('book_pos_')) {
                    localStorage.removeItem(key);
                }
            }
            renderBookList();
            hidePlayer();
        }
    }
    
    function refreshPage() {
        window.location.reload();
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Process file functions (keep your existing ones)
    async function processTxtFile(file) {
        const text = await file.text();
        books.push({
            id: Date.now(),
            title: file.name.replace('.txt', ''),
            type: 'txt',
            fullText: text,
            chunks: splitIntoChunks(text),
            currentChunk: 0
        });
        return true;
    }
    
    async function processEpubFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    const zip = await JSZip.loadAsync(e.target.result);
                    let fullText = '';
                    const containerFile = await zip.file('META-INF/container.xml')?.async('string');
                    if (!containerFile) {
                        reject(new Error('Invalid EPUB'));
                        return;
                    }
                    const parser = new DOMParser();
                    const containerDoc = parser.parseFromString(containerFile, 'application/xml');
                    const rootfileElement = containerDoc.querySelector('rootfile');
                    const rootPath = rootfileElement?.getAttribute('full-path');
                    const opfFile = await zip.file(rootPath)?.async('string');
                    const opfDoc = parser.parseFromString(opfFile, 'application/xml');
                    const manifestItems = opfDoc.querySelectorAll('manifest item');
                    const spineItems = opfDoc.querySelectorAll('spine itemref');
                    const idToHref = {};
                    manifestItems.forEach(item => {
                        const id = item.getAttribute('id');
                        const href = item.getAttribute('href');
                        if (id && href) idToHref[id] = href;
                    });
                    const basePath = rootPath.substring(0, rootPath.lastIndexOf('/') + 1);
                    for (const spineItem of spineItems) {
                        const idref = spineItem.getAttribute('idref');
                        const href = idToHref[idref];
                        if (href) {
                            const fullHref = basePath + href;
                            let contentFile = await zip.file(fullHref)?.async('string');
                            if (contentFile) {
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = contentFile;
                                fullText += (tempDiv.textContent || tempDiv.innerText || '') + '\n\n';
                            }
                        }
                    }
                    books.push({
                        id: Date.now(),
                        title: file.name.replace(/\.epub$/i, ''),
                        type: 'epub',
                        fullText: fullText,
                        chunks: splitIntoChunks(fullText),
                        currentChunk: 0
                    });
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }
    
    async function processPdfFile(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                fullText += content.items.map(item => item.str).join(' ') + '\n\n';
            }
            books.push({
                id: Date.now(),
                title: file.name.replace(/\.pdf$/i, ''),
                type: 'pdf',
                fullText: fullText,
                chunks: splitIntoChunks(fullText),
                currentChunk: 0
            });
            return true;
        } catch (error) {
            alert(`PDF Error: ${error.message}`);
            return false;
        }
    }
    
    async function handleFiles(files) {
        for (let file of files) {
            const existingBook = books.find(b => b.title === file.name.replace(/\.(txt|epub|pdf)$/i, ''));
            if (existingBook) {
                alert(`⚠️ "${file.name}" is already in your library.`);
                continue;
            }
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext === 'txt') {
                showLoading(true);
                await processTxtFile(file);
                showLoading(false);
            } else if (ext === 'epub') {
                showLoading(true);
                try {
                    await processEpubFile(file);
                } catch (error) {
                    alert(`Error processing EPUB: ${error.message}`);
                }
                showLoading(false);
            } else if (ext === 'pdf') {
                showLoading(true);
                try {
                    await processPdfFile(file);
                } catch (error) {
                    alert(`Error processing PDF: ${error.message}`);
                }
                showLoading(false);
            } else {
                alert(`Unsupported file: ${file.name}`);
            }
        }
        saveBooks();
        renderBookList();
        if (fileInput) fileInput.value = '';
    }
    
    function renderBookList() {
        if (!bookListDiv) return;
        if (books.length === 0) {
            bookListDiv.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">📚 No books yet. Upload a TXT, EPUB, or PDF file.</p>';
            return;
        }
        bookListDiv.innerHTML = '';
        for (let i = 0; i < books.length; i++) {
            const book = books[i];
            let icon = '📄';
            if (book.type === 'epub') icon = '📘';
            if (book.type === 'pdf') icon = '📕';
            const typeLabel = book.type === 'epub' ? 'EPUB' : (book.type === 'pdf' ? 'PDF' : 'TXT');
            const bookDiv = document.createElement('div');
            bookDiv.className = 'book-item';
            bookDiv.innerHTML = `
                <div>
                    <div class="book-title">${icon} ${escapeHtml(book.title)}</div>
                    <div class="book-size">${Math.ceil(book.fullText.length / 1000)} KB • ${typeLabel}</div>
                </div>
                <button class="listen-btn" data-index="${i}">🔊 Listen</button>
            `;
            bookListDiv.appendChild(bookDiv);
        }
        document.querySelectorAll('.listen-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(btn.getAttribute('data-index'));
                playBook(index);
            });
        });
    }
    
    function showLoading(show, message = '⏳ Processing book, please wait...') {
        if (loadingDiv) {
            loadingDiv.textContent = message;
            loadingDiv.classList.toggle('hidden', !show);
        }
    }
    
    // Event listeners
    if (uploadArea) uploadArea.addEventListener('click', () => fileInput?.click());
    if (fileInput) fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) handleFiles(e.target.files); });
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.background = '#e0e4ff'; });
        uploadArea.addEventListener('dragleave', () => { uploadArea.style.background = '#f8f9ff'; });
        uploadArea.addEventListener('drop', (e) => { e.preventDefault(); uploadArea.style.background = '#f8f9ff'; handleFiles(e.dataTransfer.files); });
    }
    if (clearBooksBtn) clearBooksBtn.addEventListener('click', clearAllBooks);
    if (refreshBooksBtn) refreshBooksBtn.addEventListener('click', refreshPage);
    if (playBtn) playBtn.addEventListener('click', play);
    if (pauseBtn) pauseBtn.addEventListener('click', pause);
    if (stopBtn) stopBtn.addEventListener('click', stopPlayback);
    if (backwardBtn) backwardBtn.addEventListener('click', backward);
    if (forwardBtn) forwardBtn.addEventListener('click', forward);
    if (closePlayerBtn) closePlayerBtn.addEventListener('click', hidePlayer);
    if (voiceMaleBtn) voiceMaleBtn.addEventListener('click', () => setVoice('male', voiceMaleBtn));
    if (voiceFemaleBtn) voiceFemaleBtn.addEventListener('click', () => setVoice('female', voiceFemaleBtn));
    
    document.querySelectorAll('.speed-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const speed = parseFloat(btn.getAttribute('data-speed'));
            setSpeed(speed, btn);
        });
    });
    
    loadBooks();
    loadVoices();
    console.log('✅ Fixed audiobook player ready!');
});
