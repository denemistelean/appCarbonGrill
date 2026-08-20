import { Component, inject } from '@angular/core';
import { CommonModule, DOCUMENT } from '@angular/common'; // 🔥 IMPORTA DOCUMENT AQUÍ
import { AppTheme, LayoutService } from '../../services/layout.service';

@Component({
  selector: 'app-settings-panel',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './settings-panel.html',
  styleUrls: ['./settings-panel.scss']
})
export class SettingsPanel {
  layoutService = inject(LayoutService);
  private document = inject(DOCUMENT); // 🔥 INYECTA DOCUMENT AQUÍ DE FORMA SEGURA

  // Variable para controlar qué botón se ilumina en el panel
  currentBtnStyle: 'soft' | 'dashed' = 'soft';

  get themes() { return this.layoutService.themes; }
  get currentTheme() { return this.layoutService.activeTheme(); }

  setDarkMode(isDark: boolean) {
    if (this.layoutService.darkMode() !== isDark) {
      this.layoutService.toggleDarkMode();
    }
  }

  selectTheme(theme: AppTheme) {
    this.layoutService.setTheme(theme.id);
  }

  // 🔥 NUEVA FUNCIÓN CORREGIDA
  setBtnStyle(style: 'soft' | 'dashed') {
    this.currentBtnStyle = style; // Actualiza la vista de Angular
    
    // Modifica el body usando el document inyectado
    if (style === 'dashed') {
      this.document.body.classList.add('btn-style-dashed');
      this.document.body.classList.remove('btn-style-soft');
    } else {
      this.document.body.classList.add('btn-style-soft');
      this.document.body.classList.remove('btn-style-dashed');
    }
  }
}