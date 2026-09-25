// Web Worker：所有辫群规范形复核计算都在此线程执行，
// 主线程只负责输入收集与渲染，保证交互不被阻塞。
import { analyzeRecords } from './engine.js';

self.onmessage = (ev) => {
  const { id, n, a, b } = ev.data || {};
  try {
    const result = analyzeRecords(n, a, b);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      result: {
        status: 'invalid',
        errors: [{
          record: 'A',
          kind: error.kind || 'internal',
          index: typeof error.index === 'number' ? error.index : 0,
          message: error.message || String(error),
        }],
      },
    });
  }
};
