// yml形式での保存・読込を担当するモジュール
// File System Access API を優先して使用し、非対応ブラウザではダウンロード/アップロードにフォールバックする

const supportsFSAccess = 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;

let currentFileHandle = null;

export function hasFileHandle() {
  return currentFileHandle !== null;
}

export function clearFileHandle() {
  currentFileHandle = null;
}

function downloadYaml(yamlText) {
  const blob = new Blob([yamlText], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mindmap.yml';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function uploadYaml() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yml,.yaml,text/yaml';
    input.addEventListener(
      'change',
      async () => {
        const file = input.files && input.files[0];
        if (!file) {
          resolve({ ok: false, aborted: true });
          return;
        }
        const text = await file.text();
        resolve({ ok: true, text, method: 'upload' });
      },
      { once: true }
    );
    input.click();
  });
}

export async function saveYaml(yamlText, { forceNewFile = false } = {}) {
  if (supportsFSAccess) {
    try {
      if (!currentFileHandle || forceNewFile) {
        currentFileHandle = await window.showSaveFilePicker({
          suggestedName: 'mindmap.yml',
          types: [{ description: 'YAML', accept: { 'text/yaml': ['.yml', '.yaml'] } }],
        });
      }
      const writable = await currentFileHandle.createWritable();
      await writable.write(yamlText);
      await writable.close();
      return { ok: true, method: 'fs-access' };
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, aborted: true };
      // showSaveFilePicker が使えない環境・エラー時はダウンロードにフォールバック
    }
  }
  downloadYaml(yamlText);
  return { ok: true, method: 'download' };
}

export async function openYaml() {
  if (supportsFSAccess) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'YAML', accept: { 'text/yaml': ['.yml', '.yaml'] } }],
      });
      const file = await handle.getFile();
      const text = await file.text();
      currentFileHandle = handle;
      return { ok: true, text, method: 'fs-access' };
    } catch (err) {
      if (err && err.name === 'AbortError') return { ok: false, aborted: true };
      // フォールバック
    }
  }
  return uploadYaml();
}
