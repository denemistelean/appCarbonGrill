import { Injectable, signal } from '@angular/core';

export interface ToastData {
  message: string;
  type: 'success' | 'error' | 'info';
  show: boolean;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  // Estado reactivo del toast
  toastState = signal<ToastData>({ message: '', type: 'info', show: false });

  show(message: string, type: 'success' | 'error' | 'info' = 'success') {
    this.toastState.set({ message, type, show: true });
    
    // Ocultar automáticamente a los 3 segundos
    setTimeout(() => {
      this.close();
    }, 3500);
  }

  close() {
    this.toastState.update(current => ({ ...current, show: false }));
  }
}