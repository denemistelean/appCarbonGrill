import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loader-camion',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="d-flex flex-column align-items-center justify-content-center w-100 animate__animated animate__fadeIn" [ngStyle]="{'min-height': minHeight}">
        <div class="position-relative mb-4">
            <div class="position-absolute top-50 start-50 translate-middle" style="width: 140px; height: 140px; background: rgba(56, 189, 248, 0.15); filter: blur(40px); z-index: 0; border-radius: 50%;"></div>
            
            <svg class="truck-icon-swal position-relative z-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 100px; height: 100px; color: var(--erp-primary);">
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
        </div>

        <h4 class="fw-bold text-center" style="color: var(--erp-text); letter-spacing: 0.5px;">{{ mensaje }}</h4>
        <p class="text-muted mt-1 text-center">{{ submensaje }}</p>
        
        <div class="progress mt-3" style="width: 220px; height: 4px; border-radius: 4px; background-color: var(--erp-border-soft);">
            <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 100%; background: linear-gradient(90deg, var(--erp-primary), var(--erp-accent));"></div>
        </div>
    </div>
  `
})
export class LoaderCamionComponent {
  @Input() mensaje: string = 'Cargando...';
  @Input() submensaje: string = 'Por favor espere un momento...';
  @Input() minHeight: string = '65vh'; // Por defecto ocupa casi toda la pantalla
}