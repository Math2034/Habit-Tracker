/* ═══════════════════════════════════════
   HABITFLOW — script.js
   CRUD · LocalStorage · Streak · Kanban
═══════════════════════════════════════ */

// ─── CONFIG ─────────────────────────────
// EMOJIS: list of icons the user can pick when creating a habit.
// Kept simple (single codepoint emojis) to avoid rendering issues across browsers.
// Compound emojis like ✍️ or 🏋️ use invisible variant selectors that break some fonts.
const EMOJIS = ['🧘','🏃','📚','💧','🥗','💪','🎯','🎨','🎸','🌿','😴','🧠','💊','🚴','🧹','📝','🌅','🍎','⭐','🔑'];

// CATEGORIES: labels that help the user organize habits by area of life.
const CATEGORIES = ['Health', 'Focus', 'Fitness', 'Mindset', 'Learning', 'Routine', 'Nutrition'];

// STORAGE_KEY: the key used to read/write habits in localStorage.
// Using a specific key avoids collisions if other apps use the same browser storage.
const STORAGE_KEY = 'habitflow_habits';

// TODAY: current date in YYYY-MM-DD format.
// Used to check if a habit was completed today and to calculate streaks.
// toISOString() returns UTC, so .slice(0, 10) gives us just the date part.
const TODAY = new Date().toISOString().slice(0, 10);

// ─── STATE ──────────────────────────────
// habits: the main array that holds all habit objects in memory.
// Every change updates this array first, then persists it to localStorage.
let habits = [];

// editingId: tracks which habit is being edited in the modal.
// null means the modal is in "create" mode. An id means "edit" mode.
let editingId = null;

// selectedEmoji / selectedCategory: temporary state for the modal form.
// Updated when the user clicks an emoji or category button.
let selectedEmoji = EMOJIS[0];
let selectedCategory = CATEGORIES[0];

// ─── LOCALSTORAGE ───────────────────────

// load(): reads habits from localStorage and parses the JSON string back into an array.
// The try/catch handles cases where the stored data is corrupted or unreadable.
// The filter removes any habits with missing or too-short names — a safety net
// against entries that may have been saved incorrectly in earlier versions.
function load() {
  try {
    habits = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    habits = habits.filter(h => h.name && h.name.trim().length >= 2);
  }
  catch { habits = []; }
}

// save(): serializes the habits array to a JSON string and writes it to localStorage.
// Called after every change (create, update, delete, toggle) to keep storage in sync.
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
}

// ─── HELPERS ────────────────────────────

// uid(): generates a unique id for each new habit.
// Combines the current timestamp (base36) with a random suffix to avoid collisions.
// Not cryptographically secure, but more than enough for a local app.
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// todayDone(): returns true if the habit has been marked as done today.
// Checks if TODAY's date string exists inside the habit's doneHistory array.
function todayDone(h) {
  return h.doneHistory && h.doneHistory.includes(TODAY);
}

