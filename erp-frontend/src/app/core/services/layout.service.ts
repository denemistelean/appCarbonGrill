import { Injectable, signal, effect, inject, DOCUMENT } from '@angular/core';

export type BgStyle = 'neutral' | 'tinted' | 'deep';
export type RadiusStyle = 'sharp' | 'medium' | 'round'; // 📐 Geometría
export type GlassStyle = 'none' | 'soft' | 'strong';    // 🧊 Profundidad

export interface AppTheme {
  id: string;
  name: string; 
  type: 'corporate' | 'dual' | 'independent'; 
  colors: { 
    primary: string;    
    secondary: string;  
    tertiary: string;  
    quaternary: string; // Mantiene el 4to color para tu panel de ajustes
    success: string;    // 🔥 NUEVO: Verde Financiero
    danger: string;     // 🔥 NUEVO: Rojo Financiero
  };
}

@Injectable({ providedIn: 'root' })
export class LayoutService {
  private document = inject(DOCUMENT);

  sidebarOpen = signal(true);
  settingsOpen = signal(false);
  darkMode = signal<boolean>(localStorage.getItem('erp_dark_mode') === 'true');
  bgStyle = signal<BgStyle>((localStorage.getItem('erp_bg_style') as BgStyle) || 'neutral');
  
  // 🔥 SEÑALES MAESTRAS
  radiusStyle = signal<RadiusStyle>((localStorage.getItem('erp_radius_style') as RadiusStyle) || 'medium');
  glassStyle = signal<GlassStyle>((localStorage.getItem('erp_glass_style') as GlassStyle) || 'soft');

  isLoading = signal(false);
  private minTime = 500; 
  private startTime = 0;

