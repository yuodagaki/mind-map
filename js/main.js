import { MindMapStore, createDefaultState, parseYamlToState, BASIC_COLORS } from './mindmap.js';
import { render, startEditingNode } from './render.js';
import { saveYaml, openYaml, clearFileHandle } from './file-io.js';

const viewport = document.getElementById('viewport');
const canvasContent = document.getElementById('canvas-content');
const nodesLayer = document.getElementById('nodes-layer');
const svg = document.getElementById('connections');
const statusEl = document.getElementById('status');

const newMapBtn = document.getElementById('new-map-btn');
const openBtn = document.getElementById('open-btn');
const saveBtn = document.getElementById('save-btn');
const saveAsBtn = document.getElementById('save-as-btn');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const addChildBtn = document.getElementById('add-child-btn');
const editBtn = document.getElementById('edit-btn');
const duplicateBtn = document.getElementById('duplicate-btn');
const deleteBtn = document.getElementById('delete-btn');
const bgColorInput = document.getElementById('bg-color-input');
const textColorInput = document.getElementById('text-color-input');
const bgPaletteEl = document.getElementById('bg-palette');
const textPaletteEl = document.getElementById('text-palette');

let selectedId = null;
const pan = { x: 0, y: 0 };
let zoom = 1;

const store = new MindMapStore(createDefaultState(), () => renderAll());
selectedId = store.rootId;

function getViewportCenter() {
  const rect = viewport.getBoundingClientRect();
  return { x: rect.width / 2, y: rect.height / 2 };
}

function applyTransform() {
  const center = getViewportCenter();
  canvasContent.style.transform = `translate(${center.x + pan.x}px, ${center.y + pan.y}px) scale(${zoom})`;
}

function screenToCanvas(clientX, clientY) {
  const rect = viewport.getBoundingClientRect();
  const center = getViewportCenter();
  const vx = clientX - rect.left;
  const vy = clientY - rect.top;
  return {
    x: (vx - center.x - pan.x) / zoom,
    y: (vy - center.y - pan.y) / zoom,
  };
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.className = isError ? 'text-sm text-red-600' : 'text-sm text-slate-500';
  clearTimeout(showStatus._timer);
  showStatus._timer = setTimeout(() => {
    statusEl.textContent = '';
  }, 3000);
}

function renderAll() {
  render(store.state, {
    selectedId,
    nodesLayer,
    svg,
    handlers: {
      onTextCommit: (nodeId, text) => store.updateText(nodeId, text),
      onAddChild: (parentId) => handleAddChild(parentId),
      onDeleteNode: (nodeId) => handleDelete(nodeId),
      onNodeMouseDown: (e, nodeId) => startNodeDrag(e, nodeId),
      onToggleCollapse: (nodeId) => store.toggleCollapse(nodeId),
    },
  });
  const selectedNode = store.findNode(selectedId);
  if (selectedNode) {
    bgColorInput.value = selectedNode.color;
    textColorInput.value = selectedNode.textColor;
  }
}

function selectNode(nodeId) {
  selectedId = nodeId;
  renderAll();
}

function handleAddChild(parentId = selectedId) {
  const newNode = store.createChild(parentId);
  if (newNode) {
    selectedId = newNode.id;
    renderAll();
  }
}

function handleDelete(nodeId = selectedId) {
  if (nodeId === store.rootId) {
    showStatus('ルートノードは削除できません', true);
    return;
  }
  const parent = store.findParent(nodeId);
  const ok = store.deleteNode(nodeId);
  if (ok) {
    selectedId = parent ? parent.id : store.rootId;
    renderAll();
  }
}

function handleDuplicate(nodeId = selectedId) {
  if (nodeId === store.rootId) {
    showStatus('ルートノードは複製できません', true);
    return;
  }
  const clone = store.duplicateNode(nodeId);
  if (clone) {
    selectedId = clone.id;
    renderAll();
  }
}

// --- ノードのドラッグ(移動・付け替え) ---

let dragState = null;

function startNodeDrag(e, nodeId) {
  selectNode(nodeId);
  const node = store.findNode(nodeId);
  if (!node) return;
  dragState = {
    nodeId,
    startMouse: screenToCanvas(e.clientX, e.clientY),
    startPos: { ...node.position },
    moved: false,
    interactionStarted: false,
  };
  window.addEventListener('mousemove', onNodeDragMove);
  window.addEventListener('mouseup', onNodeDragEnd);
}

function onNodeDragMove(e) {
  if (!dragState) return;
  const cur = screenToCanvas(e.clientX, e.clientY);
  const dx = cur.x - dragState.startMouse.x;
  const dy = cur.y - dragState.startMouse.y;
  if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragState.moved = true;
  if (!dragState.interactionStarted) {
    // ドラッグ(位置の変化)が実際に発生した時点で初めてundo履歴を1件積む
    store.beginInteraction();
    dragState.interactionStarted = true;
  }
  store.moveNode(dragState.nodeId, {
    x: dragState.startPos.x + dx,
    y: dragState.startPos.y + dy,
  });
}

