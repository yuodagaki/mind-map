// 状態(state)をもとにノードとSVG接続線を描画する

function collectNodes(root) {
  const result = [];
  (function visit(node, parent) {
    result.push({ node, parent });
    if (node.collapsed) return; // 折りたたみ中は子孫を描画しない
    for (const child of node.children) visit(child, node);
  })(root, null);
  return result;
}

function countDescendants(node) {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
}

function drawEdges(svg, pairs) {
  svg.innerHTML = '';
  for (const { node, parent } of pairs) {
    if (!parent) continue;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const x1 = parent.position.x;
    const y1 = parent.position.y;
    const x2 = node.position.x;
    const y2 = node.position.y;
    const mx = (x1 + x2) / 2;
    path.setAttribute('d', `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`);
    path.setAttribute('stroke', node.color || '#94a3b8');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    svg.appendChild(path);
  }
}

function selectAllText(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

const LINE_LENGTH = 20;

function splitIntoLines(text) {
  if (text.length === 0) return [''];
  const lines = [];
  for (let i = 0; i < text.length; i += LINE_LENGTH) {
    lines.push(text.slice(i, i + LINE_LENGTH));
  }
  return lines;
}

function renderLines(container, text) {
  container.innerHTML = '';
  for (const line of splitIntoLines(text)) {
    const lineEl = document.createElement('div');
    lineEl.className = 'whitespace-nowrap';
    lineEl.textContent = line;
    container.appendChild(lineEl);
  }
}

const EDIT_CLASSES = ['select-text', 'whitespace-nowrap', 'bg-white/80', 'ring-2', 'ring-blue-400', 'rounded', 'px-1'];

function attachEditing(textSpan, nodeId, fullText, handlers) {
  function restoreDisplay() {
    renderLines(textSpan, fullText);
  }

  function startEdit(e) {
    if (e) e.stopPropagation();
    if (textSpan.isContentEditable) return;
    let finished = false;
    textSpan.textContent = fullText;
    textSpan.contentEditable = 'true';
    textSpan.classList.add(...EDIT_CLASSES);
    textSpan.focus();
    selectAllText(textSpan);

    function cleanup() {
      textSpan.contentEditable = 'false';
      textSpan.classList.remove(...EDIT_CLASSES);
      textSpan.removeEventListener('keydown', onKeydown);
      textSpan.removeEventListener('blur', onBlur);
    }

    function onKeydown(ev) {
      if (ev.key === 'Escape' && !ev.isComposing && ev.keyCode !== 229) {
        ev.preventDefault();
        finished = true;
        cleanup();
        restoreDisplay();
        textSpan.blur();
      }
    }

    function onBlur() {
      if (finished) return;
      finished = true;
      cleanup();
      const newText = textSpan.textContent.trim();
      if (newText && newText !== fullText) {
        handlers.onTextCommit(nodeId, newText);
      } else {
        restoreDisplay();
      }
    }

    textSpan.addEventListener('keydown', onKeydown);
    textSpan.addEventListener('blur', onBlur);
  }

  return startEdit;
}

const editTriggers = new Map();

export function startEditingNode(nodeId) {
  const trigger = editTriggers.get(nodeId);
  if (trigger) trigger();
}

export function render(state, { selectedId, nodesLayer, svg, handlers, highlightedIds }) {
  const pairs = collectNodes(state.root);
  drawEdges(svg, pairs);

  nodesLayer.innerHTML = '';
  editTriggers.clear();
  const rootId = state.root.id;

  for (const { node } of pairs) {
    const el = document.createElement('div');
    el.className =
      'group absolute flex items-center px-4 py-2 rounded-xl shadow-md cursor-grab select-none border-2 active:cursor-grabbing';
    el.style.left = `${node.position.x}px`;
    el.style.top = `${node.position.y}px`;
    el.style.transform = 'translate(-50%, -50%)';
    el.style.backgroundColor = node.color;
    el.style.borderColor = node.id === selectedId ? '#1d4ed8' : 'transparent';
    el.style.boxShadow = highlightedIds && highlightedIds.has(node.id) ? '0 0 0 3px #facc15' : '';
    el.dataset.nodeId = node.id;

    const textSpan = document.createElement('div');
    textSpan.className = 'text-sm font-medium outline-none leading-snug';
    textSpan.style.color = node.textColor;
    renderLines(textSpan, node.text);
    el.appendChild(textSpan);
    const triggerEdit = attachEditing(textSpan, node.id, node.text, handlers);
    editTriggers.set(node.id, triggerEdit);

    if (node.collapsed && node.children.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'ml-2 text-xs text-slate-500 whitespace-nowrap';
      badge.textContent = `+${countDescendants(node)}`;
      el.appendChild(badge);
    }

    if (node.children.length > 0) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.title = node.collapsed ? '展開' : '折りたたみ';
      toggleBtn.textContent = node.collapsed ? '▸' : '▾';
      toggleBtn.className =
        'absolute -left-3 -bottom-3 w-6 h-6 rounded-full bg-slate-400 hover:bg-slate-500 text-white text-xs leading-none shadow flex items-center justify-center';
      toggleBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onToggleCollapse(node.id);
      });
      el.appendChild(toggleBtn);
    }

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.title = 'ノードを編集';
    editBtn.textContent = '✎';
    editBtn.className =
      'absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-slate-600 text-white text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity shadow flex items-center justify-center';
    editBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerEdit();
    });
    el.appendChild(editBtn);

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.title = '子ノードを追加 (Enter)';
    addBtn.textContent = '+';
    addBtn.className =
      'absolute -right-3 -top-3 w-6 h-6 rounded-full bg-blue-600 text-white text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity shadow flex items-center justify-center';
    addBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handlers.onAddChild(node.id);
    });
    el.appendChild(addBtn);

    if (node.id !== rootId) {
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.title = 'ノードを削除 (Delete)';
      delBtn.textContent = '×';
      delBtn.className =
        'absolute -left-3 -top-3 w-6 h-6 rounded-full bg-red-500 text-white text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity shadow flex items-center justify-center';
      delBtn.addEventListener('mousedown', (e) => e.stopPropagation());
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onDeleteNode(node.id);
      });
      el.appendChild(delBtn);
    }

    el.addEventListener('mousedown', (e) => {
      if (e.target.isContentEditable) return;
      e.stopPropagation();
      handlers.onNodeMouseDown(e, node.id);
    });
    el.addEventListener('click', (e) => e.stopPropagation());

    nodesLayer.appendChild(el);
  }
}
