
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertService } from '../../../core/services/ui/alert.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-container" 
         [class.show]="alertService.toastState().show"
         [class.success]="alertService.toastState().type === 'success'"
         [class.error]="alertService.toastState().type === 'error'"
         [class.info]="alertService.toastState().type === 'info'"
         [class.warning]="alertService.toastState().type === 'warning'">
      
      <div class="icon">
        @if (alertService.toastState().type === 'success') { <i class="bi bi-check-circle-fill"></i> }
        @if (alertService.toastState().type === 'error') { <i class="bi bi-x-circle-fill"></i> }
        @if (alertService.toastState().type === 'info') { <i class="bi bi-info-circle-fill"></i> }
        @if (alertService.toastState().type === 'warning') { <i class="bi bi-exclamation-triangle-fill"></i> }
      </div>

      <div class="message">
        {{ alertService.toastState().message }}
      </div>

      <button class="close-btn" (click)="alertService.hideToast()">
        <i class="bi bi-x"></i>
      </button>
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      top: 20px;
      right: 20px;
      background: white;
      padding: 12px 20px;
      border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.15); /* Sombra más suave */
      display: flex;
      align-items: center;
      gap: 15px;
      z-index: 9999;
      min-width: 300px;
      max-width: 400px;
      
      /* --- ANIMACIÓN DE MOVIMIENTO --- */
      transform: translateX(120%); /* Empieza fuera de la pantalla (derecha) */
      opacity: 0;
      /* Efecto de rebote suave al entrar */
      transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      
      border-left: 5px solid transparent;
    }

    /* ESTADO VISIBLE */
    .toast-container.show {
      transform: translateX(0); /* Se mueve a su posición original */
      opacity: 1;
    }
    
    /* COLORES SEGÚN TIPO */
    .toast-container.success { border-left-color: #10b981; .icon i { color: #10b981; } }
    .toast-container.error { border-left-color: #ef4444; .icon i { color: #ef4444; } }
    .toast-container.info { border-left-color: #3b82f6; .icon i { color: #3b82f6; } }
    .toast-container.warning { border-left-color: #f59e0b; .icon i { color: #f59e0b; } }

    /* ICONO */
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.4rem;
    }

    /* MENSAJE */
    .message {
      flex-grow: 1;
      font-weight: 500;
      color: #333;
      font-size: 0.85rem;
      line-height: 1.4;
    }

    /* BOTÓN CERRAR */
    .close-btn {
      background: none;
      border: none;
      color: #aaa;
      font-size: 1.2rem;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      transition: all 0.2s ease; /* TRANSICIÓN PARA EL MOVIMIENTO */
    }
    
    /* EFECTO DE MOVIMIENTO AL PASAR EL RATÓN */
    .close-btn:hover {
      color: #333;
      transform: rotate(90deg) scale(1.1); /* Rota 90 grados y crece un poco */
    }

    /* MODO OSCURO */
    :host-context(.dark-mode) .toast-container {
      background-color: #1e293b;
      box-shadow: 0 10px 30px rgba(0,0,0,0.4);
    }
    :host-context(.dark-mode) .message {
      color: #f1f5f9;
    }
  `]
})
export class ToastComponent {
  alertService = inject(AlertService);
}