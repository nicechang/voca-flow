/**
 * VocaFlow English Memorizer - Core Logic
 */

// --- STATE MANAGEMENT ---
const state = {
  words: [],
  logs: [],
  settings: {
    mode: 'local', // 'local' or 'cloud'
    gasUrl: '',
  },
  currentSessionWords: [],
  currentSessionIndex: -1,
  sessionScores: { correct: 0, total: 0 },
  currentNaverResult: null,
  isLocalServerActive: false
};

// Local storage keys
const STORAGE_KEYS = {
  WORDS: 'vocaflow_words',
  LOGS: 'vocaflow_logs',
  SETTINGS: 'vocaflow_settings'
};

// Base URL for local python server API
const LOCAL_API_URL = 'http://localhost:8000';

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  loadLocalSettings();
  initNavigation();
  initForms();
  initStudyControls();
  initSettingsPanel();
  
  // Check if local python server is running
  await checkLocalServer();
  
  // Load database
  await loadDatabase();
  
  // Sync status display
  updateSyncStatusIndicator();
  
  // Refresh stats and lists
  renderStats();
  renderWordList();
});

// --- NAVIGATION & TABS ---
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.getAttribute('data-tab');
      
      // Update nav active state
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
      
      // Update tab active state
      tabContents.forEach(tab => {
        tab.classList.remove('active');
        if (tab.id === targetTab) {
          tab.classList.add('active');
        }
      });
      
      // Trigger tab-specific refresh
      if (targetTab === 'tab-list') {
        renderStats();
        renderWordList();
      } else if (targetTab === 'tab-study') {
        // Reset and prepare study session if session empty
        if (state.currentSessionWords.length === 0 || state.currentSessionIndex >= state.currentSessionWords.length) {
          startNewStudySession();
        }
      }
    });
  });
}

// --- DATABASE OPERATIONS ---

// Load settings from localStorage
function loadLocalSettings() {
  const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
  if (savedSettings) {
    try {
      state.settings = JSON.parse(savedSettings);
    } catch (e) {
      console.error("Error parsing settings:", e);
    }
  }
}

// Save settings to localStorage
function saveLocalSettings() {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(state.settings));
}

// Check if Python local proxy server is running
async function checkLocalServer() {
  try {
    const res = await fetch(`${LOCAL_API_URL}/api/local-db`, { method: 'GET' });
    state.isLocalServerActive = res.ok;
  } catch (e) {
    state.isLocalServerActive = false;
  }
}

// Load database (Words & Logs) from local storage, local python server, or Google Sheets
async function loadDatabase() {
  showToast("데이터를 불러오는 중입니다...");
  
  // 1. Google Sheets Cloud Mode
  if (state.settings.mode === 'cloud' && state.settings.gasUrl) {
    try {
      const wordsUrl = `${state.settings.gasUrl}?action=getWords`;
      const logsUrl = `${state.settings.gasUrl}?action=getLogs`;
      
      const [wordsRes, logsRes] = await Promise.all([
        fetch(wordsUrl),
        fetch(logsUrl)
      ]);
      
      if (wordsRes.ok && logsRes.ok) {
        state.words = await wordsRes.json();
        state.logs = await logsRes.json();
        
        // Cache to localStorage as fallback
        localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(state.words));
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(state.logs));
        
        showToast("구글 시트 데이터 로드 완료");
        return;
      }
    } catch (e) {
      console.error("Failed to load from Google Sheets, falling back to local:", e);
      showToast("구글 시트 연결 실패. 로컬 데이터를 불러옵니다.");
    }
  }
  
  // 2. Local Server Mode (if active)
  if (state.isLocalServerActive) {
    try {
      const res = await fetch(`${LOCAL_API_URL}/api/local-db`);
      if (res.ok) {
        const db = await res.json();
        state.words = db.words || [];
        state.logs = db.logs || [];
        
        // Cache to localStorage
        localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(state.words));
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(state.logs));
        
        showToast("로컬 서버 DB 로드 완료");
        return;
      }
    } catch (e) {
      console.error("Failed to load from local server:", e);
    }
  }
  
  // 3. Fallback: Browser Local Storage Mode
  const savedWords = localStorage.getItem(STORAGE_KEYS.WORDS);
  const savedLogs = localStorage.getItem(STORAGE_KEYS.LOGS);
  
  state.words = savedWords ? JSON.parse(savedWords) : [];
  state.logs = savedLogs ? JSON.parse(savedLogs) : [];
  
  showToast("로컬 브라우저 데이터 로드 완료");
}

// Persist the local database (called in Local Mode)
async function persistLocalDatabase() {
  // Cache to localStorage
  localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(state.words));
  localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(state.logs));
  
  // Save to local server (if active)
  if (state.isLocalServerActive) {
    try {
      await fetch(`${LOCAL_API_URL}/api/local-db`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: JSON.stringify({ words: state.words, logs: state.logs })
      });
    } catch (e) {
      console.error("Failed to save to local server file DB:", e);
    }
  }
}

// Update UI Badge for Sync Status
function updateSyncStatusIndicator() {
  const badge = document.getElementById('sync-status');
  const icon = badge.querySelector('.status-icon');
  const text = badge.querySelector('.status-text');
  
  badge.className = 'sync-status-badge';
  
  if (state.settings.mode === 'cloud' && state.settings.gasUrl) {
    badge.classList.add('online');
    icon.textContent = 'cloud_done';
    text.textContent = '구글 시트 연동';
  } else if (state.isLocalServerActive) {
    badge.classList.add('local');
    icon.textContent = 'dns';
    text.textContent = '로컬 서버 모드';
  } else {
    badge.classList.add('local');
    icon.textContent = 'database';
    text.textContent = '브라우저 단독';
  }
}

