import { createAppController } from './controller.js';

export async function bootstrapApp() {
  const controller = createAppController();
  await controller.init();
  window.BaccaratPro = controller;
}
