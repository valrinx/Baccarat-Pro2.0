import { createAppController } from './controller.js';

export function bootstrapApp() {
  const controller = createAppController();
  controller.init();
  window.BaccaratPro = controller;
}