// --- DICTIONARY SEARCH (NAVER PROXY) ---
async function searchNaverDictionary(query) {
  query = query.trim();
  if (!query) return null;
  
  let url = '';
  
  // 1. Google Sheets GAS Proxy
  if (state.settings.mode === 'cloud' && state.settings.gasUrl) {
    url = `${state.settings.gasUrl}?action=searchNaver&query=${encodeURIComponent(query)}`;
  } 
  // 2. Local Python Server Proxy
  else if (state.isLocalServerActive) {
    url = `${LOCAL_API_URL}/api/naver?query=${encodeURIComponent(query)}`;
  } 
  // 3. direct browser lookup (will likely fail due to CORS, but kept as last resort / error indicator)
  else {
    url = `https://dict.naver.com/api3/enko/search?query=${encodeURIComponent(query)}&m=pc`;
  }
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Search failed");
    const data = await res.json();
    return parseNaverResult(data, query);
  } catch (e) {
    console.error("Error searching dictionary:", e);
    // If we are offline/CORS blocked, alert user
    if (state.settings.mode === 'local' && !state.isLocalServerActive) {
      showToast("사전을 조회하려면 로컬 python3 server.py가 실행 중이어야 합니다.");
    } else {
      showToast("사전 조회 도중 오류가 발생했습니다.");
    }
    return null;
  }
}

// Parse Raw JSON from Naver Dictionary api3
function parseNaverResult(data, query) {
  const srlMap = data.getSearchResultMap?.getSearchResultListMap || data.searchResultMap?.searchResultListMap;
  if (!srlMap) return null;
  
  const wordItems = srlMap.WORD ? srlMap.WORD.items : [];
  if (wordItems.length === 0) return null;
  
  // 1. Primary Match Entry
  const primaryItem = wordItems[0];
  const wordTitle = primaryItem.expEntry ? primaryItem.expEntry.replace(/<\/?[^>]+(>|$)/g, "").trim() : query;
  const phonetic = primaryItem.phoneticSymbol || "";
  
  // Parse meanings from primary item
  const meanings = [];
  if (primaryItem.meansCollector) {
    primaryItem.meansCollector.forEach(mc => {
      if (mc.means) {
        mc.means.forEach(m => {
          if (m.value) {
            const cleanMean = m.value.replace(/<\/?[^>]+(>|$)/g, "").trim();
            if (cleanMean) meanings.push(cleanMean);
          }
        });
      }
    });
  }
  
  // 2. Parse Synonyms from THESAURUS
  const synonyms = [];
  const thesItems = srlMap.THESAURUS ? srlMap.THESAURUS.items : [];
  if (thesItems && thesItems.length > 0 && thesItems[0].expThesaurus) {
    try {
      const thes = JSON.parse(thesItems[0].expThesaurus);
      thes.forEach(entry => {
        if (entry.pospList) {
          entry.pospList.forEach(posp => {
            if (posp.wordList) {
              posp.wordList.forEach(w => {
                if (w.wordName && !synonyms.includes(w.wordName)) {
                  synonyms.push(w.wordName);
                }
              });
            }
          });
        }
      });
    } catch (e) {
      console.error("Error parsing thesaurus:", e);
    }
  }
  
  // 3. Parse Related Expressions & Idioms
  const expressions = [];
  const addExpressionsFromItems = (items, isWordSection) => {
    if (!items) return;
    const startIndex = isWordSection ? 1 : 0; // Skip primary item
    for (let i = startIndex; i < items.length; i++) {
      const it = items[i];
      if (it.expEntry) {
        const cleanEntry = it.expEntry.replace(/<\/?[^>]+(>|$)/g, "").trim();
        const itemMeanings = [];
        if (it.meansCollector) {
          it.meansCollector.forEach(mc => {
            if (mc.means) {
              mc.means.forEach(m => {
                if (m.value) {
                  const cleanVal = m.value.replace(/<\/?[^>]+(>|$)/g, "").trim();
                  if (cleanVal) itemMeanings.push(cleanVal);
                }
              });
            }
          });
        }
        if (itemMeanings.length > 0) {
          expressions.push({
            ori: cleanEntry,
            trans: itemMeanings.slice(0, 2).join("; ") // Take max 2 meanings to keep UI clean
          });
        }
      }
    }
  };
  
  addExpressionsFromItems(wordItems, true);
  addExpressionsFromItems(srlMap.OPEN ? srlMap.OPEN.items : [], false);
  
  return {
    word: wordTitle,
    phonetic: phonetic,
    meanings: meanings.slice(0, 6), // Limit to top 6 meanings
    synonyms: synonyms.slice(0, 8), // Limit to top 8 synonyms
    expressions: expressions.slice(0, 4) // Limit to top 4 expressions
  };
}

