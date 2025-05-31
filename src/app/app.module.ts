import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatSliderModule } from '@angular/material/slider';
import { MenuBarComponent } from './menu-bar/menu-bar.component';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { HttpClientModule } from '@angular/common/http';

import { OverviewComponent } from './overview/overview.component';
import { LibraryComponent } from './library/library.component';
import { EnginesComponent } from './engines/engines.component';
import { AggregatorsComponent } from './aggregators/aggregators.component';
import { SystemInformationComponent } from './system-information/system-information.component';
import { LoadingBarComponent } from './loading-bar/loading-bar.component';
import { WorkerDetailsDialogComponent } from './overview/worker-details-dialog/worker-details-dialog.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { EngineDetailDialogComponent } from './engine-detail-dialog/engine-detail-dialog.component';
import { GojsAngularModule } from 'gojs-angular';
import { EngineListComponent } from './engine-list/engine-list.component';
import { NewProcessInstanceDialogComponent } from './library/new-process-instance-dialog/new-process-instance-dialog.component'
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DeleteProcessDialogComponent } from './delete-process-dialog/delete-process-dialog.component';
import { ArtifactsComponent } from './artifacts/artifacts.component';
import { StakeholdersComponent } from './stakeholders/stakeholders.component';
import { ArtifactDetailComponent } from './artifact-detail/artifact-detail.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { StakeholderDetailComponent } from './stakeholder-detail/stakeholder-detail.component';
import { NewProcessGroupDialogComponent } from './new-process-group-dialog/new-process-group-dialog.component';
import { BpmnComponent } from './bpmn/bpmn.component';
import { AggregatedBpmnComponent } from './bpmn/aggregated-bpmn.component';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatChipsModule } from '@angular/material/chips';
import { ProcessTypeDetailsComponent } from './process-type-details/process-type-details.component';

@NgModule({
  declarations: [
    AppComponent,
    MenuBarComponent,
    OverviewComponent,
    LibraryComponent,
    EnginesComponent,
    AggregatorsComponent,
    SystemInformationComponent,
    LoadingBarComponent,
    WorkerDetailsDialogComponent,
    EngineDetailDialogComponent,
    EngineListComponent,
    NewProcessInstanceDialogComponent,
    DeleteProcessDialogComponent,
    ArtifactsComponent,
    StakeholdersComponent,
    ArtifactDetailComponent,
    NotificationsComponent,
    StakeholderDetailComponent,
    NewProcessGroupDialogComponent,
    BpmnComponent,
    AggregatedBpmnComponent,
    ProcessTypeDetailsComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    BrowserAnimationsModule,
    HttpClientModule,

    MatButtonModule,
    MatMenuModule,
    MatSliderModule,
    MatProgressBarModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatSnackBarModule,
    GojsAngularModule,
    ReactiveFormsModule,
    FormsModule,
    MatSlideToggleModule,
    MatGridListModule,
    MatChipsModule,
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
