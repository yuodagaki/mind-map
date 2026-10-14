// ノードのツリー構造を保持・操作する状態管理モジュール

const PALETTE = [
  '#fde68a', // amber-200
  '#bfdbfe', // blue-200
  '#bbf7d0', // green-200
  '#fecaca', // red-200
  '#ddd6fe', // violet-200
  '#fed7aa', // orange-200
  '#99f6e4', // teal-200
  '#fbcfe8', // pink-200
];

const DEFAULT_TEXT_COLOR = '#1e293b'; // slate-800

// カラーピッカーに添える基本色パレット(背景色・文字色の両方で共用)
export const BASIC_COLORS = [
  '#000000',
  '#ffffff',
  '#64748b', // slate
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#a855f7', // purple
  '#ec4899', // pink
];

let idCounter = 0;

export function generateId() {
  idCounter += 1;
  return `node-${Date.now()}-${idCounter}`;
}

export function createDefaultState() {
  return {
    root: {
      id: generateId(),
      text: '中心テーマ',
      color: PALETTE[0],
      textColor: DEFAULT_TEXT_COLOR,
      position: { x: 0, y: 0 },
      collapsed: false,
      children: [],
    },
  };
}

function walk(node, parent, callback) {
  callback(node, parent);
  for (const child of node.children) {
    walk(child, node, callback);
  }
}

function cloneSubtree(node, dx, dy) {
  return {
    id: generateId(),
    text: node.text,
    color: node.color,
    textColor: node.textColor,
    position: { x: node.position.x + dx, y: node.position.y + dy },
    collapsed: node.collapsed,
    children: node.children.map((child) => cloneSubtree(child, dx, dy)),
  };
}

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('ノードの形式が不正です');
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    text: raw.text != null ? String(raw.text) : '',
    color: typeof raw.color === 'string' && raw.color ? raw.color : PALETTE[0],
    textColor: typeof raw.textColor === 'string' && raw.textColor ? raw.textColor : DEFAULT_TEXT_COLOR,
    position: {
      x: Number(raw.position && raw.position.x) || 0,
      y: Number(raw.position && raw.position.y) || 0,
    },
    collapsed: Boolean(raw.collapsed),
    children: Array.isArray(raw.children) ? raw.children.map(normalizeNode) : [],
  };
}

export function parseYamlToState(text) {
  const data = window.jsyaml.load(text);
  if (!data || !data.root) {
    throw new Error('不正なyml形式です(root が見つかりません)');
  }
  return { root: normalizeNode(data.root) };
}

export function stateToYaml(state) {
  return window.jsyaml.dump(state);
}

export class MindMapStore {
  constructor(state, onChange) {
    this.state = state;
    this.onChange = onChange;
    this.undoStack = [];
    this.redoStack = [];
  }

  _snapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  _pushUndo() {
    this.undoStack.push(this._snapshot());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
  }

  _commit() {
    this.onChange(this.state);
  }

  get rootId() {
    return this.state.root.id;
  }

  findNode(id) {
    let result = null;
    walk(this.state.root, null, (node) => {
      if (node.id === id) result = node;
    });
    return result;
  }

  findParent(id) {
    let result = null;
    walk(this.state.root, null, (node, parent) => {
      if (node.id === id) result = parent;
    });
    return result;
  }

  isDescendant(ancestorId, candidateId) {
    const ancestor = this.findNode(ancestorId);
    if (!ancestor) return false;
    let found = false;
    walk(ancestor, null, (node) => {
      if (node.id === candidateId) found = true;
    });
    return found;
  }

  beginInteraction() {
    this._pushUndo();
  }

  createChild(parentId, text = '新しいノード') {
    const parent = this.findNode(parentId);
    if (!parent) return null;
    this._pushUndo();
    const index = parent.children.length;
    const newNode = {
      id: generateId(),
      text,
      color: PALETTE[idCounter % PALETTE.length],
      textColor: DEFAULT_TEXT_COLOR,
      position: {
        x: parent.position.x + 220,
        y: parent.position.y + index * 90 - ((parent.children.length) * 45),
      },
      collapsed: false,
      children: [],
    };
    parent.children.push(newNode);
    parent.collapsed = false; // 折りたたみ中に子を追加したら展開して見えるようにする
    this._commit();
    return newNode;
  }

  updateText(id, text) {
    const node = this.findNode(id);
    if (!node) return;
    this._pushUndo();
    node.text = text;
    this._commit();
  }

  setColor(id, color) {
    const node = this.findNode(id);
    if (!node) return;
    this._pushUndo();
    node.color = color;
    this._commit();
  }

  setTextColor(id, color) {
    const node = this.findNode(id);
    if (!node) return;
    this._pushUndo();
    node.textColor = color;
    this._commit();
  }

  moveNode(id, position) {
    const node = this.findNode(id);
    if (!node) return;
    node.position = position;
    this._commit();
  }

  // 折りたたみ状態はビュー上の一時的な見せ方なのでundo履歴には積まない
  toggleCollapse(id) {
    const node = this.findNode(id);
    if (!node) return;
    node.collapsed = !node.collapsed;
    this._commit();
  }

  expandAncestors(id) {
    let current = this.findParent(id);
    let changed = false;
    while (current) {
      if (current.collapsed) {
        current.collapsed = false;
        changed = true;
      }
      current = this.findParent(current.id);
    }
    if (changed) this._commit();
  }

  duplicateNode(id) {
    if (id === this.rootId) return null; // ルートは複製不可(ルートは単一前提のため)
    const node = this.findNode(id);
    const parent = this.findParent(id);
    if (!node || !parent) return null;
    this._pushUndo();
    const clone = cloneSubtree(node, 40, 40);
    const index = parent.children.indexOf(node);
    parent.children.splice(index + 1, 0, clone);
    this._commit();
    return clone;
  }

  deleteNode(id) {
    if (id === this.rootId) return false;
    const parent = this.findParent(id);
    if (!parent) return false;
    this._pushUndo();
    parent.children = parent.children.filter((c) => c.id !== id);
    this._commit();
    return true;
  }

  reparentNode(id, newParentId) {
    if (id === newParentId) return false;
    if (id === this.rootId) return false;
    if (this.isDescendant(id, newParentId)) return false;
    const node = this.findNode(id);
    const newParent = this.findNode(newParentId);
    const oldParent = this.findParent(id);
    if (!node || !newParent || !oldParent) return false;
    if (oldParent.id === newParent.id) return false;
    this._pushUndo();
    oldParent.children = oldParent.children.filter((c) => c.id !== id);
    newParent.children.push(node);
    this._commit();
    return true;
  }

  undo() {
    if (this.undoStack.length === 0) return;
    this.redoStack.push(this._snapshot());
    this.state = this.undoStack.pop();
    this._commit();
  }

  redo() {
    if (this.redoStack.length === 0) return;
    this.undoStack.push(this._snapshot());
    this.state = this.redoStack.pop();
    this._commit();
  }

  setState(newState) {
    this._pushUndo();
    this.state = newState;
    this._commit();
  }

  toYaml() {
    return stateToYaml(this.state);
  }
}