  readonly themes: AppTheme[] = [
    // --- CORPORATIVOS ---
    { id: 'ocean',    name: 'Ocean',    type: 'corporate',   colors: { primary: '#0284C7', secondary: '#38BDF8', tertiary: '#0369A1', quaternary: '#0C1A2E', success: '#10B981', danger: '#F87171' } },
    { id: 'emerald',  name: 'Emerald',  type: 'corporate',   colors: { primary: '#047857', secondary: '#34D399', tertiary: '#065F46', quaternary: '#001A0A', success: '#10B981', danger: '#F87171' } },
    { id: 'midnight', name: 'Midnight', type: 'corporate',   colors: { primary: '#3730A3', secondary: '#818CF8', tertiary: '#312E81', quaternary: '#0D0B2A', success: '#34D399', danger: '#FB7185' } },
    { id: 'graphite', name: 'Graphite', type: 'corporate',   colors: { primary: '#334155', secondary: '#22D3EE', tertiary: '#64748B', quaternary: '#0F172A', success: '#10B981', danger: '#F87171' } },
    { id: 'prestige', name: 'Prestige', type: 'corporate',   colors: { primary: '#1E3A5F', secondary: '#F59E0B', tertiary: '#1E40AF', quaternary: '#0A1628', success: '#16A34A', danger: '#EF4444' } },

    // --- VIBRANTES & DUALES ---
    { id: 'cyber',     name: 'Cyberpunk', type: 'dual', colors: { primary: '#D946EF', secondary: '#22D3EE', tertiary: '#A855F7', quaternary: '#1A0330', success: '#2DD4BF', danger: '#F43F5E' } },
    { id: 'matrix',    name: 'Matrix',    type: 'dual', colors: { primary: '#22C55E', secondary: '#86EFAC', tertiary: '#FDE047', quaternary: '#001A08', success: '#4ADE80', danger: '#FB7185' } },
    { id: 'amethyst',  name: 'Amethyst',  type: 'dual', colors: { primary: '#A855F7', secondary: '#2DD4BF', tertiary: '#F472B6', quaternary: '#14053A', success: '#2DD4BF', danger: '#F43F5E' } },
    { id: 'sunset',    name: 'Sunset',    type: 'dual', colors: { primary: '#F97316', secondary: '#FBBF24', tertiary: '#EA580C', quaternary: '#1C0A00', success: '#84CC16', danger: '#EF4444' } },
    { id: 'ember',     name: 'Ember',     type: 'dual', colors: { primary: '#EA580C', secondary: '#FDE047', tertiary: '#C2410C', quaternary: '#1C0500', success: '#84CC16', danger: '#EF4444' } },
    { id: 'aurora',    name: 'Aurora',    type: 'dual', colors: { primary: '#10B981', secondary: '#818CF8', tertiary: '#A855F7', quaternary: '#00100A', success: '#34D399', danger: '#FB7185' } },
    { id: 'synthwave', name: 'Synthwave', type: 'dual', colors: { primary: '#EC4899', secondary: '#38BDF8', tertiary: '#A855F7', quaternary: '#180830', success: '#14B8A6', danger: '#F43F5E' } },
    { id: 'tropic',    name: 'Tropic',    type: 'dual', colors: { primary: '#22D3EE', secondary: '#A3E635', tertiary: '#FB923C', quaternary: '#001A1E', success: '#A3E635', danger: '#EF4444' } },
    { id: 'plasma',    name: 'Plasma',    type: 'dual', colors: { primary: '#818CF8', secondary: '#F472B6', tertiary: '#FBBF24', quaternary: '#08082A', success: '#10B981', danger: '#F43F5E' } },
    { id: 'supernova', name: 'Supernova', type: 'dual', colors: { primary: '#9333EA', secondary: '#F472B6', tertiary: '#2DD4BF', quaternary: '#0F0520', success: '#2DD4BF', danger: '#F43F5E' } },
    { id: 'cosmic',    name: 'Cosmic',    type: 'dual', colors: { primary: '#7C3AED', secondary: '#F472B6', tertiary: '#22D3EE', quaternary: '#0A0520', success: '#2DD4BF', danger: '#FB7185' } },
    { id: 'rose_gold', name: 'Rose Gold', type: 'dual', colors: { primary: '#EC4899', secondary: '#FBBF24', tertiary: '#DB2777', quaternary: '#1E0515', success: '#10B981', danger: '#EF4444' } },

    // --- MINIMALISTAS ---
    { id: 'nordic',   name: 'Nordic Ice',  type: 'independent', colors: { primary: '#0369A1', secondary: '#7DD3FC', tertiary: '#38BDF8', quaternary: '#0C1A2E', success: '#2DD4BF', danger: '#FB7185' } },
    { id: 'berry',    name: 'Wild Berry',  type: 'independent', colors: { primary: '#9D174D', secondary: '#A855F7', tertiary: '#BE185D', quaternary: '#1A0520', success: '#10B981', danger: '#FB923C' } },
    { id: 'coffee',   name: 'Macchiato',   type: 'independent', colors: { primary: '#92400E', secondary: '#F59E0B', tertiary: '#78350F', quaternary: '#1C0A00', success: '#65A30D', danger: '#EF4444' } },
    { id: 'lavender', name: 'Lavender',    type: 'independent', colors: { primary: '#5B21B6', secondary: '#A78BFA', tertiary: '#4C1D95', quaternary: '#120828', success: '#34D399', danger: '#FB7185' } },
    { id: 'jade',     name: 'Jade',        type: 'independent', colors: { primary: '#065F46', secondary: '#34D399', tertiary: '#064E3B', quaternary: '#001810', success: '#10B981', danger: '#F87171' } },
  ];

  activeTheme = signal<AppTheme>(this.getSavedTheme());

