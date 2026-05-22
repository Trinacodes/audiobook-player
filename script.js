// Audiobook Player - Supports TXT, EPUB, and PDF files with Dark Mode

document.addEventListener('DOMContentLoaded', function() {
    
    // Get DOM elements
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
    let isPlaying = false;
    let currentSpeed = 1;
    let currentUtterance = null;
    let currentVoice = null;
    let preferredGender = 'male';
    
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
    
    // Show/hide loading message
    function showLoading(show, message = '⏳ Processing book, please wait...') {
        if (loadingDiv) {
            loadingDiv.textContent = message;
            loadingDiv.classList.toggle('hidden', !show);
        }
    }
    
    // Split text into chunks
    function splitIntoChunks(text) {
        const chunks = [];
        for (let i = 0; i < text.length; i += 2000) {
            chunks.push(text.substring(i, i + 2000));
        }
        return chunks;
    }
    
    // Save books to localStorage
    function saveBooks() {
        const toSave = books.map(b => ({
            id: b.id,
            title: b.title,
            type: b.type,
            fullText: b.fullText,
            currentChunk: b.currentChunk || 0
        }));
        localStorage.setItem('audiobooks', JSON.stringify(toSave));
    }
    
    // Load books from localStorage
    function loadBooks() {
        const saved = localStorage.getItem('audiobooks');
        if (saved) {
            books = JSON.parse(saved);
            renderBookList();
            console.log(`Loaded ${books.length} books`);
        }
    }
    
    // Process TXT file
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
    
    // Process EPUB file
    async function processEpubFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                try {
                    if (typeof JSZip === 'undefined') {
                        reject(new Error('JSZip library not loaded'));
                        return;
                    }
                    
                    const zip = await JSZip.loadAsync(e.target.result);
                    let fullText = '';
                    
                    const containerFile = await zip.file('META-INF/container.xml')?.async('string');
                    if (!containerFile) {
                        reject(new Error('Invalid EPUB: No container.xml found'));
                        return;
                    }
                    
                    const parser = new DOMParser();
                    const containerDoc = parser.parseFromString(containerFile, 'application/xml');
                    const rootfileElement = containerDoc.querySelector('rootfile');
                    const rootPath = rootfileElement?.getAttribute('full-path');
                    
                    if (!rootPath) {
                        reject(new Error('Could not find content file in EPUB'));
                        return;
                    }
                    
                    const opfFile = await zip.file(rootPath)?.async('string');
                    if (!opfFile) {
                        reject(new Error('Could not find content.opf'));
                        return;
                    }
                    
                    const opfDoc = parser.parseFromString(opfFile, 'application/xml');
                    const manifestItems = opfDoc.querySelectorAll('manifest item');
                    const spineItems = opfDoc.querySelectorAll('spine itemref');
                    
                    const idToHref = {};
                    manifestItems.forEach(item => {
                        const id = item.getAttribute('id');
                        const href = item.getAttribute('href');
                        if (id && href) {
                            idToHref[id] = href;
                        }
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
                                const text = tempDiv.textContent || tempDiv.innerText || '';
                                fullText += text + '\n\n';
                            }
                        }
                    }
                    
                    if (fullText.trim().length === 0) {
                        reject(new Error('No text could be extracted from this EPUB'));
                        return;
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
    
    // Process PDF file
    async function processPdfFile(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            let fullText = '';
            const numPages = pdf.numPages;
            
            for (let i = 1; i <= numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const strings = content.items.map(item => item.str);
                fullText += strings.join(' ') + '\n\n';
                
                if (i % 10 === 0) {
                    if (loadingDiv) loadingDiv.textContent = `⏳ Processing PDF... page ${i} of ${numPages}`;
                }
            }
            
            if (fullText.trim().length === 0) {
                throw new Error('No text found in this PDF. It might be a scanned image PDF.');
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
            alert(`PDF Error: ${error.message}\n\nTry converting to TXT first or use a text-based PDF.`);
            return false;
        }
    }
    
    // Handle file upload
    async function handleFiles(files) {
        for (let file of files) {
            // Check for duplicates
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
                console.log('Added TXT:', file.name);
            } 
            else if (ext === 'epub') {
                showLoading(true);
                try {
                    await processEpubFile(file);
                    console.log('Added EPUB:', file.name);
                } catch (error) {
                    alert(`Error processing EPUB: ${error.message}`);
                }
                showLoading(false);
            }
            else if (ext === 'pdf') {
                showLoading(true);
                try {
                    await processPdfFile(file);
                    console.log('Added PDF:', file.name);
                } catch (error) {
                    alert(`Error processing PDF: ${error.message}`);
                }
                showLoading(false);
            }
            else {
                alert(`Unsupported file: ${file.name}\n\nUse .txt, .epub, or .pdf files`);
            }
        }
        saveBooks();
        renderBookList();
        if (fileInput) fileInput.value = '';
    }
    
    // Render the book list
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
    
    // Play a book
    function playBook(index) {
        if (currentUtterance) {
            window.speechSynthesis.cancel();
            currentUtterance = null;
        }
        
        currentBook = books[index];
        currentChunkIndex = currentBook.currentChunk || 0;
        if (bookTitle) bookTitle.textContent = currentBook.title;
        if (playerDiv) playerDiv.classList.remove('hidden');
        
        updateProgress();
        readCurrentChunk();
    }
    
    // Read the current chunk - FIXED duplicate rate line
    function readCurrentChunk() {
        if (!currentBook) return;
        
        if (currentChunkIndex >= currentBook.chunks.length) {
            stopPlayback();
            alert('Finished reading the book!');
            return;
        }
        
        const chunk = currentBook.chunks[currentChunkIndex];
        
        currentUtterance = new SpeechSynthesisUtterance(chunk);
        if (currentVoice) {
            currentUtterance.voice = currentVoice;
        }
        currentUtterance.rate = currentSpeed;
        currentUtterance.lang = 'en-US';
        
        currentUtterance.onend = () => {
            if (isPlaying && currentBook) {
                currentChunkIndex++;
                currentBook.currentChunk = currentChunkIndex;
                saveBooks();
                updateProgress();
                readCurrentChunk();
            }
        };
        
        currentUtterance.onerror = (e) => {
            console.error('Speech error:', e);
            isPlaying = false;
        };
        
        window.speechSynthesis.speak(currentUtterance);
        isPlaying = true;
    }
    
    // Update progress bar
    function updateProgress() {
        if (!currentBook || !progressBar || !progressText) return;
        const percent = (currentChunkIndex / currentBook.chunks.length) * 100;
        progressBar.style.width = percent + '%';
        progressText.textContent = Math.round(percent) + '%';
    }
    
    // Play button
    function play() {
        if (!currentBook) {
            alert('Select a book first');
            return;
        }
        if (currentUtterance && window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        } else if (!isPlaying) {
            readCurrentChunk();
        }
        isPlaying = true;
    }
    
    // Pause button
    function pause() {
        if (isPlaying) {
            window.speechSynthesis.pause();
            isPlaying = false;
        }
    }
    
    // Stop button
    function stopPlayback() {
        window.speechSynthesis.cancel();
        currentUtterance = null;
        isPlaying = false;
        if (currentBook) {
            saveBooks();
        }
    }
    
    // Backward 10 seconds
    function backward() {
        if (!currentBook) return;
        
        const wasPlaying = isPlaying;
        stopPlayback();
        currentChunkIndex = Math.max(0, currentChunkIndex - 1);
        currentBook.currentChunk = currentChunkIndex;
        
        if (wasPlaying) {
            readCurrentChunk();
        }
        updateProgress();
        console.log('Backward 10 seconds');
    }
    
    // Forward 10 seconds
    function forward() {
        if (!currentBook) return;
        
        const wasPlaying = isPlaying;
        stopPlayback();
        currentChunkIndex = Math.min(currentBook.chunks.length - 1, currentChunkIndex + 1);
        currentBook.currentChunk = currentChunkIndex;
        
        if (wasPlaying) {
            readCurrentChunk();
        }
        updateProgress();
        console.log('Forward 10 seconds');
    }
    
    // Change reading speed
    function setSpeed(speed, btnElement) {
        currentSpeed = speed;
        
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (btnElement) btnElement.classList.add('active');
        
        if (isPlaying && currentUtterance && currentBook) {
            const wasPlaying = isPlaying;
            const currentPos = currentChunkIndex;
            stopPlayback();
            currentChunkIndex = currentPos;
            if (wasPlaying) {
                readCurrentChunk();
            }
        }
    }
    
    // Get available voices
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
    
    // Set voice based on gender preference
    function setVoiceByGender(gender) {
        preferredGender = gender;
        const voices = window.speechSynthesis.getVoices();
        
        if (gender === 'female') {
            currentVoice = voices.find(voice => 
                voice.name.toLowerCase().includes('female') ||
                voice.name.toLowerCase().includes('samantha') ||
                voice.name.toLowerCase().includes('victoria') ||
                voice.name.toLowerCase().includes('zira') ||
                (voice.lang === 'en-US' && voice.name.includes('Female'))
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
        
        console.log(`Voice set to: ${currentVoice?.name || 'default'} (${gender})`);
    }
    
    // Switch between male and female voice
    function setVoice(gender, btnElement) {
        preferredGender = gender;
        setVoiceByGender(gender);
        
        document.querySelectorAll('.voice-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        if (btnElement) btnElement.classList.add('active');
        
        if (isPlaying && currentUtterance && currentBook) {
            const wasPlaying = isPlaying;
            const currentPos = currentChunkIndex;
            stopPlayback();
            currentChunkIndex = currentPos;
            if (wasPlaying) {
                readCurrentChunk();
            }
        }
    }
    
    // Hide player
    function hidePlayer() {
        stopPlayback();
        if (playerDiv) playerDiv.classList.add('hidden');
        currentBook = null;
    }
    
    // Clear all books
    function clearAllBooks() {
        if (confirm('Are you sure you want to delete ALL books? This cannot be undone.')) {
            books = [];
            localStorage.removeItem('audiobooks');
            renderBookList();
            hidePlayer();
            console.log('All books cleared');
        }
    }
    
    // Refresh the page
    function refreshPage() {
        window.location.reload();
    }
    
    // Escape HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // EVENT LISTENERS
    if (uploadArea) uploadArea.addEventListener('click', () => fileInput?.click());
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFiles(e.target.files);
            }
        });
    }
    
    if (uploadArea) {
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.background = '#e0e4ff';
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.style.background = '#f8f9ff';
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.background = '#f8f9ff';
            handleFiles(e.dataTransfer.files);
        });
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
    console.log('✅ App ready! Upload TXT, EPUB, or PDF files.');
});