import { Injectable } from '@angular/core';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

@Injectable({ providedIn: 'root' })
export class ExcelGeneratorService {

  constructor() {}

  // ==========================================
  // 1. REPORTE OPERATIVO (Parte Diario)
  // (Este es el que te faltaba y daba error)
  // ==========================================
  async exportarParteDiario(data: any[]) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Reporte de Operaciones', { views: [{ showGridLines: false }] });
    
    sheet.columns = [
      { header: 'FECHA', key: 'fecha', width: 12 },
      { header: 'PLACA', key: 'placa', width: 15 },
      { header: 'MODELO', key: 'modelo', width: 25 },
      { header: 'OPERADOR', key: 'operador', width: 30 },
      { header: 'LABOR', key: 'labor', width: 20 },
      { header: 'CAMPO / UBICACIÓN', key: 'campo', width: 25 },
      { header: 'H. INICIO', key: 'h_ini', width: 12 },
      { header: 'H. FIN', key: 'h_fin', width: 12 },
      { header: 'TOTAL HRS', key: 'total', width: 15 },
      { header: 'OBSERVACIONES', key: 'obs', width: 40 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.height = 30;
    
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A66C2' } }; // Azul Montero
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11, name: 'Arial' };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
    });

    data.forEach(item => {
      const row = sheet.addRow({
        fecha: item.fecha ? item.fecha.toString().split('T')[0] : '-',
        placa: item.placa,
        modelo: item.marca_modelo,
        operador: item.operador_nombre,
        labor: item.nombre_labor,
        campo: item.nombre_ubicacion,
        h_ini: item.hora_inicio || '-',
        h_fin: item.hora_fin || '-',
        total: Number(item.total_horas),
        obs: item.observaciones
      });

      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const fecha = new Date().toISOString().split('T')[0];
    saveAs(new Blob([buffer]), `Reporte_Maquinaria_${fecha}.xlsx`);
  }

  // ==========================================
  // 2. REPORTE GERENCIAL (Combustible)
  // (Este es el nuevo para el módulo de reportes)
  // ==========================================
  async exportarReporteCombustible(resumen: any[], detalle: any[], rango: string) {
    const workbook = new ExcelJS.Workbook();
    
    // --- HOJA 1: RESUMEN ---
    const sheet1 = workbook.addWorksheet('Resumen Eficiencia', { views: [{ showGridLines: false }] });
    
    sheet1.columns = [
      { header: 'MÁQUINA', key: 'placa', width: 15 },
      { header: 'MODELO', key: 'modelo', width: 25 },
      { header: 'CARGAS', key: 'num', width: 12 },
      { header: 'GALONES', key: 'gal', width: 15 },
      { header: 'COSTO S/', key: 'dinero', width: 15 },
      { header: 'RECORRIDO (Hr)', key: 'recorrido', width: 18 },
      { header: 'RENDIMIENTO (Gl/Hr)', key: 'rendimiento', width: 20 },
    ];

    const headerRow1 = sheet1.getRow(1);
    headerRow1.height = 25;
    headerRow1.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E7D32' } }; // Verde
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    resumen.forEach(item => {
      sheet1.addRow({
        placa: item.placa,
        modelo: item.marca_modelo,
        num: item.num_tanqueos,
        gal: Number(item.total_galones),
        dinero: Number(item.total_dinero),
        recorrido: Number(item.recorrido_periodo),
        rendimiento: Number(item.consumo_promedio)
      });
    });

    // --- HOJA 2: DETALLE ---
    const sheet2 = workbook.addWorksheet('Kardex Detallado');
    
    sheet2.columns = [
      { header: 'FECHA', key: 'fecha', width: 18 },
      { header: 'UNIDAD', key: 'placa', width: 15 },
      { header: 'HORÓMETRO', key: 'horometro', width: 15 },
      { header: 'GALONES', key: 'gal', width: 12 },
      { header: 'PRECIO', key: 'precio', width: 12 },
      { header: 'TOTAL S/', key: 'total', width: 15 },
      { header: 'FULL', key: 'full', width: 10 },
      { header: 'LUGAR', key: 'lugar', width: 30 },
      { header: 'RESPONSABLE', key: 'resp', width: 25 },
    ];

    const headerRow2 = sheet2.getRow(1);
    headerRow2.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A66C2' } }; // Azul
      cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    });

    detalle.forEach(item => {
      sheet2.addRow({
        fecha: item.fecha_hora,
        placa: item.placa,
        horometro: Number(item.horometro_al_tanquear),
        gal: Number(item.galones),
        precio: Number(item.precio_por_galon),
        total: Number(item.total_dinero),
        full: item.es_tanque_lleno ? 'SI' : 'NO',
        lugar: item.ubicacion_tanqueo,
        resp: item.responsable
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `Reporte_Combustible_${rango}.xlsx`);
  }
}