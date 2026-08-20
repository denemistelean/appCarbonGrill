import { Injectable, signal } from '@angular/core';
import Swal from 'sweetalert2';

export interface Toast {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  
  toastState = signal<Toast>({ show: false, message: '', type: 'info' });
  private timeoutRef: any;

  constructor() { }

  toast(message: string, type: 'success' | 'error' | 'info' | 'warning' = 'info') {
    if (this.timeoutRef) clearTimeout(this.timeoutRef);
    this.toastState.set({ show: true, message, type });
    this.timeoutRef = setTimeout(() => { this.hideToast(); }, 6000);
  }

  hideToast() {
    this.toastState.update(current => ({ ...current, show: false }));
  }

  success(message: string) { this.toast(message, 'success'); }
  error(message: string) { this.toast(message, 'error'); }
  warning(message: string) { this.toast(message, 'warning'); }

  // 🔥 AQUÍ ESTÁ LA MAGIA: Inyectamos tus clases ERP globales
  async confirmDelete(title: string, text: string): Promise<boolean> {
    const result = await Swal.fire({
      title, text, icon: 'warning',
      showCancelButton: true, 
      confirmButtonText: '<i class="bi bi-trash3-fill me-2"></i> Sí, eliminar', 
      cancelButtonText: 'Cancelar',
      customClass: { 
        popup: 'swal2-popup', 
        confirmButton: 'btn btn-danger',          // Tu clase roja premium
        cancelButton: 'btn btn-soft-neutral'      // Tu clase gris suave
      },
      buttonsStyling: false,
      reverseButtons: true // Pone Cancelar a la izq y Eliminar a la derecha
    });
    return result.isConfirmed;
  }

  // 🔥 AQUÍ TAMBIÉN
  async confirmAction(title: string, text: string, confirmText: string = 'Sí'): Promise<boolean> {
    const result = await Swal.fire({
      title, text, icon: 'question',
      showCancelButton: true, 
      confirmButtonText: confirmText, 
      cancelButtonText: 'Cancelar',
      customClass: { 
        popup: 'swal2-popup', 
        confirmButton: 'btn btn-primary',         // Tu clase azul corporativa
        cancelButton: 'btn btn-soft-neutral'      // Tu clase gris suave
      },
      buttonsStyling: false,
      reverseButtons: true
    });
    return result.isConfirmed;
  }

  // ==========================================================
  // 🔥 LOADER ANIMADO GLOBAL
  // ==========================================================
  showLoading(mensaje: string = 'Procesando...') {
    Swal.fire({
      html: SWEET_ALERT_TRUCK_LOADER(mensaje), 
      showConfirmButton: false,
      allowOutsideClick: false,
      background: 'transparent',
      customClass: { popup: 'swal-premium-glass' }
    });
  }

  closeLoading() {
    Swal.close();
  }
}

// =========================================================================
// 🚛 PLANTILLA HTML CRUDA (Obligatoria para que SweetAlert la entienda)
// =========================================================================
const SWEET_ALERT_TRUCK_LOADER = (mensaje: string) => `
  <div class="d-flex flex-column align-items-center justify-content-center py-4">
    <svg class="truck-icon-swal mb-3" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 70px; height: 70px; color: var(--erp-primary);">
      <g stroke-width="2" opacity="0.6">
          <line class="speed-line" x1="-4" y1="12" x2="2" y2="12"></line>
          <line class="speed-line sl-2" x1="-6" y1="16" x2="0" y2="16"></line>
          <line class="speed-line sl-3" x1="-2" y1="8" x2="4" y2="8"></line>
      </g>
      <rect x="2" y="4" width="13" height="12" rx="2"></rect>
      <path d="M15 9h3.5a2 2 0 0 1 1.9 1.4l1.5 3.6a2 2 0 0 1 .1.9V16h-7V9z"></path>
      <path d="M15 13h6"></path>
      <circle cx="6.5" cy="18.5" r="2.5" fill="currentColor"></circle>
      <circle cx="18.5" cy="18.5" r="2.5" fill="currentColor"></circle>
    </svg>
    <h5 class="fw-bold m-0" style="color: var(--erp-text); letter-spacing: 0.5px;">${mensaje}</h5>
    <small class="text-muted mt-1">Por favor espere un momento...</small>
  </div>
`;