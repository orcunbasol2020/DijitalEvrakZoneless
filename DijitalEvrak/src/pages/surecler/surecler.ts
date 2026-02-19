import { ChangeDetectionStrategy, Component, inject, OnInit, signal, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../components/generic-model/generic-model';
import { QRCodeComponent } from 'angularx-qrcode';
import { DocumentService } from '../../services/document';
import { Router } from '@angular/router';
import { DocumentDetail } from '../../services/document-detail';

@Component({
  imports: [
    GenericModel,
    QRCodeComponent
  ],
  templateUrl: './surecler.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class Surecler implements OnInit {
  doc = signal<string>('');
  id!: string | null;
  ocrVisible = signal(true);

  private documentService = inject(DocumentService);
  //private documentDetail = inject(DocumentDetail);
  private router = inject(Router);

  ngOnInit(): void {
    this.id = this.documentService.currentDocumentId;

    if (!this.id) {
      this.router.navigate(['/scanlist']);
      return;
    }

    this.getir(this.id);

    //console.log(this.doc);
  }


  getir(id: string) {
    this.documentService.getDocumentById(id).subscribe(docs => {     
      if (!docs) return;
       console.log(docs.id);
      this.doc.set(docs.id);

      if(id == "0e73004e-f243-414e-86eb-77cc21dc7456")
        this.ocrVisible.set(false);
    })
  }

}
