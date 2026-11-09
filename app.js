const storageKey = 'codex-setup-guide-progress-v1';
const mobileLayout = window.matchMedia('(max-width:680px)');
const tableOfContents = document.querySelector('.toc');
tableOfContents.open = !mobileLayout.matches;
mobileLayout.addEventListener('change', event => { tableOfContents.open = !event.matches; });
const checks = [...document.querySelectorAll('input[data-check]')];
const counter = document.querySelector('#count');
const meter = document.querySelector('#meter');
const storageNote = document.querySelector('#storage-note');
let saved = {};
let messageTimer;
function announce(text) {
  document.querySelector('#message').textContent = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => { document.querySelector('#message').textContent = ''; }, 5000);
}
try {
  const value = JSON.parse(localStorage.getItem(storageKey) || '{}');
  if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
} catch {
  storageNote.textContent = 'Не удалось прочитать сохранение. Новые отметки попробуем сохранить.';
}
function update() {
  const done = checks.filter(check => check.checked).length;
  counter.textContent = `${done} из ${checks.length}`;
  meter.max = checks.length;
  meter.value = done;
  meter.setAttribute('aria-valuetext', `${done} из ${checks.length} проверок отмечено`);
}
function persist() {
  const state = Object.fromEntries(checks.map(check => [check.dataset.check, check.checked]));
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
    storageNote.textContent = 'Отметки сохраняются в этом браузере. Это твой чек-лист, а не автоматический аудит.';
  } catch {
    storageNote.textContent = 'Хранилище недоступно. Отметки сохранятся только до закрытия страницы.';
  }
  update();
}
checks.forEach(check => {
  check.checked = saved[check.dataset.check] === true;
  check.addEventListener('change', persist);
});
document.querySelectorAll('.snippet').forEach((snippet, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'copy';
  button.textContent = 'Копировать';
  button.setAttribute('aria-label', `Копировать: ${snippet.querySelector('.snippet-head').textContent.trim()}`);
  snippet.querySelector('.snippet-head').append(button);
  button.addEventListener('click', async () => {
    const code = snippet.querySelector('code');
    try {
      await navigator.clipboard.writeText(code.textContent);
      announce('Скопировано. Вставь текст в указанное место: чат Codex или терминал.');
    } catch {
      code.id ||= `snippet-${index}`;
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      announce('Браузер запретил копирование. Текст выделен: нажми Ctrl+C.');
    }
  });
});
document.querySelector('#reset').addEventListener('click', () => {
  if (!window.confirm('Сбросить все отметки этой инструкции в текущем браузере?')) return;
  checks.forEach(check => { check.checked = false; });
  persist();
  announce('Отметки сброшены.');
});
update();
