/* UI improvements; undo is limited to the latest operation in this session. */
let undoRecord = null;
let scoreActionBusy = false;
const catalogEditing = { behavior: false, reward: false };

function refreshUndoButton() {
    const button = document.getElementById('undo-score');
    if (!button) return;
    button.disabled = scoreActionBusy || !undoRecord;
    button.textContent = undoRecord ? '↶ 撤銷：' + undoRecord.label : '↶ 撤銷上一個計分';
}

async function undoLastScore() {
    if (!undoRecord || scoreActionBusy) return;
    const record = undoRecord;
    if (record.changes.some(c => {
        const s = students.find(s => s.id === c.id);
        return !s || s.currentPoints !== c.after.currentPoints || s.lifetimePoints !== c.after.lifetimePoints;
    })) {
        undoRecord = null; refreshUndoButton();
        alert('分數已經有其他修改，不能撤銷這次操作。'); return;
    }
    scoreActionBusy = true; undoRecord = null; refreshUndoButton();
    try {
        record.changes.forEach(c => {
            const s = students.find(s => s.id === c.id);
            const delta = c.before.currentPoints - s.currentPoints;
            s.currentPoints = c.before.currentPoints;
            s.lifetimePoints = c.before.lifetimePoints;
            addLog(s.name, '撤銷：' + record.label, delta);
        });
        renderAll(); await saveData();
    } finally { scoreActionBusy = false; refreshUndoButton(); }
}

function wrapScoreAction(original, label) {
    return async function(...args) {
        if (scoreActionBusy) return;
        scoreActionBusy = true; refreshUndoButton();
        const before = students.map(s => ({ id:s.id, currentPoints:s.currentPoints, lifetimePoints:s.lifetimePoints }));
        try {
            await original(...args);
            const changes = before.flatMap(old => {
                const s = students.find(s => s.id === old.id);
                return s && (s.currentPoints !== old.currentPoints || s.lifetimePoints !== old.lifetimePoints)
                    ? [{id:s.id,before:old,after:{currentPoints:s.currentPoints,lifetimePoints:s.lifetimePoints}}] : [];
            });
            if (changes.length) undoRecord = { label, changes };
        } finally { scoreActionBusy = false; refreshUndoButton(); }
    };
}
quickPoint = wrapScoreAction(quickPoint, '快速加扣分');
quickAll = wrapScoreAction(quickAll, '全班加分');
applyBehavior = wrapScoreAction(applyBehavior, '項目計分');
redeemReward = wrapScoreAction(redeemReward, '獎勵兌換');

function decorateCatalog(type) {
    const grid = document.getElementById(type === 'behavior' ? 'behavior-grid' : 'store-grid');
    const list = type === 'behavior' ? behaviors : rewards;
    const editing = catalogEditing[type];
    grid.classList.toggle('catalog-editing', editing);
    [...grid.children].forEach((card, i) => {
        const item = list[i];
        card.draggable = editing;
        card.dataset.itemId = String(item.id);
        card.dataset.kind = type === 'behavior' ? item.type : 'reward';
        const summary = document.createElement('div'); summary.className = 'catalog-summary';
        const icon = document.createElement('div'); icon.className = 'catalog-summary-icon'; icon.textContent = item.icon;
        const title = document.createElement('strong'); title.textContent = item.title;
        const value = document.createElement('p'); value.textContent = type === 'behavior' ? (item.value > 0 ? '+' : '') + item.value + ' 分' : item.cost + ' 點';
        summary.append(icon,title,value); card.prepend(summary);
        card.querySelectorAll('input,select').forEach(input => {
            input.setAttribute('aria-label', item.title + ' ' + (input.dataset.field || ''));
            input.addEventListener('input', () => {
                card.dataset.dirty = 'true';
                card.querySelector('.catalog-hint').textContent = '尚未儲存 · 請按「儲存修改」';
            });
        });
    });
}
const originalRenderBehaviors = renderBehaviors, originalRenderStore = renderStore;
function renderCatalogWithDrafts(type, render) {
    const grid = document.getElementById(type === 'behavior' ? 'behavior-grid' : 'store-grid');
    const drafts = [...grid.children].map((card,i) => card.dataset.dirty === 'true' ? {id:card.dataset.itemId, values:[...card.querySelectorAll('input,select')].map(x=>x.value)} : null).filter(Boolean);
    render(); decorateCatalog(type);
    drafts.forEach(({id,values}) => {
        const card=[...grid.children].find(card=>card.dataset.itemId===id); if (!card) return;
        card.dataset.dirty='true';
        card.querySelectorAll('input,select').forEach((input,j)=>input.value=values[j]);
        card.querySelector('.catalog-hint').textContent='尚未儲存 · 請按「儲存修改」';
    });
}
renderBehaviors = function() { renderCatalogWithDrafts('behavior', originalRenderBehaviors); };
renderStore = function() { renderCatalogWithDrafts('reward', originalRenderStore); };

function toggleCatalogEditing(type, button) {
    const grid = document.getElementById(type === 'behavior' ? 'behavior-grid' : 'store-grid');
    if (grid.querySelector('[data-dirty="true"]') && !confirm('還有未儲存的修改，要放棄這些修改嗎？')) return;
    grid.querySelectorAll('[data-dirty]').forEach(card=>delete card.dataset.dirty);
    catalogEditing[type] = !catalogEditing[type];
    button.textContent = catalogEditing[type] ? '完成編輯' : '編輯項目／排序';
    button.setAttribute('aria-pressed', String(catalogEditing[type]));
    (type === 'behavior' ? renderBehaviors : renderStore)();
}

window.addEventListener('DOMContentLoaded', () => {
    const toolbar = document.querySelector('#tab-tracker .toolbar');
    const fileControls = toolbar.querySelectorAll('.btn-group')[1];
    document.querySelector('#tab-roster .toolbar').append(fileControls);
    const undo = document.createElement('button'); undo.id = 'undo-score'; undo.className = 'btn btn-outline'; undo.onclick = undoLastScore;
    toolbar.querySelector('.btn-group').append(undo); refreshUndoButton();
    for (const type of ['behavior','reward']) {
        const grid = document.getElementById(type === 'behavior' ? 'behavior-grid' : 'store-grid');
        const bar = document.createElement('div'); bar.className = 'catalog-mode-bar';
        const hint = document.createElement('span'); hint.textContent = '按「編輯項目／排序」修改名稱、分數或拖曳次序。';
        const button = document.createElement('button'); button.className = 'btn btn-outline'; button.textContent = '編輯項目／排序'; button.setAttribute('aria-pressed','false'); button.onclick = () => toggleCatalogEditing(type, button);
        bar.append(hint,button); grid.before(bar);
    }
    const status = document.getElementById('sync-text'); status.setAttribute('role','status'); status.setAttribute('aria-live','polite');
    renderBehaviors(); renderStore();
});
window.addEventListener('beforeunload', e => {
    if (document.querySelector('[data-dirty="true"]')) { e.preventDefault(); e.returnValue = ''; }
});
