import { Injectable } from '@angular/core';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { DatePipe } from '@angular/common';

@Injectable({ providedIn: 'root' })
export class PdfGeneratorService {

  constructor() {}

  // ===========================================================================
  // 1. REPORTE OPERATIVO (Parte Diario)
  // ===========================================================================
  generarReporteParteDiario(datos: any[]) {
    const doc = new jsPDF();
    const fechaHoy = new Date().toLocaleDateString();

    this.dibujarCabecera(doc, 'REPORTE OPERATIVO - MAQUINARIA', { inicio: 'Hoy', fin: 'Hoy' }, fechaHoy);

    const columnas = ['FECHA', 'MÁQUINA', 'OPERADOR', 'LABOR / CAMPO', 'H. INICIO', 'H. FIN', 'TOTAL'];
    const filas = datos.map(item => [
      item.fecha ? item.fecha.split('T')[0] : '-',
      `${item.placa}\n${item.marca_modelo}`,
      item.operador_nombre || item.operador,
      `${item.nombre_labor}\n${item.nombre_ubicacion}`,
      item.hora_inicio || '-',
      item.hora_fin || '-',
      item.total_horas + ' hrs'
    ]);

    autoTable(doc, {
      head: [columnas],
      body: filas,
      startY: 45,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 3, valign: 'middle' },
      headStyles: { fillColor: [10, 102, 194], textColor: 255, fontStyle: 'bold', halign: 'center' },
      columnStyles: {
        0: { cellWidth: 20 }, 
        6: { halign: 'right', fontStyle: 'bold' }
      }
    });