// --- FORM HANDLERS (TAB 1) ---
function initForms() {
  const searchBtn = document.getElementById('btn-search-dict');
  const wordInput = document.getElementById('input-word');
  const meaningInput = document.getElementById('input-meaning');
  const nuanceInput = document.getElementById('input-nuance');
  const saveForm = document.getElementById('add-word-form');
  const resultsContainer = document.getElementById('dict-results-container');
  const speakSearchBtn = document.getElementById('btn-speak-search');
  
  // Selected fields trackers
  let selectedMeanings = new Set();
  
  // Search dictionary event
  searchBtn.addEventListener('click', performDictSearch);
  wordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performDictSearch();
    }
  });
  
  async function performDictSearch() {
    const query = wordInput.value.trim();
    if (!query) return;
    
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="material-symbols-outlined rotating">sync</span>';
    
    const result = await searchNaverDictionary(query);
    
    searchBtn.disabled = false;
    searchBtn.innerHTML = '<span class="material-symbols-outlined">search</span>';
    
    if (result) {
      state.currentNaverResult = result;
      selectedMeanings.clear();
      
      // Render results
      document.getElementById('dict-word-title').textContent = result.word;
      document.getElementById('dict-phonetic').textContent = result.phonetic;
      
      // Speech button
      speakSearchBtn.onclick = () => speak(result.word);
      
      // Meanings list
      const meaningsList = document.getElementById('dict-meanings-list');
      meaningsList.innerHTML = '';
      result.meanings.forEach(mean => {
        const badge = document.createElement('div');
        badge.className = 'badge';
        badge.textContent = mean;
        badge.addEventListener('click', () => {
          if (selectedMeanings.has(mean)) {
            selectedMeanings.delete(mean);
            badge.classList.remove('selected');
          } else {
            selectedMeanings.add(mean);
            badge.classList.add('selected');
          }
          // Update meaning input field with selection
          meaningInput.value = Array.from(selectedMeanings).join('; ');
        });
        meaningsList.appendChild(badge);
      });
      
      // Synonyms
      const synonymsSection = document.getElementById('dict-synonyms-section');
      const synonymsList = document.getElementById('dict-synonyms-list');
      synonymsList.innerHTML = '';
      if (result.synonyms.length > 0) {
        synonymsSection.classList.remove('hidden');
        result.synonyms.forEach(syn => {
          const badge = document.createElement('div');
          badge.className = 'badge synonyms small';
          badge.textContent = syn;
          synonymsList.appendChild(badge);
        });
      } else {
        synonymsSection.classList.add('hidden');
      }
      
      // Expressions
      const expressionsSection = document.getElementById('dict-expressions-section');
      const expressionsList = document.getElementById('dict-expressions-list');
      expressionsList.innerHTML = '';
      if (result.expressions.length > 0) {
        expressionsSection.classList.remove('hidden');
        result.expressions.forEach(exp => {
          const item = document.createElement('div');
          item.className = 'expression-item';
          item.innerHTML = `
            <div class="exp-ori">${highlightQuery(exp.ori, result.word)}</div>
            <div class="exp-trans">${exp.trans}</div>
          `;
          expressionsList.appendChild(item);
        });
      } else {
        expressionsSection.classList.add('hidden');
      }
      
      resultsContainer.classList.remove('hidden');
      
      // If meaning was empty, prefill with first meaning automatically
      if (result.meanings.length > 0 && !meaningInput.value) {
        meaningsList.children[0].click(); // Auto-select first meaning
      }
    } else {
      resultsContainer.classList.add('hidden');
      showToast("단어를 찾을 수 없습니다.");
    }
  }
  
  // Submit/Save Form
  saveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const wordText = wordInput.value.trim();
    const meaningText = meaningInput.value.trim();
    const nuanceText = nuanceInput.value.trim();
    
    if (!wordText || !meaningText) return;
    
    const isUpdate = state.words.find(w => w.word.toLowerCase() === wordText.toLowerCase());
    
    const wordObj = {
      id: isUpdate ? isUpdate.id : 'w_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      word: wordText,
      meaning: meaningText,
      nuance: nuanceText,
      synonyms: JSON.stringify(state.currentNaverResult?.synonyms || (isUpdate ? JSON.parse(isUpdate.synonyms) : [])),
      expressions: JSON.stringify(state.currentNaverResult?.expressions || (isUpdate ? JSON.parse(isUpdate.expressions) : [])),
      correct_count: isUpdate ? parseInt(isUpdate.correct_count) : 0,
      incorrect_count: isUpdate ? parseInt(isUpdate.incorrect_count) : 0,
      status: isUpdate ? isUpdate.status : 'Learning',
      last_reviewed: isUpdate ? isUpdate.last_reviewed : '',
      created_at: isUpdate ? isUpdate.created_at : new Date().toISOString()
    };
    
    showToast("단어를 저장하는 중...");
    
    // Save to State
    if (isUpdate) {
      const idx = state.words.findIndex(w => w.id === isUpdate.id);
      state.words[idx] = wordObj;
    } else {
      state.words.push(wordObj);
    }
    
    // Persist: Google Sheets
    if (state.settings.mode === 'cloud' && state.settings.gasUrl) {
      try {
        const res = await fetch(state.settings.gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          body: JSON.stringify({ action: 'addWord', word: wordObj })
        });
        if (res.ok) {
          showToast(`'${wordText}' 구글 시트에 저장 완료!`);
        } else {
          throw new Error("HTTP error");
        }
      } catch (e) {
        console.error("GAS addWord failed:", e);
        showToast("구글 시트 저장 실패. 로컬에 백업 저장되었습니다.");
        await persistLocalDatabase();
      }
    } else {
      // Persist: Local Database
      await persistLocalDatabase();
      showToast(`'${wordText}' 단어장에 추가 완료!`);
    }
    
    // Reset inputs
    wordInput.value = '';
    meaningInput.value = '';
    nuanceInput.value = '';
    resultsContainer.classList.add('hidden');
    state.currentNaverResult = null;
    wordInput.focus();
  });
}

// Highlight keyword in string
function highlightQuery(text, word) {
  const parts = word.split(/\s+/);
  let highlighted = text;
  parts.forEach(part => {
    if (part.length > 2) {
      const regex = new RegExp(`(${part})`, 'gi');
      highlighted = highlighted.replace(regex, '<strong>$1</strong>');
    }
  });
  return highlighted;
}

// --- STUDY MODULE (TAB 2) ---
function initStudyControls() {
  const modeSelect = document.getElementById('select-study-mode');
  const filterSelect = document.getElementById('select-study-filter');
  
  modeSelect.addEventListener('change', renderStudySessionCurrentCard);
  filterSelect.addEventListener('change', startNewStudySession);
  
  // Flashcard buttons
  const cardElement = document.getElementById('flashcard');
  cardElement.addEventListener('click', () => {
    cardElement.classList.toggle('flipped');
  });
  
  document.getElementById('btn-know-no').addEventListener('click', () => handleStudyAnswer(false));
  document.getElementById('btn-know-yes').addEventListener('click', () => handleStudyAnswer(true));
  
  // Text Speech triggers
  document.getElementById('btn-speak-front').addEventListener('click', (e) => {
    e.stopPropagation(); // Avoid card flip
    const word = document.getElementById('card-word-front').textContent;
    speak(word);
  });
  
  document.getElementById('btn-speak-choice').addEventListener('click', () => {
    const word = document.getElementById('choice-question-word').textContent;
    speak(word);
  });
  
  document.getElementById('btn-go-add').addEventListener('click', () => {
    document.querySelector('[data-tab="tab-add"]').click();
  });
}