// calcStreak(): counts how many consecutive days a habit has been completed,
// ending on today (or yesterday if not yet done today).
// Logic: starts from today and walks backwards one day at a time.
// Stops as soon as it finds a day that isn't in doneHistory.
// The Set removes duplicate dates in case the same day was somehow saved twice.
// Capped at 365 iterations to avoid infinite loops.
function calcStreak(h) {
  if (!h.doneHistory || h.doneHistory.length === 0) return 0;
  const sorted = [...new Set(h.doneHistory)].sort().reverse();
  let streak = 0;
  let cursor = new Date();

  // If today not in history, start checking from yesterday
  if (!h.doneHistory.includes(TODAY)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  for (let i = 0; i < 365; i++) {
    const d = cursor.toISOString().slice(0, 10);
    if (sorted.includes(d)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

// bestStreak(): scans all habits and returns the highest streak among them.
// Uses reduce() to iterate the array and keep track of the maximum value found.
function bestStreak() {
  return habits.reduce((max, h) => Math.max(max, calcStreak(h)), 0);
}

// ─── RENDER ─────────────────────────────

// render(): the main UI update function. Called after every state change.
// Splits habits into two groups (todo/done) based on today's completion status,
// updates the stats bar and progress fill, then delegates card rendering to renderList().
// This approach rebuilds the DOM from scratch on every render — simple and reliable,
// though not the most performant for very large lists.
function render() {
  const todo = habits.filter(h => !todayDone(h));
  const done = habits.filter(h => todayDone(h));

  // Stats
  document.getElementById('statTotal').textContent = habits.length;
  document.getElementById('statDone').textContent = done.length;
  document.getElementById('statBestStreak').textContent = bestStreak();
  const pct = habits.length ? Math.round((done.length / habits.length) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = pct + '%';

  // Counters
  document.getElementById('countTodo').textContent = todo.length;
  document.getElementById('countDone').textContent = done.length;

  // Lists
  renderList('listTodo', todo);
  renderList('listDone', done);
}

// renderList(): builds and injects the habit cards into a kanban column.
// If the list is empty, shows a placeholder message instead.
// Each card is created with createElement (not innerHTML for the whole card)
// so event listeners can be attached directly to the elements — avoiding
// issues with inline onclick handlers and keeping concerns separated.
function renderList(containerId, list) {
  const el = document.getElementById(containerId);
  el.innerHTML = '';

  if (list.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">${containerId === 'listDone' ? '✓' : '○'}</div>
        ${containerId === 'listDone' ? 'No habits completed today' : 'All habits done!'}
      </div>`;
    return;
  }

  list.forEach(h => {
    const done = todayDone(h);
    const streak = calcStreak(h);
    const card = document.createElement('div');
    card.className = 'habit-card' + (done ? ' is-done' : '');
    card.dataset.id = h.id;
    card.innerHTML = `
      <div class="habit-check" title="Mark as done">
        <span class="habit-check-icon">✓</span>
      </div>
      <div class="habit-content">
        <div class="habit-top">
          <span class="habit-emoji">${h.emoji}</span>
          <span class="habit-name">${h.name}</span>
        </div>
        <div class="habit-meta">
          <span class="habit-category">${h.category}</span>
          ${streak > 0 ? `<span class="habit-streak">${streak} day${streak > 1 ? 's' : ''}</span>` : ''}
        </div>
      </div>
      <div class="habit-actions">
        <button class="btn-icon edit" title="Edit">✎</button>
        <button class="btn-icon delete" title="Delete">✕</button>
      </div>`;

    // stopPropagation() prevents the card's content click from also firing
    // when the user clicks the checkbox — avoiding a double toggle.
    card.querySelector('.habit-check').addEventListener('click', e => {
      e.stopPropagation();
      toggleDone(h.id);
    });

    // Clicking the name/emoji area also toggles the habit for convenience.
    card.querySelector('.habit-content').addEventListener('click', () => toggleDone(h.id));

    card.querySelector('.btn-icon.edit').addEventListener('click', e => {
      e.stopPropagation();
      openEdit(h.id);
    });
    card.querySelector('.btn-icon.delete').addEventListener('click', e => {
      e.stopPropagation();
      deleteHabit(h.id);
    });

    el.appendChild(card);
  });
}

// ─── TOGGLE DONE ────────────────────────

// toggleDone(): marks or unmarks a habit as completed for today.
// If TODAY is already in doneHistory, it removes it (unmark).
// If not, it adds it and recalculates the streak to show in the toast.
// Always calls save() and render() to persist and reflect the change.
function toggleDone(id) {
  const h = habits.find(x => x.id === id);
  if (!h) return;
  h.doneHistory = h.doneHistory || [];
  if (h.doneHistory.includes(TODAY)) {
    h.doneHistory = h.doneHistory.filter(d => d !== TODAY);
    showToast('Unmarked ↩');
  } else {
    h.doneHistory.push(TODAY);
    const streak = calcStreak(h);
    showToast(streak > 1 ? `🔥 ${streak} days in a row!` : '✓ Habit completed!');
  }
  save();
  render();
}

// ─── CRUD ───────────────────────────────

// createHabit(): adds a new habit object to the habits array.
// Each habit has a unique id, a name, an emoji, a category,
// an empty doneHistory array, and a createdAt date.
// doneHistory is the key field — it stores every date the habit was completed.
function createHabit(name, emoji, category) {
  habits.push({
    id: uid(),
    name: name.trim(),
    emoji,
    category,
    doneHistory: [],
    createdAt: TODAY
  });
}

// updateHabit(): finds an existing habit by id and updates its fields.
// Does not touch doneHistory or createdAt — only the user-editable fields.
function updateHabit(id, name, emoji, category) {
  const h = habits.find(x => x.id === id);
  if (!h) return;
  h.name = name.trim();
  h.emoji = emoji;
  h.category = category;
}

// deleteHabit(): removes a habit from the array by filtering it out.
// filter() returns a new array without the deleted item, which replaces habits.
function deleteHabit(id) {
  habits = habits.filter(x => x.id !== id);
  save();
  render();
  showToast('Habit removed');
}

// ─── MODAL ──────────────────────────────

// openModal(): opens the create/edit modal.
// If an id is passed, pre-fills the form with that habit's data (edit mode).
// If no id, resets the form to defaults (create mode).
// editingId is set here so handleSave() knows which mode it's in.
function openModal(id = null) {
  editingId = id;
  const h = id ? habits.find(x => x.id === id) : null;

  document.getElementById('modalTitle').textContent = id ? 'Edit Habit' : 'New Habit';
  document.getElementById('inputName').value = h ? h.name : '';
  selectedEmoji = h ? h.emoji : EMOJIS[0];
  selectedCategory = h ? h.category : CATEGORIES[0];

  buildEmojiGrid();
  buildCategoryGrid();

  document.getElementById('modalOverlay').classList.add('open');

  // Small delay before focusing so the CSS transition finishes first.
  setTimeout(() => document.getElementById('inputName').focus(), 200);
}

// closeModal(): hides the modal by removing the 'open' class.
// Also resets editingId to null so the next open starts in create mode.
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
  editingId = null;
}

// openEdit(): shorthand that calls openModal with an id.
// Exists to make event listeners more readable.
function openEdit(id) { openModal(id); }

// buildEmojiGrid(): dynamically renders the emoji picker inside the modal.
// Clears the grid and recreates all buttons each time the modal opens,
// so the selected state always reflects the current habit being edited.
function buildEmojiGrid() {
  const grid = document.getElementById('emojiGrid');
  grid.innerHTML = '';
  EMOJIS.forEach(em => {
    const btn = document.createElement('button');
    btn.className = 'emoji-btn' + (em === selectedEmoji ? ' selected' : '');
    btn.textContent = em;
    btn.addEventListener('click', () => {
      selectedEmoji = em;
      grid.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    grid.appendChild(btn);
  });
}

// buildCategoryGrid(): same pattern as buildEmojiGrid() but for categories.
// Rebuilds the buttons each time the modal opens to reflect the correct selected state.
function buildCategoryGrid() {
  const grid = document.getElementById('categoryGrid');
  grid.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'cat-btn' + (cat === selectedCategory ? ' selected' : '');
    btn.textContent = cat;
    btn.addEventListener('click', () => {
      selectedCategory = cat;
      grid.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    grid.appendChild(btn);
  });
}

// handleSave(): runs when the user clicks Save in the modal.
// Validates the input first — blocks empty fields and names under 2 characters.
// Intentionally allows numbers and any characters in the name:
// the app can't know if a name is "meaningful" — that's the user's choice.
// If editingId is set, updates the existing habit. Otherwise, creates a new one.
function handleSave() {
  const inputEl = document.getElementById('inputName');
  const name = inputEl.value.trim();

  if (!name || name.trim().length < 2) {
    inputEl.focus();
    inputEl.style.borderColor = 'var(--red)';
    inputEl.style.boxShadow = '0 0 0 3px rgba(248,113,113,0.15)';
    const msg = (!name || name.length < 2)
      ? 'Name must be at least 2 characters'
      : 'Only letters, numbers and spaces allowed';
    showToast('Warning: ' + msg);
    setTimeout(() => {
      inputEl.style.borderColor = '';
      inputEl.style.boxShadow = '';
    }, 1500);
    return;
  }
  if (editingId) {
    updateHabit(editingId, name, selectedEmoji, selectedCategory);
    showToast('✎ Habit updated');
  } else {
    createHabit(name, selectedEmoji, selectedCategory);
    showToast('✦ Habit created!');
  }
  save();
  render();
  closeModal();
}

// ─── TOAST ──────────────────────────────

// showToast(): displays a short feedback message at the bottom of the screen.
// Adds the 'show' class to trigger a CSS transition, then removes it after 2.4s.
// clearTimeout() cancels any previous toast timer so rapid actions don't stack up.
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ─── TODAY LABEL ────────────────────────

// setTodayLabel(): formats and displays today's date in the header.
// toLocaleDateString() with 'en-US' returns something like "Sun, Feb 22".
// .toUpperCase() gives it a cleaner, more stylized look in the UI.
function setTodayLabel() {
  const d = new Date();
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  document.getElementById('todayLabel').textContent =
    d.toLocaleDateString('en-US', opts).replace('.', '').toUpperCase();
}

// ─── EVENTS ─────────────────────────────
// Attaching all event listeners here at the bottom keeps them organized
// and ensures the DOM is fully parsed before we try to access elements.

document.getElementById('btnOpenModal').addEventListener('click', () => openModal());
document.getElementById('btnCloseModal').addEventListener('click', closeModal);
document.getElementById('btnCancel').addEventListener('click', closeModal);
document.getElementById('btnSave').addEventListener('click', handleSave);

// Clicking outside the modal (on the overlay) also closes it.
document.getElementById('modalOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('modalOverlay')) closeModal();
});

// Keyboard shortcuts: Escape closes the modal, Ctrl/Cmd+Enter saves.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleSave();
});

// ─── INIT ───────────────────────────────
// Entry point: load saved data, set the date label, and render the UI.
load();
setTodayLabel();
render();