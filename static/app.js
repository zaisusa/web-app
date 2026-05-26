document.addEventListener('DOMContentLoaded', () => {
    // Тема
    const themeToggle = document.getElementById('themeToggle');
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
    });

    // Голосовой ввод
    const micBtn = document.getElementById('micBtn');
    const textarea = document.getElementById('text');
    let recognition;
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.lang = 'ru-RU';
        recognition.interimResults = true;
        recognition.continuous = true;

        micBtn.addEventListener('click', () => {
            if (micBtn.classList.contains('recording')) {
                recognition.stop();
            } else {
                recognition.start();
                micBtn.classList.add('recording');
                textarea.placeholder = "🎙️ Слушаю... говорите в микрофон";
            }
        });

        recognition.onresult = (e) => {
            let finalTranscript = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) finalTranscript += e.results[i][0].transcript;
            }
            textarea.value += finalTranscript;
        };

        recognition.onend = () => {
            micBtn.classList.remove('recording');
            textarea.placeholder = "Вставьте текст или нажмите ️ для голосового ввода...";
        };
    } else {
        micBtn.style.display = 'none';
    }

    // Обработчики
    document.getElementById('processBtn').addEventListener('click', processText);
    document.getElementById('exportPdf').addEventListener('click', exportToPdf);
    document.getElementById('toggleCards').addEventListener('click', toggleFlashcards);
    document.getElementById('clearHistory').addEventListener('click', clearHistory);
    
    textarea.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'Enter') processText();
    });

    renderHistory();
});

async function processText() {
    const subject = document.getElementById('subject').value;
    const text = document.getElementById('text').value.trim();
    const btn = document.getElementById('processBtn');
    const loader = document.getElementById('loader');
    const error = document.getElementById('error');
    const result = document.getElementById('result');
    const exportBtn = document.getElementById('exportPdf');
    const cardsBtn = document.getElementById('toggleCards');
    const statsBar = document.getElementById('statsBar');
    
    error.classList.remove('active');
    result.classList.remove('active');
    exportBtn.style.display = 'none';
    cardsBtn.style.display = 'none';
    
    if (!text) { showError('Введите текст'); return; }
    
    btn.disabled = true;
    loader.classList.add('active');
    const startTime = performance.now();
    
    try {
        const response = await fetch('/api/process', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, subject })
        });
        
        if (!response.ok) { const err = await response.json(); throw new Error(err.detail || 'Ошибка'); }
        
        const data = await response.json();
        const timeTaken = ((performance.now() - startTime) / 1000).toFixed(1);
        
        renderResult(data.data);
        result.classList.add('active');
        exportBtn.style.display = 'inline-flex';
        cardsBtn.style.display = 'inline-flex';
        
        // Статистика
        document.getElementById('statChars').textContent = `${text.length} символов`;
        document.getElementById('statTime').textContent = `~${timeTaken} сек обработка`;
        document.getElementById('statSaved').textContent = `экономия ~${Math.max(2, Math.floor(text.length / 50))} мин`;
        statsBar.style.display = 'flex';
        
        // Сохраняем в историю
        saveToHistory({ subject, text, result: data.data, time: new Date().toLocaleString() });
        
        result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        showError(err.message);
    } finally {
        btn.disabled = false;
        loader.classList.remove('active');
    }
}