// Start a fresh learning/review session based on selected filters
function startNewStudySession() {
  const filterMode = document.getElementById('select-study-filter').value;
  let targetWords = [...state.words];
  
  // 1. Apply Filter
  if (filterMode === 'weak') {
    // Show unreviewed words or words with correct rate < 50%
    targetWords = targetWords.filter(w => {
      const total = parseInt(w.correct_count) + parseInt(w.incorrect_count);
      if (total === 0) return true; // Never reviewed
      return (parseInt(w.correct_count) / total) < 0.5;
    });
  } 
  else if (filterMode === 'recent-wrong') {
    // Filter words that were incorrect in the last 15 quiz logs
    const wrongWordIds = state.logs
      .slice(-20) // last 20 logs
      .filter(log => log.result === 'Incorrect')
      .map(log => log.word_id);
    
    targetWords = targetWords.filter(w => wrongWordIds.includes(w.id));
  }
  
  // 2. Sort by Weakness Score with small randomness factor to prevent repetitive order
  // Weakness Score = incorrect / (correct + incorrect + 1)
  targetWords.sort((a, b) => {
    const aTotal = parseInt(a.correct_count) + parseInt(a.incorrect_count);
    const bTotal = parseInt(b.correct_count) + parseInt(b.incorrect_count);
    
    const aScore = aTotal === 0 ? 0.8 : (parseInt(a.incorrect_count) / (aTotal + 1));
    const bScore = bTotal === 0 ? 0.8 : (parseInt(b.incorrect_count) / (bTotal + 1));
    
    // Add small random perturbation
    return (bScore + Math.random() * 0.25) - (aScore + Math.random() * 0.25);
  });
  
  // 3. Take up to 20 words for the session
  state.currentSessionWords = targetWords.slice(0, 20);
  state.currentSessionIndex = 0;
  state.sessionScores = { correct: 0, total: 0 };
  
  // Show / Hide Warnings
  const warningView = document.getElementById('study-warning-view');
  const flashcardView = document.getElementById('study-flashcard-view');
  const choiceView = document.getElementById('study-choice-view');
  const gapfillView = document.getElementById('study-gapfill-view');
  
  if (state.currentSessionWords.length === 0) {
    warningView.classList.remove('hidden');
    [flashcardView, choiceView, gapfillView].forEach(v => v.classList.add('hidden'));
    
    const msg = document.getElementById('study-warning-message');
    if (filterMode === 'weak') {
      msg.textContent = "취약하거나 아직 암기하지 않은 단어가 없습니다. 전체 단어 필터를 이용해 보세요!";
    } else if (filterMode === 'recent-wrong') {
      msg.textContent = "최근 오답 이력이 없습니다. 다른 필터를 선택해 주세요.";
    } else {
      msg.textContent = "단어장에 추가된 단어가 없습니다. 먼저 단어를 등록해 주세요.";
    }
    
    updateSessionProgressBar(0, 0);
  } else {
    warningView.classList.add('hidden');
    renderStudySessionCurrentCard();
  }
}

