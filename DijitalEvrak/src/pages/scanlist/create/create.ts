import { ChangeDetectionStrategy, Component, inject, ViewEncapsulation } from '@angular/core';
import GenericModel from '../../../../components/generic-model/generic-model';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { FlexiToastService } from 'flexi-toast';
import { CommonModule } from '@angular/common';

@Component({
  imports: [
    GenericModel,
    ReactiveFormsModule,
    CommonModule
  ],
  templateUrl: './create.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export default class ScanlistAdd {
  readonly #toast = inject(FlexiToastService);

  uploadForm: FormGroup;
  selectedFile: File | null = null;
  selectedFileName = '';

    constructor(private fb: FormBuilder, private http: HttpClient) {
    this.uploadForm = this.fb.group({
      file: [null]
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFile = input.files[0];
      this.selectedFileName = this.selectedFile.name;
      this.uploadForm.patchValue({ file: this.selectedFile });
    }
  }

  onSubmit(){
        this.#toast.showToast("Başarılı", "Dosya Başarıyla Yüklendi", "success");
       if (!this.selectedFile) return;
  } 

  onSubmit2() {
    if (!this.selectedFile) return;

    const formData = new FormData();
    formData.append('file', this.selectedFile, this.selectedFile.name);
 

    //pipe take until destroy -> dispose ediyor ...
    
    // upload 
    this.http.post('http://localhost:3000/upload', formData)
      .subscribe({
        next: (res) => {
          console.log('Yükleme başarılı', res);
          this.uploadForm.reset();
          this.selectedFile = null;
          this.selectedFileName = '';
        },
        error: (err) => console.error('Yükleme hatası', err)
      });
  }
}


