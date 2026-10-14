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
      position: { x: 0, y: 0 },
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

function normalizeNode(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('ノードの形式が不正です');
  }
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : generateId(),
    text: raw.text != null ? String(raw.text) : '',
    color: typeof raw.color === 'string' && raw.color ? raw.color : PALETTE[0],
    position: {
      x: Number(raw.position && raw.position.x) || 0,
      y: Number(raw.position && raw.position.y) || 0,
    },
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
      position: {
        x: parent.position.x + 220,
        y: parent.position.y + index * 90 - ((parent.children.length) * 45),
      },
      children: [],
    };
    parent.children.push(newNode);
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

  moveNode(id, position) {
    const node = this.findNode(id);
    if (!node) return;
    node.position = position;
    this._commit();
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