// Render the active word card based on selected Study Mode
function renderStudySessionCurrentCard() {
  if (state.currentSessionWords.length === 0) return;
  
  const mode = document.getElementById('select-study-mode').value;
  const currentWord = state.currentSessionWords[state.currentSessionIndex];
  
  // Toggle Mode Views
  const views = {
    flashcard: document.getElementById('study-flashcard-view'),
    choice: document.getElementById('study-choice-view'),
    gapfill: document.getElementById('study-gapfill-view')
  };
  
  Object.keys(views).forEach(k => {
    if (k === mode) {
      views[k].classList.remove('hidden');
    } else {
      views[k].classList.add('hidden');
    }
  });
  
  updateSessionProgressBar(state.currentSessionIndex, state.currentSessionWords.length);
  
  // 1. RENDER FLASHCARD
  if (mode === 'flashcard') {
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.remove('flipped'); // Reset flip state
    
    document.getElementById('card-word-front').textContent = currentWord.word;
    
    // Attempt to extract pronunciation phonetic symbol (if saved/scraped)
    // In our current mock we store it in wordObj, let's see
    let cleanPhonetic = "";
    if (state.words.find(w => w.id === currentWord.id)) {
      // Just check if we can scrape a phonetic symbol dynamically or load from database
    }
    document.getElementById('card-phonetic-front').textContent = cleanPhonetic;
    
    document.getElementById('card-word-back').textContent = currentWord.word;
    document.getElementById('card-meaning').textContent = currentWord.meaning;
    
    // Nuance
    const nuanceSec = document.getElementById('card-nuance-section');
    if (currentWord.nuance) {
      nuanceSec.classList.remove('hidden');
      document.getElementById('card-nuance').textContent = currentWord.nuance;
    } else {
      nuanceSec.classList.add('hidden');
    }
    
    // Synonyms
    const synSec = document.getElementById('card-synonyms-section');
    const synList = document.getElementById('card-synonyms');
    synList.innerHTML = '';
    let parsedSyns = [];
    try { parsedSyns = JSON.parse(currentWord.synonyms || '[]'); } catch(e) {}
    if (parsedSyns && parsedSyns.length > 0) {
      synSec.classList.remove('hidden');
      parsedSyns.forEach(syn => {
        const badge = document.createElement('span');
        badge.className = 'badge small';
        badge.textContent = syn;
        synList.appendChild(badge);
      });
    } else {
      synSec.classList.add('hidden');
    }
    
    // Expressions
    const expSec = document.getElementById('card-expressions-section');
    const expList = document.getElementById('card-expressions');
    expList.innerHTML = '';
    let parsedExps = [];
    try { parsedExps = JSON.parse(currentWord.expressions || '[]'); } catch(e) {}
    if (parsedExps && parsedExps.length > 0) {
      expSec.classList.remove('hidden');
      parsedExps.forEach(exp => {
        const item = document.createElement('div');
        item.className = 'card-expression-item';
        item.innerHTML = `
          <div class="ori">${highlightQuery(exp.ori, currentWord.word)}</div>
          <div class="trans">${exp.trans}</div>
        `;
        expList.appendChild(item);
      });
    } else {
      expSec.classList.add('hidden');
    }
    
    // Auto-Speak in flashcard mode
    setTimeout(() => speak(currentWord.word), 150);
  }
  
  // 2. RENDER CHOICE QUIZ
  else if (mode === 'choice') {
    document.getElementById('choice-question-word').textContent = currentWord.word;
    document.getElementById('choice-feedback').classList.add('hidden');
    
    // Generate options: 1 correct meaning, 3 distractors from other words in DB
    const options = [currentWord.meaning];
    const otherWords = state.words.filter(w => w.id !== currentWord.id);
    
    // Shuffle other words and take meanings as distractors
    shuffleArray(otherWords);
    for (let i = 0; i < Math.min(3, otherWords.length); i++) {
      options.push(otherWords[i].meaning);
    }
    
    // If we have less than 4 options (e.g. newly created DB), add dummy options
    while (options.length < 4) {
      options.push("임시 오답 보기 " + options.length);
    }
    
    shuffleArray(options);
    
    const container = document.getElementById('choice-options-container');
    container.innerHTML = '';
    
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'btn-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => handleChoiceAnswer(btn, opt, currentWord.meaning));
      container.appendChild(btn);
    });
    
    // Speak word
    setTimeout(() => speak(currentWord.word), 150);
  }
  
  // 3. RENDER GAP-FILL QUIZ
  else if (mode === 'gapfill') {
    document.getElementById('gapfill-feedback').classList.add('hidden');
    
    // Get expression list for current word
    let parsedExps = [];
    try { parsedExps = JSON.parse(currentWord.expressions || '[]'); } catch(e) {}
    
    const warningText = "이 단어는 학습 가능한 빈칸 채우기 예문이 없습니다. 다른 단어로 진행하거나 모드를 변경해 주세요.";
    const sentenceDisp = document.getElementById('gapfill-question-sentence');
    const transDisp = document.getElementById('gapfill-question-translation');
    const container = document.getElementById('gapfill-options-container');
    container.innerHTML = '';
    
    if (parsedExps.length === 0) {
      sentenceDisp.textContent = warningText;
      transDisp.textContent = "";
      
      // Provide a skip button or fallback option
      const skipBtn = document.createElement('button');
      skipBtn.className = 'btn-option text-center';
      skipBtn.textContent = "예문 퀴즈 건너뛰기";
      skipBtn.addEventListener('click', () => advanceStudySession());
      container.appendChild(skipBtn);
      return;
    }
    
    // Choose the first expression for quiz
    const quizExp = parsedExps[0];
    const originalExpr = quizExp.ori;
    
    // Replace current word with a blank in the sentence
    const wordRegex = new RegExp(`\\b${currentWord.word}\\b`, 'gi');
    let sentenceWithBlank = originalExpr.replace(wordRegex, '[____]');
    
    // Fallback if word is part of a phrase or spelling slightly differs
    if (sentenceWithBlank === originalExpr) {
      // Split target word by spaces, replace first occurrence
      const firstWord = currentWord.word.split(' ')[0];
      const fallbackRegex = new RegExp(`\\b${firstWord}\\w*\\b`, 'i');
      sentenceWithBlank = originalExpr.replace(fallbackRegex, '[____]');
    }
    
    sentenceDisp.innerHTML = sentenceWithBlank;
    transDisp.textContent = quizExp.trans;
    
    // Distractor options: English words from other vocabulary items
    const options = [currentWord.word];
    const otherWords = state.words.filter(w => w.id !== currentWord.id);
    shuffleArray(otherWords);
    for (let i = 0; i < Math.min(3, otherWords.length); i++) {
      options.push(otherWords[i].word);
    }
    
    while (options.length < 4) {
      options.push("word_" + options.length);
    }
    
    shuffleArray(options);
    
    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'btn-option';
      btn.textContent = opt;
      btn.addEventListener('click', () => handleGapfillAnswer(btn, opt, currentWord.word));
      container.appendChild(btn);
    });
  }
}

// Update ProgressBar display
function updateSessionProgressBar(current, total) {
  const percent = total > 0 ? (current / total) * 100 : 0;
  document.getElementById('session-progress-fill').style.width = `${percent}%`;
  document.getElementById('session-progress-text').textContent = `단어 학습: ${current + 1} / ${total}`;
  document.getElementById('session-score-text').textContent = `정답: ${state.sessionScores.correct} / ${state.sessionScores.total}`;
}

// Handle Flashcard Action buttons
async function handleStudyAnswer(isCorrect) {
  const currentWord = state.currentSessionWords[state.currentSessionIndex];
  
  // Track scores
  state.sessionScores.total++;
  if (isCorrect) state.sessionScores.correct++;
  
  // Save Log
  await saveQuizLog(currentWord.id, currentWord.word, isCorrect ? 'Correct' : 'Incorrect', 'Flashcard');
  
  advanceStudySession();
}

// Handle Choice Quiz Answer click
async function handleChoiceAnswer(selectedBtn, selectedText, correctText) {
  const currentWord = state.currentSessionWords[state.currentSessionIndex];
  const buttons = document.querySelectorAll('#choice-options-container .btn-option');
  const feedback = document.getElementById('choice-feedback');
  
  // Disable all buttons to prevent double-tap
  buttons.forEach(btn => btn.disabled = true);
  
  const isCorrect = selectedText === correctText;
  state.sessionScores.total++;
  
  if (isCorrect) {
    state.sessionScores.correct++;
    selectedBtn.classList.add('correct');
    feedback.textContent = "🎉 정답입니다!";
    feedback.className = "quiz-feedback correct";
  } else {
    selectedBtn.classList.add('incorrect');
    // Highlight correct button
    buttons.forEach(btn => {
      if (btn.textContent === correctText) {
        btn.classList.add('correct');
      }
    });
    
    // Shake card on incorrect answer
    const quizCard = document.querySelector('#study-choice-view .quiz-card');
    quizCard.classList.add('shake');
    setTimeout(() => quizCard.classList.remove('shake'), 400);
    
    feedback.textContent = "😢 틀렸습니다. 다시 한번 외워보세요!";
    feedback.className = "quiz-feedback incorrect";
  }
  
  feedback.classList.remove('hidden');
  
  // Save log
  await saveQuizLog(currentWord.id, currentWord.word, isCorrect ? 'Correct' : 'Incorrect', 'Choice');
  
  // Wait 1.5 seconds and advance
  setTimeout(() => {
    advanceStudySession();
  }, 1500);
}