    this.numerarPaginas(doc);
    doc.save(`Parte_Diario_${Date.now()}.pdf`);
  }

  // ===========================================================================
  // 2. REPORTE GERENCIAL (Resumen Flota/Clientes)
  // ===========================================================================
  generarReporteGerencial(rango: { inicio: string, fin: string }, dataMaquinas: any[], dataClientes: any[]) {
    const doc = new jsPDF();
    const fechaEmision = new Date().toLocaleDateString();

    // --- PÁGINA 1: RESUMEN POR MAQUINARIA ---
    this.dibujarCabecera(doc, 'RESUMEN GERENCIAL - FLOTA', rango, fechaEmision);

    const colsMaq = ['Máquina', 'Modelo', 'Días Trab.', 'Horas', 'Avance', 'Ingreso Total'];
    const filasMaq = dataMaquinas.map(m => [
      m.placa, 
      m.marca_modelo, 
      m.dias_trabajados, 
      m.total_horas + ' hrs', 
      m.total_avance || '-', 
      'S/ ' + Number(m.ingreso_total).toFixed(2)
    ]);

    const totalDinero = dataMaquinas.reduce((sum, m) => sum + Number(m.ingreso_total), 0);

    autoTable(doc, {
      head: [colsMaq],
      body: filasMaq,
      startY: 45,
      theme: 'grid',
      headStyles: { fillColor: [10, 102, 194], fontStyle: 'bold' },
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
      foot: [['TOTAL GENERAL', '', '', '', '', 'S/ ' + totalDinero.toFixed(2)]],
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', halign: 'right' }
    });

    // --- PÁGINA 2: RESUMEN POR CLIENTE ---
    doc.addPage();
    this.dibujarCabecera(doc, 'ESTADO DE CUENTA - AGRICULTORES', rango, fechaEmision);

    const colsCli = ['Cliente / Fundo', 'Horas Consumidas', 'Facturable', 'Canje Cosecha', 'Deuda Total'];
    const filasCli = dataClientes.map(c => [
      c.cliente,
      c.total_horas + ' hrs',
      'S/ ' + Number(c.deuda_facturable).toFixed(2),
      'S/ ' + Number(c.deuda_canje).toFixed(2),
      'S/ ' + Number(c.deuda_total).toFixed(2)
    ]);

    const totalDeuda = dataClientes.reduce((sum, c) => sum + Number(c.deuda_total), 0);

    autoTable(doc, {
      head: [colsCli],
      body: filasCli,
      startY: 45,
      theme: 'striped',
      headStyles: { fillColor: [34, 139, 34] }, // Verde
      columnStyles: { 4: { halign: 'right', fontStyle: 'bold', textColor: [200, 50, 50] } },
      foot: [['TOTAL POR COBRAR', '', '', '', 'S/ ' + totalDeuda.toFixed(2)]],
      footStyles: { fillColor: [240, 240, 240], textColor: 0, fontStyle: 'bold', halign: 'right' }
    });

    this.numerarPaginas(doc);
    doc.save(`Reporte_Gerencial_${rango.inicio}.pdf`);
  }

  // ===========================================================================
  // 3. REPORTE COMBUSTIBLE
  // ===========================================================================
  generarReporteCombustible(rango: { inicio: string, fin: string }, resumen: any[], detalle: any[]) {
    const doc = new jsPDF();
    const fechaEmision = new Date().toLocaleDateString();

    // Título
    this.dibujarCabecera(doc, 'CONTROL DE COMBUSTIBLE Y RENDIMIENTO', rango, fechaEmision);

    // 1. TABLA RESUMEN (KPIs)
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text('1. RENDIMIENTO POR UNIDAD', 14, 50);

    const colsRes = ['Unidad', 'Modelo', 'Cargas', 'Galones', 'S/ Total', 'Recorrido', 'Rendimiento'];
    const rowsRes = resumen.map(r => [
      r.placa,
      r.marca_modelo,
      r.num_tanqueos,
      Number(r.total_galones).toFixed(2),
      'S/ ' + Number(r.total_dinero).toFixed(2),
      Number(r.recorrido_periodo).toFixed(2) + ' hr',
      Number(r.consumo_promedio).toFixed(2) + ' gl/h' // El dato más importante
    ]);

    autoTable(doc, {
      head: [colsRes],
      body: rowsRes,
      startY: 55,
      theme: 'striped',
      headStyles: { fillColor: [46, 125, 50] }, // Verde oscuro
      columnStyles: { 
        6: { fontStyle: 'bold', halign: 'right', textColor: [0, 0, 0] }, // Rendimiento
        4: { halign: 'right' }
      }
    });

    // 2. TABLA DETALLE
    // Calculamos dónde terminó la tabla anterior para no sobreponer
    const finalY = (doc as any).lastAutoTable.finalY + 15;
    
    // Si no hay mucho espacio, saltamos de página
    if (finalY > 250) { 
        doc.addPage(); 
        // Si saltamos, reiniciamos la Y para escribir el título
        doc.text('2. DETALLE CRONOLÓGICO DE ABASTECIMIENTOS', 14, 20);
    } else {
        doc.text('2. DETALLE CRONOLÓGICO DE ABASTECIMIENTOS', 14, finalY);
    }

    const colsDet = ['Fecha', 'Unidad', 'Horómetro', 'Galones', 'Precio', 'Total', 'Lugar'];
    const rowsDet = detalle.map(d => [
      d.fecha_hora ? d.fecha_hora.substring(0, 16).replace('T', ' ') : '-',
      d.placa,
      d.horometro_al_tanquear,
      d.galones,
      d.precio_por_galon,
      d.total_dinero,
      d.ubicacion_tanqueo
    ]);

    // Calculamos el inicio de la segunda tabla
    const startYTable2 = finalY > 250 ? 25 : finalY + 5;

    autoTable(doc, {
      head: [colsDet],
      body: rowsDet,
      startY: startYTable2,
      theme: 'grid',
      headStyles: { fillColor: [10, 102, 194] },
      styles: { fontSize: 8 },
      // Dibujar línea inferior en cada celda del cuerpo
      didDrawCell: (data) => {
        if (data.section === 'body' && data.row.index < data.table.body.length - 1) {
            const d = data.doc;
            d.setDrawColor(230, 230, 230);
            d.setLineWidth(0.1);
            d.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
        }
      }
    });

    this.numerarPaginas(doc);
    doc.save(`Reporte_Combustible_${rango.inicio}.pdf`);
  }

  // ===========================================================================
  // 4. REPORTE DE PLANILLA (NUEVO)
  // ===========================================================================
  generarPlanilla(cabecera: any, detalles: any[]) {
    const doc = new jsPDF('l', 'mm', 'a4'); // 'l' = Landscape (Horizontal)
    const pipe = new DatePipe('en-US');
    const fechaImpresion = new Date().toLocaleString();

    // --- 1. CABECERA ---
    doc.setFontSize(18);
    doc.setTextColor(10, 102, 194); // Azul Montero
    doc.text('MONTERO LOGISTICS', 14, 15);

    doc.setFontSize(14);
    doc.setTextColor(60);
    doc.text('PLANILLA DE PAGOS', 14, 23);

    // Datos del Periodo
    doc.setFontSize(10);
    doc.setTextColor(100);
    const inicio = pipe.transform(cabecera.fecha_inicio, 'dd/MM/yyyy');
    const fin = pipe.transform(cabecera.fecha_fin, 'dd/MM/yyyy');
    
    doc.text(`DESCRIPCIÓN: ${cabecera.descripcion}`, 14, 30);
    doc.text(`PERIODO: Del ${inicio} al ${fin}`, 14, 35);
    doc.text(`FRECUENCIA: ${cabecera.tipo_pago}`, 14, 40);

    // Resumen a la derecha
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(`TOTAL NETO: S/ ${Number(cabecera.total_neto_pagar).toFixed(2)}`, 280, 20, { align: 'right' });
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Personal en planilla: ${detalles.length}`, 280, 26, { align: 'right' });

    // Línea divisoria
    doc.setDrawColor(200);
    doc.line(14, 45, 283, 45);

    // --- 2. TABLA DE DETALLES ---
    const columnas = [
      { header: 'N°', dataKey: 'index' },
      { header: 'COLABORADOR', dataKey: 'nombre' },
      { header: 'DNI', dataKey: 'dni' },
      { header: 'CARGO', dataKey: 'cargo' },
      { header: 'DÍAS', dataKey: 'dias' },
      { header: 'SUELDO REF.', dataKey: 'sueldo' },
      { header: 'BÁSICO', dataKey: 'basico' },
      { header: 'BONOS (+)', dataKey: 'bonos' },
      { header: 'ADELANTOS (-)', dataKey: 'adelantos' },
      { header: 'NETO PAGAR', dataKey: 'neto' },
      { header: 'FIRMA', dataKey: 'firma' },
    ];

    const filas = detalles.map((det, index) => ({
      index: index + 1,
      nombre: det.nombre_completo,
      dni: det.dni || '-', 
      cargo: det.nombre_cargo,
      dias: det.dias_asistidos,
      sueldo: Number(det.sueldo_base_pactado).toFixed(2),
      basico: Number(det.ingreso_basico).toFixed(2),
      bonos: Number(det.monto_bonificaciones).toFixed(2),
      adelantos: Number(det.monto_adelantos).toFixed(2),
      neto: `S/ ${Number(det.neto_pagar).toFixed(2)}`,
      firma: '' // Espacio vacío para firmar
    }));

    autoTable(doc, {
      body: filas,
      columns: columnas,
      startY: 50,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2, valign: 'middle' },
      headStyles: { 
        fillColor: [10, 102, 194], // Azul cabecera
        textColor: 255, 
        fontStyle: 'bold',
        halign: 'center'
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 }, // Index
        1: { cellWidth: 60 }, // Nombre
        4: { halign: 'center' }, // Días
        5: { halign: 'right' },
        6: { halign: 'right' },
        7: { halign: 'right', textColor: [40, 167, 69] }, // Verde para bonos
        8: { halign: 'right', textColor: [220, 53, 69] }, // Rojo para descuentos
        9: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] }, // Neto resaltado
        10: { cellWidth: 30 } // Espacio para firma
      },
      foot: [[
        { content: 'TOTAL GENERAL', colSpan: 9, styles: { halign: 'right', fontStyle: 'bold' } },
        { content: `S/ ${Number(cabecera.total_neto_pagar).toFixed(2)}`, styles: { halign: 'right', fontStyle: 'bold' } },
        ''
      ]]
    });

    // Pie de página
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Generado el: ${fechaImpresion}`, 14, 205);
      doc.text(`Página ${i} de ${pages}`, 280, 205, { align: 'right' });
    }

    doc.save(`Planilla_${cabecera.descripcion.replace(/\s/g, '_')}.pdf`);
  }

  // ==========================================
  // HELPERS PRIVADOS (Diseño)
  // ==========================================
  private dibujarCabecera(doc: jsPDF, titulo: string, rango: any, fecha: string) {
    doc.setFontSize(22);
    doc.setTextColor(10, 102, 194);
    doc.text('AUTOMOTORES TRUJILLO EIRL', 14, 20);

    doc.setFontSize(14);
    doc.setTextColor(60);
    doc.text(titulo, 14, 30);

    doc.setFontSize(10);
    doc.setTextColor(100);
    const inicio = rango.inicio || '-';
    const fin = rango.fin || '-';
    doc.text(`Periodo: ${inicio} al ${fin}`, 14, 38);
    
    doc.setFontSize(9);
    doc.text(`Emisión: ${fecha}`, 195, 20, { align: 'right' });
    doc.text('Generado por: Admin', 195, 25, { align: 'right' });

    doc.setDrawColor(200);
    doc.setLineWidth(0.5);
    doc.line(14, 40, 196, 40);
  }

  private numerarPaginas(doc: jsPDF) {
    const pages = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(180);
      doc.text('Carbon Grill - Informacion Confidencial', 14, 287);
      doc.text(`Página ${i} de ${pages}`, 190, 285, { align: 'right' });
    }
  }
}