function onNodeDragEnd(e) {
  window.removeEventListener('mousemove', onNodeDragMove);
  window.removeEventListener('mouseup', onNodeDragEnd);
  if (!dragState) return;
  const { nodeId, moved } = dragState;
  dragState = null;
  if (!moved) return;

  const el = document.elementFromPoint(e.clientX, e.clientY);
  const targetEl = el ? el.closest('[data-node-id]') : null;
  if (targetEl && targetEl.dataset.nodeId !== nodeId) {
    store.reparentNode(nodeId, targetEl.dataset.nodeId);
  }
}

// --- キャンバスのパン・ズーム ---

let panState = null;

viewport.addEventListener('mousedown', (e) => {
  if (e.target.closest('[data-node-id]')) return;
  panState = { startX: e.clientX - pan.x, startY: e.clientY - pan.y };
  window.addEventListener('mousemove', onPanMove);
  window.addEventListener('mouseup', onPanEnd);
});

function onPanMove(e) {
  if (!panState) return;
  pan.x = e.clientX - panState.startX;
  pan.y = e.clientY - panState.startY;
  applyTransform();
}

function onPanEnd() {
  panState = null;
  window.removeEventListener('mousemove', onPanMove);
  window.removeEventListener('mouseup', onPanEnd);
}

viewport.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    zoom = Math.min(3, Math.max(0.2, zoom * factor));
    applyTransform();
  },
  { passive: false }
);

window.addEventListener('resize', applyTransform);

// --- ツールバー ---

newMapBtn.addEventListener('click', () => {
  if (!confirm('編集中の内容は破棄されます。新規作成しますか？')) return;
  store.setState(createDefaultState());
  clearFileHandle();
  selectedId = store.rootId;
  pan.x = 0;
  pan.y = 0;
  zoom = 1;
  applyTransform();
  renderAll();
});

openBtn.addEventListener('click', async () => {
  const result = await openYaml();
  if (!result.ok) {
    if (!result.aborted) showStatus('読み込みに失敗しました', true);
    return;
  }
  try {
    const newState = parseYamlToState(result.text);
    store.setState(newState);
    selectedId = store.rootId;
    renderAll();
    showStatus('読み込みました');
  } catch (err) {
    showStatus(`読み込みエラー: ${err.message}`, true);
  }
});

saveBtn.addEventListener('click', async () => {
  const yaml = store.toYaml();
  const result = await saveYaml(yaml);
  if (result.ok) showStatus('保存しました');
  else if (!result.aborted) showStatus('保存に失敗しました', true);
});

saveAsBtn.addEventListener('click', async () => {
  const yaml = store.toYaml();
  const result = await saveYaml(yaml, { forceNewFile: true });
  if (result.ok) showStatus('名前を付けて保存しました');
  else if (!result.aborted) showStatus('保存に失敗しました', true);
});

undoBtn.addEventListener('click', () => store.undo());
redoBtn.addEventListener('click', () => store.redo());

addChildBtn.addEventListener('click', () => handleAddChild());
editBtn.addEventListener('click', () => startEditingNode(selectedId));
duplicateBtn.addEventListener('click', () => handleDuplicate());
deleteBtn.addEventListener('click', () => handleDelete());

bgColorInput.addEventListener('change', () => {
  store.setColor(selectedId, bgColorInput.value);
});

textColorInput.addEventListener('change', () => {
  store.setTextColor(selectedId, textColorInput.value);
});

function buildPalette(container, onPick) {
  for (const color of BASIC_COLORS) {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.title = color;
    swatch.style.backgroundColor = color;
    swatch.className =
      'w-5 h-5 rounded-full border border-slate-300 shadow-sm hover:scale-110 transition-transform';
    swatch.addEventListener('click', () => onPick(color));
    container.appendChild(swatch);
  }
}

buildPalette(bgPaletteEl, (color) => store.setColor(selectedId, color));
buildPalette(textPaletteEl, (color) => store.setTextColor(selectedId, color));

// --- キーボードショートカット ---

document.addEventListener('keydown', (e) => {
  const active = document.activeElement;
  if (active && active.isContentEditable) {
    // IME変換確定のEnter(isComposing、またはIME変換中を示すkeyCode 229)は編集確定として扱わない
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
      e.preventDefault();
      active.blur();
    }
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    handleAddChild();
  } else if (e.key === 'Delete') {
    e.preventDefault();
    handleDelete();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    e.preventDefault();
    store.redo();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    saveBtn.click();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
    e.preventDefault();
    handleDuplicate();
  }
});

applyTransform();
renderAll();