// Handle Gap-fill Quiz Answer click
async function handleGapfillAnswer(selectedBtn, selectedText, correctText) {
  const currentWord = state.currentSessionWords[state.currentSessionIndex];
  const buttons = document.querySelectorAll('#gapfill-options-container .btn-option');
  const feedback = document.getElementById('gapfill-feedback');
  
  buttons.forEach(btn => btn.disabled = true);
  
  const isCorrect = selectedText.toLowerCase() === correctText.toLowerCase();
  state.sessionScores.total++;
  
  if (isCorrect) {
    state.sessionScores.correct++;
    selectedBtn.classList.add('correct');
    feedback.textContent = "🎉 완벽한 매칭입니다!";
    feedback.className = "quiz-feedback correct";
  } else {
    selectedBtn.classList.add('incorrect');
    buttons.forEach(btn => {
      if (btn.textContent.toLowerCase() === correctText.toLowerCase()) {
        btn.classList.add('correct');
      }
    });
    
    const quizCard = document.querySelector('#study-gapfill-view .quiz-card');
    quizCard.classList.add('shake');
    setTimeout(() => quizCard.classList.remove('shake'), 400);
    
    feedback.textContent = `😢 정답은 '${correctText}' 입니다.`;
    feedback.className = "quiz-feedback incorrect";
  }
  
  feedback.classList.remove('hidden');
  
  await saveQuizLog(currentWord.id, currentWord.word, isCorrect ? 'Correct' : 'Incorrect', 'GapFill');
  
  setTimeout(() => {
    advanceStudySession();
  }, 1800);
}

// Advance to next word in the active study list
function advanceStudySession() {
  state.currentSessionIndex++;
  if (state.currentSessionIndex < state.currentSessionWords.length) {
    renderStudySessionCurrentCard();
  } else {
    // Session completed
    showToast("🎉 이번 학습 세션을 모두 마쳤습니다!");
    
    // Display results in study view
    const warningView = document.getElementById('study-warning-view');
    const flashcardView = document.getElementById('study-flashcard-view');
    const choiceView = document.getElementById('study-choice-view');
    const gapfillView = document.getElementById('study-gapfill-view');
    
    [flashcardView, choiceView, gapfillView].forEach(v => v.classList.add('hidden'));
    warningView.classList.remove('hidden');
    
    document.getElementById('study-warning-message').innerHTML = `
      학습 결과: <strong>${state.sessionScores.correct}개 정답</strong> / ${state.sessionScores.total}개 평가<br>
      정답률: ${state.sessionScores.total > 0 ? Math.round((state.sessionScores.correct / state.sessionScores.total)*100) : 0}%
    `;
    document.getElementById('btn-go-add').textContent = "새 세션 시작하기";
    document.getElementById('btn-go-add').onclick = () => {
      document.getElementById('btn-go-add').textContent = "단어 추가하러 가기";
      document.getElementById('btn-go-add').onclick = () => {
        document.querySelector('[data-tab="tab-add"]').click();
      };
      startNewStudySession();
    };
    
    updateSessionProgressBar(state.currentSessionWords.length - 1, state.currentSessionWords.length);
  }
}

// Write a quiz record, update the word counts and statuses
async function saveQuizLog(wordId, wordText, result, quizType) {
  const timestamp = new Date().toISOString();
  const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
  
  const logObj = {
    id: logId,
    word_id: wordId,
    word: wordText,
    result: result,
    quiz_type: quizType,
    timestamp: timestamp
  };
  
  // Add to state
  state.logs.push(logObj);
  
  // Update Word Stats inside state
  const wordIdx = state.words.findIndex(w => w.id === wordId);
  if (wordIdx > -1) {
    let correct = parseInt(state.words[wordIdx].correct_count || 0);
    let incorrect = parseInt(state.words[wordIdx].incorrect_count || 0);
    
    if (result === 'Correct') {
      correct++;
    } else {
      incorrect++;
    }
    
    state.words[wordIdx].correct_count = correct;
    state.words[wordIdx].incorrect_count = incorrect;
    state.words[wordIdx].last_reviewed = timestamp;
    
    // Recalculate status
    const total = correct + incorrect;
    const rate = correct / total;
    if (total >= 3 && rate >= 0.8) {
      state.words[wordIdx].status = 'Memorized';
    } else if (rate < 0.5) {
      state.words[wordIdx].status = 'Weak';
    } else {
      state.words[wordIdx].status = 'Learning';
    }
  }
  
  // Persist
  if (state.settings.mode === 'cloud' && state.settings.gasUrl) {
    try {
      await fetch(state.settings.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: JSON.stringify({ action: 'addLog', log: logObj })
      });
    } catch (e) {
      console.error("GAS addLog failed, saving locally:", e);
      await persistLocalDatabase();
    }
  } else {
    await persistLocalDatabase();
  }
}

// --- STATS & WORDLIST VIEW (TAB 3) ---

// Render Dashboard Statistics
function renderStats() {
  const total = state.words.length;
  let memorized = 0;
  let learning = 0;
  let weak = 0;
  
  state.words.forEach(w => {
    if (w.status === 'Memorized') memorized++;
    else if (w.status === 'Weak') weak++;
    else learning++;
  });
  
  document.getElementById('stats-count-total').textContent = total;
  document.getElementById('stats-count-memorized').textContent = memorized;
  document.getElementById('stats-count-learning').textContent = learning;
  document.getElementById('stats-count-weak').textContent = weak;
  
  // Progress circular bar
  const percent = total > 0 ? Math.round((memorized / total) * 100) : 0;
  document.getElementById('stats-percent-text').textContent = `${percent}%`;
  
  // SVG Stroke animation calculation
  // Radius r=50, circumference = 2 * PI * r = 314.16
  const circle = document.getElementById('stats-progress-bar');
  const circumference = 314.16;
  const offset = circumference - (percent / 100) * circumference;
  circle.style.strokeDashoffset = offset;
}

