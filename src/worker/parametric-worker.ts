import { createOpenSCAD } from 'openscad-wasm';

self.onmessage = async (event) => {
  const { id, type, data } = event.data;
  try {
    const instance = await createOpenSCAD();

    let result = null;
    switch (type) {
      case 'preview':
      case 'export':
        const stlContent = await instance.renderToStl(data.code);
        result = {
          output: new TextEncoder().encode(stlContent),
          fileType: 'stl',
        };
        break;
    }

    self.postMessage({ id, type, data: result });
  } catch (err) {
    self.postMessage({ id, type, data: null, err: (err as Error).message });
  }
};