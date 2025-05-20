import { AfterViewInit, Component, ViewChild } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { LoadingService } from '../loading.service';
import { NewProcessInstanceDialogComponent } from './new-process-instance-dialog/new-process-instance-dialog.component';
import { StorageServiceService } from '../storage-service.service';
import { SupervisorService } from '../supervisor.service';
import { Process, ProcessGroup } from '../primitives/primitives';
import { NewProcessGroupDialogComponent } from '../new-process-group-dialog/new-process-group-dialog.component';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ProcessTypeDetailsComponent } from '../process-type-details/process-type-details.component';

const MODULE_STORAGE_KEY = 'process_library'

@Component({
  selector: 'app-library',
  templateUrl: './library.component.html',
  styleUrls: ['./library.component.scss']
})

export class LibraryComponent implements AfterViewInit {
  displayedColumns: string[] = ['type', 'description', 'button', 'details_button'];
  dataSource = new MatTableDataSource<Process>([]);
  eventSubscription: any
  isProcessGroupDetailsFound = false
  processGroupDetails = {} as ProcessGroup

  constructor(public dialog: MatDialog, private snackBar: MatSnackBar, private supervisorService: SupervisorService, private storageService: StorageServiceService, private loadingService: LoadingService) {
    if (this.storageService.hasKey(MODULE_STORAGE_KEY)) {
      this.eventSubscription = this.storageService.getSubject(MODULE_STORAGE_KEY).subscribe((update: any) => {
        this.applyUpdate(update)
      })
      this.storageService.triggerUpdate(MODULE_STORAGE_KEY)
    }
    else {
      loadingService.setLoadningState(true)
      this.storageService.addValue(MODULE_STORAGE_KEY, this.supervisorService.LibraryEventEmitter)
      this.eventSubscription = this.storageService.getSubject(MODULE_STORAGE_KEY).subscribe((update: any) => {
        this.applyUpdate(update)
      })
      var payload = {
        type: 'process_type_list'
      }
      this.supervisorService.requestUpdate(MODULE_STORAGE_KEY, payload)
    }
  }

  @ViewChild(MatPaginator) paginator: MatPaginator;

  ngAfterViewInit() {
    this.dataSource.paginator = this.paginator;
  }

  ngOnDestroy() {
    this.eventSubscription.unsubscribe()
  }

  applyUpdate(update: any) {
    this.snackBar.dismiss()
    this.loadingService.setLoadningState(false)
    if (update['type'] == 'process_type_list') {
      this.dataSource.data = update['process_types']
    }
    else if (update['type'] == 'get_process_group') {
      if (update['result'] == 'found') {
        this.processGroupDetails = update['process_group'] as ProcessGroup
        this.isProcessGroupDetailsFound = true
      }
      else if (update['result'] == 'not_found') {
        this.isProcessGroupDetailsFound = false
        this.snackBar.open(`Process group not found`, "Hide", { duration: 2000 });
      }
    }
  }

  /**
   * Opens a NewProcessInstanceDialogComponent where the user can provide details of the new Process instance
   * @param process_type_name Name of the process type requested to create
   */
  openNewProcessInstanceDialog(process_type_name: string) {
    this.dialog.open(NewProcessInstanceDialogComponent, {
      width: '1000px',
      data: {
        process_type_name: process_type_name,
      }
    });
  }

  /**
   * Opens a ProcessTypeDetailsComponent dialog, where details and statistics about the process type is visible
   * @param process_type_name Name of the Process Type
   */
  openProcessDetailsDialog(process_type_name: string) {
    this.dialog.open(ProcessTypeDetailsComponent, {
      width: '95%',
      height: '95%',
      data: {
        process_type_name: process_type_name,
      }
    });
  }

  /**
   * Opens a NewProcessGroupDialogComponent dialog, where the user can provide the name and membership rules of the new process
   */
  onDefineProcessGroup() {
    this.dialog.open(NewProcessGroupDialogComponent, {
      width: '650px',
      data: {
      }
    });
  }

  /**
   * Initiates a search on the backend for the specified Process Group
   * @param groupName Name of the requested Process Group
   */
  onProcessGroupSearch(groupName: string) {
    this.snackBar.dismiss()
    if (groupName.length == 0) {
      this.snackBar.open(`Please provide all necessary arguments!`, "Hide", { duration: 2000 });
    }
    else {
      var payload = {
        type: 'get_process_group',
        process_goup_id: groupName
      }
      this.supervisorService.requestUpdate(MODULE_STORAGE_KEY, payload)
    }
  }
}