// Render Word List items
function renderWordList() {
  const container = document.getElementById('word-list-container');
  const emptyState = document.getElementById('list-empty-state');
  const searchVal = document.getElementById('search-word-input').value.toLowerCase().trim();
  const filterStatus = document.getElementById('filter-status-select').value;
  
  // Filter lists
  let filtered = [...state.words];
  
  if (filterStatus !== 'all') {
    filtered = filtered.filter(w => w.status === filterStatus);
  }
  
  if (searchVal) {
    filtered = filtered.filter(w => 
      w.word.toLowerCase().includes(searchVal) || 
      w.meaning.toLowerCase().includes(searchVal) ||
      w.nuance.toLowerCase().includes(searchVal)
    );
  }
  
  // Sort: Newest words first
  filtered.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  
  container.innerHTML = '';
  
  if (filtered.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  
  emptyState.classList.add('hidden');
  
  filtered.forEach(w => {
    const card = document.createElement('div');
    card.className = 'word-row-card';
    
    card.innerHTML = `
      <div class="word-row-header">
        <div class="word-title-group">
          <span class="status-dot ${w.status}"></span>
          <span class="word-row-title">${w.word}</span>
        </div>
        <span class="material-symbols-outlined word-row-expand-arrow">expand_more</span>
      </div>
      <div class="word-row-meaning">${w.meaning}</div>
      
      <div class="word-row-detail hidden">
        <div class="detail-section">
          <span class="detail-section-title">의미</span>
          <div class="detail-text">${w.meaning}</div>
        </div>
        
        ${w.nuance ? `
        <div class="detail-section">
          <span class="detail-section-title">뉘앙스 / 나만의 메모</span>
          <div class="detail-text">${w.nuance}</div>
        </div>` : ''}
        
        ${renderSynonymsListForDetail(w.synonyms)}
        
        ${renderExpressionsListForDetail(w.expressions, w.word)}
        
        <div class="detail-section">
          <span class="detail-section-title">학습 지표</span>
          <div class="detail-stats">
            <span>정답: <strong>${w.correct_count}회</strong></span>
            <span>오답: <strong>${w.incorrect_count}회</strong></span>
            <span>정답률: <strong>${calculateRate(w.correct_count, w.incorrect_count)}%</strong></span>
          </div>
        </div>
        
        <div class="detail-actions">
          <button class="btn-detail-action" onclick="speak('${w.word.replace(/'/g, "\\'")}'); event.stopPropagation();">
            <span class="material-symbols-outlined">volume_up</span>
            <span>듣기</span>
          </button>
          <button class="btn-detail-action edit-btn">
            <span class="material-symbols-outlined">edit</span>
            <span>수정</span>
          </button>
          <button class="btn-detail-action delete delete-btn">
            <span class="material-symbols-outlined">delete</span>
            <span>삭제</span>
          </button>
        </div>
      </div>
    `;
    
    // Toggle card expansion
    card.addEventListener('click', (e) => {
      // Don't expand if click was on action buttons
      if (e.target.closest('.detail-actions') || e.target.closest('.btn-detail-action')) return;
      
      const detail = card.querySelector('.word-row-detail');
      const isExpanded = card.classList.toggle('expanded');
      
      if (isExpanded) {
        detail.classList.remove('hidden');
      } else {
        detail.classList.add('hidden');
      }
    });
    
    // Edit action
    card.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      editWordItem(w);
    });
    
    // Delete action
    card.querySelector('.delete-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteWordItem(w.id, w.word);
    });
    
    container.appendChild(card);
  });
}

// Synonyms helper for list detail
function renderSynonymsListForDetail(synonymsStr) {
  let syns = [];
  try { syns = JSON.parse(synonymsStr || '[]'); } catch(e) {}
  if (syns.length === 0) return '';
  
  return `
    <div class="detail-section">
      <span class="detail-section-title">유사어 (Synonyms)</span>
      <div class="detail-badge-list">
        ${syns.map(s => `<span class="badge small">${s}</span>`).join('')}
      </div>
    </div>
  `;
}

// Expressions helper for list detail
function renderExpressionsListForDetail(expressionsStr, wordText) {
  let exps = [];
  try { exps = JSON.parse(expressionsStr || '[]'); } catch(e) {}
  if (exps.length === 0) return '';
  
  return `
    <div class="detail-section">
      <span class="detail-section-title">많이 활용되는 표현</span>
      <div class="card-expression-list">
        ${exps.map(exp => `
          <div class="card-expression-item">
            <div class="ori">${highlightQuery(exp.ori, wordText)}</div>
            <div class="trans">${exp.trans}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function calculateRate(correct, incorrect) {
  const c = parseInt(correct || 0);
  const inc = parseInt(incorrect || 0);
  const total = c + inc;
  if (total === 0) return 0;
  return Math.round((c / total) * 100);
}

// Edit word action
function editWordItem(wordObj) {
  // Switch to Tab 1
  document.querySelector('[data-tab="tab-add"]').click();
  
  // Fill inputs
  document.getElementById('input-word').value = wordObj.word;
  document.getElementById('input-meaning').value = wordObj.meaning;
  document.getElementById('input-nuance').value = wordObj.nuance;
  
  // Trigger dictionary search to fetch details
  document.getElementById('btn-search-dict').click();
  
  showToast(`'${wordObj.word}' 수정을 시작합니다.`);
}

// Delete word action
async function deleteWordItem(wordId, wordText) {
  if (!confirm(`'${wordText}' 단어를 정말 삭제하시겠습니까?`)) return;
  
  showToast("단어를 삭제하는 중...");
  
  // Delete from state
  state.words = state.words.filter(w => w.id !== wordId);
  
  // Persist
  if (state.settings.mode === 'cloud' && state.settings.gasUrl) {
    try {
      const res = await fetch(state.settings.gasUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: JSON.stringify({ action: 'deleteWord', id: wordId })
      });
      if (res.ok) {
        showToast("구글 시트에서 삭제 완료!");
      } else {
        throw new Error();
      }
    } catch(e) {
      console.error(e);
      showToast("구글 시트 삭제 실패. 로컬에 동기화되었습니다.");
      await persistLocalDatabase();
    }
  } else {
    await persistLocalDatabase();
    showToast("단어 삭제 완료!");
  }
  
  renderStats();
  renderWordList();
}