  constructor() {
    effect(() => {
      const body = this.document.body; 
      const theme = this.activeTheme();
      const isDark = this.darkMode();
      
      // 1. Clases de Modo
      if (isDark) body.classList.add('dark-mode');
      else body.classList.remove('dark-mode');

      // 2. Lógica de Atmósfera (Fondo)
      let bgColor = isDark ? '#080E1C' : '#F4F7FA';
      if (!isDark && this.bgStyle() === 'tinted') {
        bgColor = `color-mix(in srgb, ${theme.colors.primary} 3%, #F4F7FA)`;
      } else if (this.bgStyle() === 'deep') {
        bgColor = isDark ? '#030609' : '#E2E8F0';
      }
      body.style.setProperty('--erp-bg', bgColor);

      // 3. Lógica de Geometría (escala completa de radios)
      const radMaps: Record<RadiusStyle, Record<string, string>> = {
        sharp:  { sm: '2px',  md: '2px',  lg: '4px',  xl: '6px',  pill: '6px'  },
        medium: { sm: '6px',  md: '8px',  lg: '12px', xl: '16px', pill: '50px' },
        round:  { sm: '10px', md: '20px', lg: '30px', xl: '40px', pill: '50px' },
      };
      const r = radMaps[this.radiusStyle()];
      body.style.setProperty('--rad-sm',   r['sm']);
      body.style.setProperty('--rad-md',   r['md']);
      body.style.setProperty('--rad-lg',   r['lg']);
      body.style.setProperty('--rad-xl',   r['xl']);
      body.style.setProperty('--rad-pill', r['pill']);

      // 4. Lógica de Profundidad (Glassmorphism)
      const glassMap = { none: '0px', soft: '12px', strong: '24px' };
      body.style.setProperty('--erp-glass-blur', glassMap[this.glassStyle()]);

      // 5. Inyección de Colores Estéticos
      body.style.setProperty('--erp-primary', theme.colors.primary);
      body.style.setProperty('--erp-primary-rgb', this.hexToRgb(theme.colors.primary));
      body.style.setProperty('--erp-secondary', theme.colors.secondary);
      body.style.setProperty('--erp-secondary-rgb', this.hexToRgb(theme.colors.secondary));
      body.style.setProperty('--erp-tertiary', theme.colors.tertiary);
      body.style.setProperty('--erp-tertiary-rgb', this.hexToRgb(theme.colors.tertiary));
      body.style.setProperty('--erp-quaternary', theme.colors.quaternary);
      body.style.setProperty('--erp-quaternary-rgb', this.hexToRgb(theme.colors.quaternary));

      // 6. Inyección de Colores Funcionales (Finanzas)
      body.style.setProperty('--erp-success', theme.colors.success);
      body.style.setProperty('--erp-success-rgb', this.hexToRgb(theme.colors.success));
      body.style.setProperty('--erp-danger', theme.colors.danger);
      body.style.setProperty('--erp-danger-rgb', this.hexToRgb(theme.colors.danger));

      // 7. Sidebar gradient (quaternary = siempre el color más oscuro del tema)
      body.style.setProperty('--erp-sidebar-top', theme.colors.quaternary);
      body.style.setProperty('--erp-sidebar-bottom', theme.colors.quaternary);

      // Guardado Local
      localStorage.setItem('erp_theme_id', theme.id);
      localStorage.setItem('erp_dark_mode', String(isDark));
      localStorage.setItem('erp_bg_style', this.bgStyle());
      localStorage.setItem('erp_radius_style', this.radiusStyle());
      localStorage.setItem('erp_glass_style', this.glassStyle());
    });
  }

  private getSavedTheme(): AppTheme {
    const savedId = localStorage.getItem('erp_theme_id');
    return this.themes.find(t => t.id === savedId) || this.themes[0];
  }

  private hexToRgb(hex: string): string {
    if (/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)) {
      let chars = hex.substring(1).split('');
      if (chars.length === 3) {
        chars = [chars[0], chars[0], chars[1], chars[1], chars[2], chars[2]];
      }
      const num = parseInt('0x' + chars.join(''), 16);
      return [(num >> 16) & 255, (num >> 8) & 255, num & 255].join(', ');
    }
    return '59, 130, 246';
  }

  toggleSidebar() { this.sidebarOpen.update(v => !v); }
  toggleSettings() { this.settingsOpen.update(v => !v); }
  toggleDarkMode() { this.darkMode.update(v => !v); }
  setTheme(themeId: string) { const selected = this.themes.find(t => t.id === themeId); if (selected) this.activeTheme.set(selected); }
  setBgStyle(style: BgStyle) { this.bgStyle.set(style); }
  setRadiusStyle(style: RadiusStyle) { this.radiusStyle.set(style); }
  setGlassStyle(style: GlassStyle) { this.glassStyle.set(style); }
  showLoader() { this.startTime = Date.now(); setTimeout(() => { this.isLoading.set(true); }, 0); }
  hideLoader() { const diff = Date.now() - this.startTime; const wait = this.minTime - diff; setTimeout(() => { this.isLoading.set(false); }, wait > 0 ? wait : 0); }
}