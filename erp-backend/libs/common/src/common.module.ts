import { Module } from '@nestjs/common';
import { CommonService } from './common.service';
import { ExcelService } from './excel.service';
import { PdfService } from './pdf.service';
import { UploadService } from './upload/upload.service';

@Module({
  providers: [CommonService, PdfService, ExcelService, UploadService],
  exports: [CommonService, PdfService, ExcelService, UploadService],
})
export class CommonModule {}