// Search input bindings
document.getElementById('search-word-input').addEventListener('input', renderWordList);
document.getElementById('filter-status-select').addEventListener('change', renderWordList);

// --- SETTINGS MODULE (TAB 4) ---
function initSettingsPanel() {
  const modeRadios = document.querySelectorAll('input[name="app-mode"]');
  const cloudPanel = document.getElementById('cloud-config-panel');
  const gasUrlInput = document.getElementById('input-gas-url');
  const syncBtn = document.getElementById('btn-cloud-sync');
  const resetBtn = document.getElementById('btn-reset-data');
  const exportBtn = document.getElementById('btn-export-backup');
  
  // Set UI from loaded state
  if (state.settings.mode === 'cloud') {
    document.getElementById('mode-cloud').checked = true;
    cloudPanel.classList.remove('hidden');
  } else {
    document.getElementById('mode-local').checked = true;
    cloudPanel.classList.add('hidden');
  }
  
  gasUrlInput.value = state.settings.gasUrl || '';
  
  // Radio change listener
  modeRadios.forEach(radio => {
    radio.addEventListener('change', async (e) => {
      state.settings.mode = e.target.value;
      saveLocalSettings();
      updateSyncStatusIndicator();
      
      if (state.settings.mode === 'cloud') {
        cloudPanel.classList.remove('hidden');
      } else {
        cloudPanel.classList.add('hidden');
        // Reload local DB
        await loadDatabase();
        renderStats();
        renderWordList();
      }
    });
  });
  
  // GAS URL input listener
  gasUrlInput.addEventListener('input', () => {
    state.settings.gasUrl = gasUrlInput.value.trim();
    saveLocalSettings();
    updateSyncStatusIndicator();
  });
  
  // Sync Button click
  syncBtn.addEventListener('click', runCloudSync);
  
  // Export backup JSON
  exportBtn.addEventListener('click', () => {
    const backupData = {
      words: state.words,
      logs: state.logs,
      exported_at: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `vocaflow_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("백업 다운로드 완료!");
  });
  
  // Reset database
  resetBtn.addEventListener('click', async () => {
    if (!confirm("⚠️ 주의: 모든 단어장 및 퀴즈 결과가 초기화됩니다. 이 작업은 되돌릴 수 없습니다. 진행하시겠습니까?")) return;
    
    state.words = [];
    state.logs = [];
    
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEYS.WORDS);
    localStorage.removeItem(STORAGE_KEYS.LOGS);
    
    // Clear local server file DB
    if (state.isLocalServerActive) {
      await persistLocalDatabase();
    }
    
    showToast("모든 데이터가 초기화되었습니다.");
    renderStats();
    renderWordList();
    startNewStudySession();
  });
}

// Two-way sync: Merge Client localStorage & Cloud Spreadsheet
async function runCloudSync() {
  if (!state.settings.gasUrl) {
    showToast("Google Apps Script 웹 앱 URL이 입력되지 않았습니다.");
    return;
  }
  
  const syncBtn = document.getElementById('btn-cloud-sync');
  syncBtn.disabled = true;
  syncBtn.innerHTML = '<span class="material-symbols-outlined rotating">sync</span> <span>동기화 중...</span>';
  
  showToast("구글 시트와 동기화 중...");
  
  try {
    const response = await fetch(state.settings.gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      body: JSON.stringify({
        action: 'sync',
        words: state.words,
        logs: state.logs
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.success) {
        state.words = result.words;
        state.logs = result.logs;
        
        // Cache merged data locally
        localStorage.setItem(STORAGE_KEYS.WORDS, JSON.stringify(state.words));
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(state.logs));
        
        if (state.isLocalServerActive) {
          // Keep server.py file database matched too!
          await persistLocalDatabase();
        }
        
        showToast("✅ 구글 시트 양방향 동기화 완료!");
      } else {
        throw new Error(result.error || "Sync error");
      }
    } else {
      throw new Error("HTTP response error");
    }
  } catch (e) {
    console.error("Cloud Sync Failed:", e);
    showToast("❌ 동기화 실패. 주소를 확인하거나 잠시 후 다시 시도해 주세요.");
  } finally {
    syncBtn.disabled = false;
    syncBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> <span>양방향 동기화 실행</span>';
    renderStats();
    renderWordList();
    startNewStudySession();
  }
}

// --- VOICE TTS UTILITIES ---
function speak(text) {
  if (!text) return;
  
  // Stop existing speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  
  // Prefer English natural voices if available
  const voices = window.speechSynthesis.getVoices();
  const enVoice = voices.find(voice => voice.lang.startsWith('en') && voice.name.toLowerCase().includes('google'));
  if (enVoice) {
    utterance.voice = enVoice;
  }
  
  window.speechSynthesis.speak(utterance);
}

// Browser TTS voices load trigger
if (window.speechSynthesis.onvoiceschanged !== undefined) {
  window.speechSynthesis.onvoiceschanged = () => {
    // preload voices
  };
}

// --- UTILITIES ---
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Show feedback message in a float toast
function showToast(message) {
  const toast = document.getElementById('toast-notification');
  const toastMsg = document.getElementById('toast-message');
  
  toastMsg.textContent = message;
  toast.classList.remove('hidden');
  
  // Clear any existing timeout
  if (toast.timeoutId) {
    clearTimeout(toast.timeoutId);
  }
  
  toast.timeoutId = setTimeout(() => {
    toast.classList.add('hidden');
  }, 2500);
}