function renderResult(data) {
    const conceptsDiv = document.getElementById('concepts');
    if (data.concepts?.length) {
        conceptsDiv.innerHTML = `<div class="flashcards-grid" id="cardsGrid">${data.concepts.map(c => `
            <div class="flashcard" onclick="this.classList.toggle('flipped')">
                <div class="flashcard-inner">
                    <div class="flashcard-front"><h4>${escapeHtml(c.term)}</h4></div>
                    <div class="flashcard-back"><p>${escapeHtml(c.definition)}</p></div>
                </div>
            </div>
        `).join('')}</div>`;
        document.getElementById('conceptsSection').style.display = 'block';
    } else {
        document.getElementById('conceptsSection').style.display = 'none';
    }
    
    const linksDiv = document.getElementById('links');
    if (data.logical_links?.length) {
        linksDiv.innerHTML = data.logical_links.map(l => `<span class="link-tag">${escapeHtml(l)}</span>`).join('');
        document.getElementById('linksSection').style.display = 'block';
    } else {
        document.getElementById('linksSection').style.display = 'none';
    }
    
    const quizDiv = document.getElementById('quiz');
    if (data.quiz?.length) {
        quizDiv.innerHTML = data.quiz.map((q, i) => `
            <div class="quiz-item">
                <h4>Вопрос ${i+1}: ${escapeHtml(q.question)}</h4>
                <div class="options">
                    ${q.options.map((opt, oi) => `
                        <div class="option" data-correct="${q.correct_index}" data-expl="expl-${i}">${escapeHtml(opt)}</div>
                    `).join('')}
                </div>
                <div class="explanation" id="expl-${i}"><strong>💡 Ответ:</strong> ${escapeHtml(q.explanation)}</div>
            </div>
        `).join('');
        quizDiv.querySelectorAll('.option').forEach(opt => opt.addEventListener('click', handleAnswer));
        document.getElementById('quizSection').style.display = 'block';
    } else {
        document.getElementById('quizSection').style.display = 'none';
    }
}

function handleAnswer(e) {
    const opt = e.currentTarget; const parent = opt.parentElement;
    const correct = parseInt(opt.dataset.correct); const expl = opt.dataset.expl;
    parent.style.pointerEvents = 'none';
    parent.querySelectorAll('.option').forEach((o, i) => {
        if (i === correct) o.classList.add('correct');
        else if (o === opt) o.classList.add('incorrect');
    });
    document.getElementById(expl).classList.add('show');
}

function toggleFlashcards() {
    const grid = document.getElementById('cardsGrid');
    if (grid) grid.classList.toggle('flashcards-grid');
}

function exportToPdf() {
    const el = document.getElementById('result');
    const btn = document.getElementById('exportPdf');
    btn.style.display = 'none';
    html2pdf().set({
        margin: 10, filename: 'LectureMind_Conспект.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    }).from(el).save().then(() => btn.style.display = 'inline-flex');
}

function saveToHistory(item) {
    let history = JSON.parse(localStorage.getItem('lm_history') || '[]');
    history.unshift(item);
    if (history.length > 5) history = history.slice(0, 5);
    localStorage.setItem('lm_history', JSON.stringify(history));
    renderHistory();
}

function renderHistory() {
    const history = JSON.parse(localStorage.getItem('lm_history') || '[]');
    const card = document.getElementById('historyCard');
    const list = document.getElementById('historyList');
    if (history.length === 0) { card.style.display = 'none'; return; }
    
    card.style.display = 'block';
    list.innerHTML = history.map((h, i) => `
        <div class="history-item" onclick="loadHistory(${i})">
            <span>${escapeHtml(h.subject)} • ${h.text.substring(0, 40)}...</span>
            <small>${h.time}</small>
        </div>
    `).join('');
}

function loadHistory(index) {
    const history = JSON.parse(localStorage.getItem('lm_history') || '[]');
    if (history[index]) {
        document.getElementById('subject').value = history[index].subject;
        document.getElementById('text').value = history[index].text;
        renderResult(history[index].result);
        document.getElementById('result').classList.add('active');
        document.getElementById('exportPdf').style.display = 'inline-flex';
        document.getElementById('toggleCards').style.display = 'inline-flex';
        document.getElementById('result').scrollIntoView({ behavior: 'smooth' });
    }
}

function clearHistory() {
    localStorage.removeItem('lm_history');
    renderHistory();
}

function showError(msg) {
    const e = document.getElementById('error');
    e.textContent = '❌ ' + msg; e.classList.add('active');
}

function escapeHtml(t) {
    const d = document.createElement('div'); d.textContent = t; return d.innerHTML;
}